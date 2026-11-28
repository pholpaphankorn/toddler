import { modelsForProvider } from "./config.ts";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { providers, type Defaults, type Provider } from "./config.ts";
import { adapter, codexRpc, command } from "./process.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Window {
  remainingPercent: number;
  resetsAt: number | null;
}
export interface Reading {
  observedAt: number;
  fiveHour: Window | null;
  weekly: Window | null;
  weeklyByModel: Record<string, Window>;
  // The provider's own yes/no on ordinary usage; null when it gives none.
  allowed: boolean | null;
}
interface CodexWindow {
  usedPercent: number;
  resetsAt: number | null;
  windowDurationMins?: number;
}
interface CodexBucket {
  limitId?: string;
  normalModelSlug?: string | null;
  primary?: CodexWindow | null;
  secondary?: CodexWindow | null;
}
export interface CodexRateLimits {
  ordinaryUsageAllowed?: boolean | null;
  rateLimits?: CodexBucket;
  rateLimitsByLimitId?: Record<string, CodexBucket>;
}
interface ClaudeLimit {
  kind: string;
  percent?: number | null;
  utilization?: number | null;
  resets_at?: string | null;
  scope?: { model?: { display_name?: string }; surface?: unknown } | null;
}
export interface ClaudeUsage {
  limits?: ClaudeLimit[] | null;
}
export type ReadUsage = (
  provider: Provider,
  config: Defaults,
) => Promise<Reading>;

export type StopCondition = (input: {
  provider: Provider;
  reading: Reading;
  models: string[];
}) => { reason: string; model?: string }[];
export class StopConditionError extends Error {}

export async function loadStopConditions(
  root: string,
  config: Defaults,
): Promise<StopCondition[]> {
  return Promise.all(
    config.stopConditions.map(async (name) => {
      let condition: StopCondition;
      try {
        const module = await import(pathToFileURL(resolve(root, name)).href);
        if (typeof module.default !== "function")
          throw new Error("default export must be a function");
        condition = module.default;
      } catch (error) {
        throw new StopConditionError(
          `Stop condition module ${name}: ${String((error as Error)?.message ?? error)}`,
        );
      }
      return (input) => {
        try {
          const result = condition(input);
          if (result instanceof Promise) void result.catch(() => {});
          if (
            !Array.isArray(result) ||
            Array.from(result).some(
              (stop) =>
                !stop ||
                typeof stop.reason !== "string" ||
                !stop.reason.trim() ||
                (stop.model !== undefined &&
                  !input.models.includes(stop.model)),
            )
          )
            throw new Error(
              "must return an array of stops with nonempty reasons and valid models synchronously",
            );
          return result;
        } catch (error) {
          throw new StopConditionError(
            `Stop condition module ${name}: ${String((error as Error)?.message ?? error)}`,
          );
        }
      };
    }),
  );
}

export function thresholdCondition(stopAt: Defaults["stopAt"]): StopCondition {
  return ({ provider, reading, models }) => {
    const thresholds = stopAt[provider];
    for (const name of ["fiveHour", "weekly"] as const) {
      const window = reading[name],
        threshold = thresholds[name];
      if (threshold && window && window.remainingPercent <= threshold)
        return [
          {
            reason: `${name} remaining ${window.remainingPercent}% (stop at ${threshold}%)`,
          },
        ];
    }
    const threshold = thresholds.weekly;
    return threshold
      ? models.flatMap((model) => {
          const remaining = weeklyLeft(reading, model, provider);
          return remaining <= threshold
            ? [
                {
                  model,
                  reason: `weekly remaining ${remaining}% (stop at ${threshold}%)`,
                },
              ]
            : [];
        })
      : [];
  };
}

export function allowedCondition(): StopCondition {
  return ({ provider, reading }) =>
    provider === "codex" && reading.allowed === false
      ? [{ reason: "provider reports ordinary usage not allowed" }]
      : [];
}

export function validateUsage(value: Reading, now = Date.now()): Reading {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isFinite(value.observedAt) ||
    value.observedAt > now + 5_000 ||
    now - value.observedAt > 60_000 ||
    !("fiveHour" in value) ||
    !("weekly" in value) ||
    !value.weeklyByModel ||
    typeof value.weeklyByModel !== "object" ||
    Array.isArray(value.weeklyByModel)
  )
    throw new Error(
      "Invalid quota reading; see README for the override JSON contract",
    );
  const window = (entry: Window | null): Window | null => {
    if (entry === null) return null;
    if (
      !entry ||
      !Number.isFinite(entry.remainingPercent) ||
      entry.remainingPercent < 0 ||
      entry.remainingPercent > 100 ||
      (entry.resetsAt !== null && !Number.isFinite(entry.resetsAt))
    )
      throw new Error(
        "Invalid quota window; see README for the override JSON contract",
      );
    return entry.resetsAt !== null && entry.resetsAt <= now / 1000
      ? { ...entry, remainingPercent: 100 }
      : entry;
  };
  return {
    observedAt: value.observedAt,
    allowed: typeof value.allowed === "boolean" ? value.allowed : null,
    fiveHour: window(value.fiveHour),
    weekly: window(value.weekly),
    weeklyByModel: Object.fromEntries(
      Object.entries(value.weeklyByModel).map(([key, entry]) => {
        const checked = window(entry);
        if (!checked) throw new Error("Invalid per-model quota window");
        return [key, checked];
      }),
    ),
  };
}
export function modelMatches(
  provider: Provider,
  label: string,
  model: string,
): boolean {
  return provider === "codex"
    ? label.toLowerCase() === model.toLowerCase()
    : !!label.trim() &&
        model
          .toLowerCase()
          .includes(label.trim().split(/\s+/)[0].toLowerCase());
}
export function weeklyLeft(
  reading: Reading,
  model: string,
  provider: Provider,
): number {
  return Math.min(
    reading.weekly?.remainingPercent ?? 100,
    ...Object.entries(reading.weeklyByModel)
      .filter(([label]) => modelMatches(provider, label, model))
      .map(([, window]) => window.remainingPercent),
  );
}
export function codexUsage(result: CodexRateLimits, now = Date.now()): Reading {
  const bucket =
    result.rateLimitsByLimitId?.codex ??
    (result.rateLimits?.limitId === "codex" ? result.rateLimits : undefined);
  if (!bucket) throw new Error("Codex quota bucket 'codex' was not returned");
  const find = (b: CodexBucket, duration: number): Window | null => {
    const entry = [b.primary, b.secondary].find(
      (w) =>
        w &&
        typeof w.windowDurationMins === "number" &&
        Math.abs(w.windowDurationMins - duration) <= duration * 0.05,
    );
    if (entry && !Number.isFinite(entry.usedPercent))
      throw new Error("Invalid Codex usage percentage");
    return entry
      ? { remainingPercent: 100 - entry.usedPercent, resetsAt: entry.resetsAt }
      : null;
  };
  const weeklyByModel: Record<string, Window> = {};
  for (const [id, b] of Object.entries(result.rateLimitsByLimitId ?? {})) {
    const weekly = find(b, 10080);
    if (id !== "codex" && b.normalModelSlug && weekly)
      weeklyByModel[b.normalModelSlug] = weekly;
  }
  return validateUsage(
    {
      observedAt: now,
      allowed:
        typeof result.ordinaryUsageAllowed === "boolean"
          ? result.ordinaryUsageAllowed
          : null,
      fiveHour: find(bucket, 300),
      weekly: find(bucket, 10080),
      weeklyByModel,
    },
    now,
  );
}
export function claudeUsage(result: ClaudeUsage, now = Date.now()): Reading {
  if (!Array.isArray(result.limits))
    throw new Error("Claude did not return limits");
  let fiveHour: Window | null = null,
    weekly: Window | null = null;
  const weeklyByModel: Record<string, Window> = {};
  for (const row of result.limits) {
    if (row.scope?.surface) continue;
    if (
      row.kind !== "session" &&
      row.kind !== "weekly_all" &&
      !(row.kind === "weekly_scoped" && row.scope?.model?.display_name)
    )
      continue;
    const percent = row.percent ?? row.utilization;
    if (percent == null) continue;
    if (!Number.isFinite(percent))
      throw new Error("Invalid Claude usage percentage");
    const window = {
      remainingPercent: 100 - percent,
      resetsAt: row.resets_at == null ? null : Date.parse(row.resets_at) / 1000,
    };
    if (row.kind === "session") fiveHour = window;
    else if (row.kind === "weekly_all") weekly = window;
    else if (row.kind === "weekly_scoped" && row.scope?.model?.display_name)
      weeklyByModel[row.scope.model.display_name] = window;
  }
  if (!weekly) throw new Error("Claude did not return weekly usage");
  return validateUsage(
    { observedAt: now, allowed: null, fiveHour, weekly, weeklyByModel },
    now,
  );
}
export async function claudeToken(): Promise<string> {
  const native = await nativeClaudeToken();
  if (native) return native;
  throw new Error("Claude subscription login unavailable; run toddler setup");
}
async function nativeClaudeToken(): Promise<string | undefined> {
  try {
    const raw = await command(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { timeout: 5_000 },
    );
    const token = JSON.parse(raw).claudeAiOauth?.accessToken;
    if (token) return token;
  } catch {}
  try {
    const root = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
    const token = JSON.parse(
      await readFile(join(root, ".credentials.json"), "utf8"),
    ).claudeAiOauth?.accessToken;
    if (token) return token;
  } catch {}
  return undefined;
}
async function claudeUsageToken(): Promise<string> {
  if (process.env.CLAUDE_USAGE_TOKEN_COMMAND) {
    const token = (
      await adapter(process.env.CLAUDE_USAGE_TOKEN_COMMAND, 10_000)
    ).trim();
    if (/^sk-ant-[A-Za-z0-9_-]+$/.test(token)) return token;
    throw new Error("CLAUDE_USAGE_TOKEN_COMMAND did not return an OAuth token");
  }
  return claudeToken();
}
export async function codexAuth(): Promise<string> {
  const root = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const auth = JSON.parse(await readFile(join(root, "auth.json"), "utf8"));
  if (!auth.tokens?.access_token || auth.auth_mode === "apikey") {
    throw new Error("Codex needs a file-backed ChatGPT login; run codex login");
  }
  return JSON.stringify({
    auth_mode: "chatgpt",
    tokens: auth.tokens,
    last_refresh: auth.last_refresh,
  });
}
export async function readUsage(
  provider: Provider,
  config: Defaults,
): Promise<Reading> {
  const override = process.env[`${provider.toUpperCase()}_USAGE_COMMAND`];
  if (override)
    return validateUsage(
      JSON.parse(await adapter(override, config.quotaTimeoutMs)),
    );
  if (provider === "codex")
    return codexUsage(
      await codexRpc<CodexRateLimits>(
        "account/rateLimits/read",
        {},
        config.quotaTimeoutMs,
      ),
    );
  const token = await claudeUsageToken();
  // Undocumented Claude /usage endpoint: stop this provider if it changes.
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(config.quotaTimeoutMs),
  });
  if (!response.ok)
    throw new Error(
      `Claude usage query returned HTTP ${response.status}; run claude auth login for user:profile scope, or configure CLAUDE_USAGE_COMMAND`,
    );
  return claudeUsage((await response.json()) as ClaudeUsage);
}
export class Quotas {
  config: Defaults;
  read: ReadUsage;
  // Stops, keyed by provider (+ model); a fresh reading recomputes them and lifts the ones no condition returns.
  disabled = new Map<Provider, string>();
  disabledModels = new Map<Provider, Map<string, string>>();
  // Providers stopped for good (no login); never re-read or lifted.
  permanent = new Set<Provider>();
  // Providers whose current provider-wide stop is a failed read; a good read replaces it.
  unverified = new Set<Provider>();
  // Run-level interrupt: starts nothing new, outside the stop map, never lifts.
  interrupted = false;
  // Told of every stop; the scheduler aborts the reservations it covers.
  onStop?: (
    provider: Provider,
    model: string | undefined,
    reason: string,
  ) => void;
  values = new Map<Provider, Reading>();
  refreshing: Promise<void[]> | null = null;
  conditions: StopCondition[];
  constructor(
    config: Defaults,
    read: ReadUsage = readUsage,
    conditions: StopCondition[] = [],
  ) {
    this.config = config;
    this.read = read;
    this.conditions = [
      allowedCondition(),
      thresholdCondition(config.stopAt),
      ...conditions,
    ];
  }
  available(provider: Provider, model?: string): boolean {
    return (
      !this.interrupted &&
      this.config.providers.includes(provider) &&
      this.values.has(provider) &&
      !this.disabled.has(provider) &&
      (model === undefined || !this.disabledModels.get(provider)?.has(model))
    );
  }
  // `cancel: false` blocks new starts without aborting live sessions.
  disable(provider: Provider, reason: string, cancel = true): void {
    if (this.disabled.has(provider)) return;
    this.disabled.set(provider, reason);
    console.log(`[quota] ${provider} stopped: ${reason}`);
    if (cancel) this.onStop?.(provider, undefined, reason);
  }
  lock(provider: Provider, reason: string): void {
    this.permanent.add(provider);
    this.disable(provider, reason);
  }
  disableModel(provider: Provider, model: string, reason: string): void {
    const models = this.disabledModels.get(provider) ?? new Map();
    if (models.has(model)) return;
    models.set(model, reason);
    this.disabledModels.set(provider, models);
    console.log(`[quota] ${provider} (${model}) stopped: ${reason}`);
    this.onStop?.(provider, model, reason);
  }
  // Lifts on the next good read; live sessions carry on.
  private failRead(provider: Provider, error: unknown): void {
    if (!this.disabled.has(provider)) this.unverified.add(provider);
    this.disable(
      provider,
      `subscription usage could not be verified: ${error instanceof Error ? error.message : error} (run doctor for details)`,
      false,
    );
  }
  async refresh(): Promise<void[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = Promise.all(
      this.config.providers.map(async (provider) => {
        if (this.permanent.has(provider)) return;
        let usage: Reading;
        try {
          usage = validateUsage(await this.read(provider, this.config));
        } catch (error) {
          this.failRead(provider, error);
          return;
        }
        // The first condition to name a stop keeps its reason.
        const stops = new Map<string | undefined, string>();
        try {
          const input = {
            provider,
            reading: usage,
            models: modelsForProvider(this.config, provider),
          };
          for (const condition of this.conditions)
            for (const stop of condition(input))
              if (!stops.has(stop.model)) stops.set(stop.model, stop.reason);
        } catch (error) {
          // A throwing or invalid stop module (its name is in the message) is a failed read.
          this.failRead(provider, error);
          return;
        }
        this.values.set(provider, usage);
        const wide = this.disabled.get(provider);
        // A failed-read stop is replaced by whatever the checks say now, so a real stop fires onStop.
        if (
          wide !== undefined &&
          (!stops.has(undefined) || this.unverified.has(provider))
        ) {
          this.disabled.delete(provider);
          if (!stops.has(undefined))
            console.log(`[quota] ${provider} stop lifted (was: ${wide})`);
        }
        this.unverified.delete(provider);
        const models = this.disabledModels.get(provider);
        for (const [model, was] of models ?? [])
          if (!stops.has(model)) {
            models!.delete(model);
            console.log(
              `[quota] ${provider} (${model}) stop lifted (was: ${was})`,
            );
          }
        for (const [model, reason] of stops)
          if (model === undefined) this.disable(provider, reason);
          else this.disableModel(provider, model, reason);
      }),
    ).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  stop(): void {
    this.interrupted = true;
    for (const provider of providers)
      this.onStop?.(provider, undefined, "runner interrupted");
  }
}
