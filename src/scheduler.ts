import { setTimeout as sleep } from "node:timers/promises";
import {
  modelsForProvider,
  type Defaults,
  type Provider,
  type Role,
} from "./config.ts";
import { labels, type Issue, type Ranker } from "./policy.ts";
import { modelMatches, type Quotas } from "./quota.ts";

const SLACK_MS = 60_000;
const RECHECK_MS = 30 * 60_000;
const clock = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

// Time as the run loop sees it; tests swap it for one that moves only when waited on.
export interface Clock {
  now(): number;
  wait(ms: number, signal?: AbortSignal): Promise<void>;
}
export const realClock: Clock = {
  now: () => Date.now(),
  wait: (ms, signal) => sleep(ms, undefined, { signal }).catch(() => {}),
};

// A provider held for one stage, from pick until release(); a quota stop aborts `signal`.
export interface Reservation {
  provider: Provider;
  model: string;
  signal: AbortSignal;
  release(): void;
}

export interface SchedulerOptions {
  config: Defaults;
  quotas: Quotas;
  ranker?: Ranker;
  clock?: Clock;
}

// What the run loop asks: may this issue start, which provider does a stage get, when to try again.
export class Scheduler {
  config: Defaults;
  ranker?: Ranker;
  clock: Clock;
  private held = new Map<Reservation, AbortController>();
  private current!: Quotas;
  constructor({ config, quotas, ranker, clock }: SchedulerOptions) {
    this.config = config;
    this.ranker = ranker;
    this.clock = clock ?? { ...realClock };
    this.quotas = quotas;
  }
  get quotas(): Quotas {
    return this.current;
  }
  set quotas(quotas: Quotas) {
    this.current = quotas;
    quotas.onStop = (provider, model, reason) => {
      for (const [held, controller] of this.held)
        if (
          held.provider === provider &&
          (model === undefined || held.model === model)
        )
          controller.abort(new Error(reason));
    };
  }
  // Reservations of a provider, across roles.
  running(provider: Provider): number {
    return [...this.held.keys()].filter((r) => r.provider === provider).length;
  }
  // The `parallel-safe` rule: an issue without the label runs alone and blocks other starts.
  admit(issue: Issue, running: Issue[]): boolean {
    const safe = (item: Issue) =>
      labels(item).includes(this.config.parallelLabel);
    return (
      running.length < this.config.maxParallelIssues &&
      (!running.length || (safe(issue) && running.every(safe)))
    );
  }
  pick(
    role: Role,
    issue: Issue,
    job?: { implementer?: Provider },
  ): Reservation | undefined {
    const model = (name: Provider) => this.config.roles[role].models[name];
    const usable = (name: Provider) =>
      this.config.providers.includes(name) &&
      this.quotas.available(name, model(name));
    let provider: Provider | undefined;
    const sticky = job?.implementer;
    if (sticky && role === "implementation" && usable(sticky))
      provider = sticky;
    else provider = this.ranked(role)[0];
    return provider && this.reserve(provider, model(provider));
  }
  reserve(provider: Provider, model: string): Reservation {
    const controller = new AbortController();
    const reservation: Reservation = {
      provider,
      model,
      signal: controller.signal,
      release: () => void this.held.delete(reservation),
    };
    this.held.set(reservation, controller);
    return reservation;
  }
  // When to try again once nothing can start (ms epoch), or none when nothing is stopped.
  wakeAt(): number | undefined {
    return this.wakePlan()?.at;
  }
  // The earliest reset of any stopped window plus slack, capped at a fixed recheck; `detail` is for the log.
  wakePlan(): { at: number; detail: string } | undefined {
    const now = this.clock.now();
    const recheck = now + RECHECK_MS;
    const q = this.quotas;
    const parts: string[] = [];
    let earliest = Infinity;
    const note = (provider: Provider, model: string | undefined) => {
      const reading = q.unverified.has(provider)
        ? undefined
        : q.values.get(provider);
      const windows = [
        reading?.fiveHour,
        reading?.weekly,
        ...Object.entries(reading?.weeklyByModel ?? {})
          .filter(
            ([label]) =>
              model === undefined || modelMatches(provider, label, model),
          )
          .map(([, window]) => window),
      ];
      const resets = windows.flatMap((w) =>
        w?.resetsAt && w.resetsAt * 1000 > now ? [w.resetsAt * 1000] : [],
      );
      const reset = Math.min(...resets);
      earliest = Math.min(earliest, reset);
      const reason = q.unverified.has(provider)
        ? "usage could not be verified"
        : model === undefined
          ? q.disabled.get(provider)
          : q.disabledModels.get(provider)?.get(model);
      parts.push(
        `${provider}${model ? ` (${model})` : ""}: ` +
          (resets.length
            ? `reset ${clock(reset)}`
            : `${reason}, recheck ${clock(recheck)}`),
      );
    };
    for (const provider of this.config.providers) {
      if (q.permanent.has(provider)) continue;
      if (q.disabled.has(provider)) note(provider, undefined);
      for (const model of q.disabledModels.get(provider)?.keys() ?? [])
        note(provider, model);
    }
    if (!parts.length) return undefined;
    const at = Math.min(earliest + SLACK_MS, recheck);
    return { at, detail: `sleeping until ${clock(at)} (${parts.join("; ")})` };
  }
  refresh(): Promise<void[]> {
    return this.quotas.refresh();
  }
  stop(): void {
    this.quotas.stop();
  }
  available(provider: Provider, role: Role): boolean {
    return this.quotas.available(
      provider,
      this.config.roles[role].models[provider],
    );
  }
  anyAvailable(): boolean {
    return this.config.providers.some((name) =>
      modelsForProvider(this.config, name).some((model) =>
        this.quotas.available(name, model),
      ),
    );
  }
  // Runs one stage under its reservation, polling quota while it runs; a failed poll stops every provider.
  async run<T>(
    reservation: Reservation,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    await this.refresh();
    reservation.signal.throwIfAborted();
    let rejectPoll!: (error: unknown) => void;
    const pollFailure = new Promise<never>((_, reject) => {
      rejectPoll = reject;
    });
    let poll: Promise<void> | undefined;
    let pollError: unknown;
    let pollFailed = false;
    const timer = setInterval(() => {
      poll = this.refresh().then(
        () => {},
        (error) => {
          pollFailed = true;
          pollError = error;
          rejectPoll(error);
          this.stop();
        },
      );
    }, this.config.pollIntervalMs);
    const running = action(reservation.signal);
    try {
      return await Promise.race([running, pollFailure]);
    } finally {
      // A poll can abort the action before its own failure reaches the race.
      clearInterval(timer);
      await poll;
      if (pollFailed) {
        // stop() already aborted the action; wait for its cleanup so the lock outlives it.
        await running.catch(() => {});
        throw pollError;
      }
    }
  }
  private ranked(role: Role): Provider[] {
    const candidates = this.config.providers.flatMap((provider) => {
      const model = this.config.roles[role].models[provider];
      const reading = this.quotas.values.get(provider);
      return reading && this.quotas.available(provider, model)
        ? [{ provider, model, reading, running: this.running(provider) }]
        : [];
    });
    return candidates.length < 2
      ? candidates.map((c) => c.provider)
      : // Without a ranker, configured provider order stands.
        (this.ranker?.({ candidates }) ?? candidates.map((c) => c.provider));
  }
}
