import type { Provider, Role } from "./config.ts";
import { labels, ready, type Issue } from "./policy.ts";
import type { Job } from "./runner.ts";
import { modelMatches, type Reading, type Window } from "./quota.ts";
import { clock, type Reservation, type Scheduler } from "./scheduler.ts";

interface Line {
  issue: Issue;
  stage: string;
  provider?: Provider;
  model?: string;
  why?: string;
}

// What the first fill would start, in the run loop's order; every reservation is released before returning.
export function planPass(
  scheduler: Scheduler,
  issues: Issue[],
  jobs: Record<number, Job | undefined>,
) {
  const { config } = scheduler;
  const order = (issue: Issue) =>
    jobs[issue.number]?.mergeFix ? 0 : jobs[issue.number] ? 1 : 2;
  const started: Issue[] = [];
  const lines: Line[] = [];
  const held: Reservation[] = [];
  let landing = 0;
  let heldByQuota = false;
  try {
    for (const issue of [...issues].sort((a, b) => order(a) - order(b))) {
      const job = jobs[issue.number];
      if (!ready(issue, config)) continue;
      if (job?.status === "approved" || job?.status === "landing") {
        landing++;
        continue;
      }
      const role: Role = job?.status === "review" ? "review" : "implementation";
      const stage = job?.mergeFix
        ? `${role} (merge fix round ${job.mergeFixRounds})`
        : job?.reviewRounds
          ? `${role} (round ${job.reviewRounds})`
          : role;
      const line: Line = { issue, stage };
      lines.push(line);
      if (!scheduler.admit(issue, started)) {
        const safe = (item: Issue) =>
          labels(item).includes(config.parallelLabel);
        const blockers = started.filter((item) => !safe(issue) || !safe(item));
        line.why =
          started.length >= config.maxParallelIssues
            ? "not started: no free slot"
            : `waits: not parallel-safe, ${blockers.map((i) => `#${i.number}`).join(", ")} running`;
        continue;
      }
      const reservation = scheduler.pick(role, issue, job);
      if (!reservation) {
        heldByQuota = true;
        line.why = config.providers
          .map((p) => `${p} stopped for ${config.roles[role].models[p]}`)
          .join(", ");
        continue;
      }
      held.push(reservation);
      started.push(issue);
      line.provider = reservation.provider;
      line.model = reservation.model;
    }
  } finally {
    for (const reservation of held) reservation.release();
  }
  // Like the run loop: it sleeps only with nothing started or landing and a stage held by quota.
  const wake =
    started.length || landing || !heldByQuota
      ? undefined
      : scheduler.wakePlan();
  return { lines, started, wake };
}

export function planJson(
  scheduler: Scheduler,
  pass: ReturnType<typeof planPass>,
) {
  const { quotas } = scheduler;
  return {
    quotas: Object.fromEntries(quotas.values),
    unavailable: Object.fromEntries(quotas.disabled),
    unavailableModels: Object.fromEntries(
      [...quotas.disabledModels].map(([provider, models]) => [
        provider,
        Object.fromEntries(models),
      ]),
    ),
    next: pass.lines.flatMap(({ issue, stage, provider, model }) =>
      provider
        ? [{ issue: issue.number, title: issue.title, stage, provider, model }]
        : [],
    ),
  };
}

export function planText(
  scheduler: Scheduler,
  pass: ReturnType<typeof planPass>,
): string {
  const { config, quotas } = scheduler;
  const now = scheduler.clock.now();
  const when = (ms: number) =>
    ms - now < 86_400_000
      ? clock(ms)
      : `${new Date(ms).toISOString().slice(5, 10)} ${clock(ms)}`;
  const resets = (w?: Window | null) =>
    w?.resetsAt ? ` (resets ${when(w.resetsAt * 1000)})` : "";
  const left = (name: string, w?: Window | null) =>
    w ? `${name} ${w.remainingPercent}% left${resets(w)}` : `${name} n/a`;
  // How a stop lifts, from its reason; the model (if any) picks the window a threshold is read from.
  const lift = (
    provider: Provider,
    reason: string,
    reading?: Reading,
    model?: string,
  ) => {
    const threshold = /^(fiveHour|weekly) remaining .*\(stop at (\d+)%\)/.exec(
      reason,
    );
    if (threshold) {
      const windows =
        threshold[1] === "fiveHour"
          ? [reading?.fiveHour]
          : [
              reading?.weekly,
              ...Object.entries(reading?.weeklyByModel ?? {})
                .filter(
                  ([label]) =>
                    model !== undefined && modelMatches(provider, label, model),
                )
                .map(([, w]) => w),
            ];
      const window = windows
        .filter((w): w is Window => !!w)
        .sort((a, b) => a.remainingPercent - b.remainingPercent)[0];
      return `lifts when a reading is above ${threshold[2]}%${resets(window)}`;
    }
    const held = /held until (\S+)$/.exec(reason);
    if (held) return `held until ${held[1]}`;
    if (quotas.unverified.has(provider)) return "recheck on next read";
    return "lifts when a reading allows it; recheck on next read";
  };
  const out = ["Providers"];
  for (const provider of config.providers) {
    const reading = quotas.values.get(provider);
    out.push(
      `  ${provider}: ` +
        (reading
          ? `${left("5h", reading.fiveHour)}, ${left("weekly", reading.weekly)}`
          : "usage unknown") +
        `, running ${scheduler.running(provider)}`,
    );
    const wide = quotas.disabled.get(provider);
    if (wide)
      out.push(
        `    stop ${provider}: ${wide}; ${lift(provider, wide, reading)}`,
      );
    for (const [model, reason] of quotas.disabledModels.get(provider) ?? [])
      out.push(
        `    stop ${provider} (${model}): ${reason}; ${lift(provider, reason, reading, model)}`,
      );
  }
  const holders = pass.started.map((i) => `#${i.number}`);
  out.push(
    "",
    "Slots",
    `  ${config.maxParallelIssues - holders.length} of ${config.maxParallelIssues} free` +
      (holders.length ? ` (held by ${holders.join(", ")})` : ""),
    "",
    `Next stages (ranking: ${config.ranking})`,
  );
  if (!pass.lines.length) out.push("  none");
  for (const { issue, stage, provider, model, why } of pass.lines)
    out.push(
      `  #${issue.number} ${issue.title}: ${stage} ` +
        (provider ? `→ ${provider} (${model})` : `— ${why}`),
    );
  out.push(
    "",
    pass.wake
      ? `Would ${pass.wake.detail.replace(/^sleeping/, "sleep")}`
      : "Would sleep: no",
  );
  return out.join("\n");
}
