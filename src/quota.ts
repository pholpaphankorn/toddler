import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { providers, type Defaults, type Provider } from "./config.ts";
import { adapter, codexRpc, command } from "./process.ts";

export interface Window {
  remainingPercent: number;
  resetsAt: number | null;
}
export interface Reading {
  observedAt: number;
  fiveHour: Window | null;
  weekly: Window | null;
  weeklyByModel: Record<string, Window>;
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
    { observedAt: now, fiveHour, weekly, weeklyByModel },
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
  disabled = new Map<Provider, string>();
  active = new Map<Provider, Set<AbortController>>();
  values = new Map<Provider, Reading>();
  refreshing: Promise<void[]> | null = null;
  constructor(config: Defaults, read: ReadUsage = readUsage) {
    this.config = config;
    this.read = read;
  }
  available(provider: Provider): boolean {
    return this.values.has(provider) && !this.disabled.has(provider);
  }
  disable(provider: Provider, reason: string): void {
    if (this.disabled.has(provider)) return;
    this.disabled.set(provider, reason);
    console.log(`[quota] ${provider} stopped: ${reason}`);
    for (const controller of this.active.get(provider) ?? [])
      controller.abort(new Error(reason));
  }
  async refresh(): Promise<void[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = Promise.all(
      providers.map(async (provider) => {
        if (this.disabled.has(provider)) return;
        try {
          const usage = validateUsage(await this.read(provider, this.config));
          this.values.set(provider, usage);
          for (const [name, window] of [
            ["fiveHour", usage.fiveHour],
            ["weekly", usage.weekly],
          ] as const) {
            const threshold = this.config.stopAt[provider][name];
            if (window && window.remainingPercent <= threshold) {
              this.disable(
                provider,
                `${name} remaining ${window.remainingPercent}% (stop at ${threshold}%)`,
              );
              break;
            }
          }
        } catch {
          this.disable(
            provider,
            "subscription usage could not be verified (run doctor for details)",
          );
        }
      }),
    ).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  async run<T>(
    provider: Provider,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    await this.refresh();
    if (!this.available(provider))
      throw new Error(`${provider} is unavailable`);
    const controller = new AbortController();
    const active = this.active.get(provider) ?? new Set();
    this.active.set(provider, active);
    active.add(controller);
    const timer = setInterval(() => {
      void this.refresh();
    }, this.config.pollIntervalMs);
    try {
      return await action(controller.signal);
    } finally {
      clearInterval(timer);
      active.delete(controller);
    }
  }
  stop(): void {
    for (const provider of providers)
      this.disable(provider, "runner interrupted");
  }
}
