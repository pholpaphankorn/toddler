import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { adapter, codexRpc, command } from "./process.mjs";

export function validateUsage(value, now = Date.now()) {
  const { remainingPercent, resetsAt, observedAt } = value;
  if (!Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100 ||
      !Number.isFinite(resetsAt) || resetsAt <= now / 1000 ||
      !Number.isFinite(observedAt) || observedAt > now + 5_000 || now - observedAt > 60_000) {
    throw new Error("Missing, expired, stale, or invalid five-hour usage data");
  }
  return { remainingPercent, resetsAt, observedAt };
}
export function codexUsage(result, limitId, now = Date.now()) {
  const bucket = result.rateLimitsByLimitId?.[limitId] ??
    (result.rateLimits?.limitId === limitId ? result.rateLimits : undefined);
  if (!bucket) throw new Error(`Codex quota bucket '${limitId}' was not returned`);
  const windows = [bucket.primary, bucket.secondary].filter(Boolean);
  const fiveHour = windows.find((window) => window.windowDurationMins === 300);
  if (!fiveHour) throw new Error("Codex did not return a five-hour quota window");
  if (!Number.isFinite(fiveHour.usedPercent)) throw new Error("Invalid Codex usage percentage");
  const exhausted = windows.some((window) => window.usedPercent >= 100 && window.resetsAt > now / 1000);
  return validateUsage({ remainingPercent: exhausted ? 0 : 100 - fiveHour.usedPercent,
    resetsAt: fiveHour.resetsAt, observedAt: now }, now);
}
export function claudeUsage(result, now = Date.now()) {
  const window = result.five_hour;
  if (!Number.isFinite(window?.utilization)) throw new Error("Claude did not return five-hour usage");
  const exhausted = Object.entries(result).some(([key, value]) =>
    key.startsWith("seven_day") && value?.utilization >= 100 && Date.parse(value.resets_at) > now);
  return validateUsage({ remainingPercent: exhausted ? 0 : 100 - window.utilization,
    resetsAt: Date.parse(window.resets_at) / 1000, observedAt: now }, now);
}
export async function claudeToken() {
  const native = await nativeClaudeToken();
  if (native) return native;
  throw new Error("Claude subscription login unavailable; run npm run sandcastle:setup");
}
async function nativeClaudeToken() {
  try {
    const raw = await command("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 5_000 });
    const token = JSON.parse(raw).claudeAiOauth?.accessToken;
    if (token) return token;
  } catch {}
  try {
    const root = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
    const token = JSON.parse(await readFile(join(root, ".credentials.json"), "utf8")).claudeAiOauth?.accessToken;
    if (token) return token;
  } catch {}
  return undefined;
}
async function claudeUsageToken() {
  if (process.env.CLAUDE_USAGE_TOKEN_COMMAND) {
    const token = (await adapter(process.env.CLAUDE_USAGE_TOKEN_COMMAND, 10_000)).trim();
    if (/^sk-ant-[A-Za-z0-9_-]+$/.test(token)) return token;
    throw new Error("CLAUDE_USAGE_TOKEN_COMMAND did not return an OAuth token");
  }
  return claudeToken();
}
export async function codexAuth() {
  const root = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const auth = JSON.parse(await readFile(join(root, "auth.json"), "utf8"));
  if (!auth.tokens?.access_token || auth.auth_mode === "apikey") {
    throw new Error("Codex needs a file-backed ChatGPT login; run codex login");
  }
  return JSON.stringify({ auth_mode: "chatgpt", tokens: auth.tokens, last_refresh: auth.last_refresh });
}
export async function readUsage(provider, config) {
  const override = process.env[`${provider.toUpperCase()}_USAGE_COMMAND`];
  if (override) return validateUsage(JSON.parse(await adapter(override, config.quotaTimeoutMs)));
  if (provider === "codex") return codexUsage(
    await codexRpc("account/rateLimits/read", {}, config.quotaTimeoutMs), config.codexLimitId);
  const token = await claudeUsageToken();
  // Undocumented Claude /usage endpoint: stop this provider if it changes.
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(config.quotaTimeoutMs),
  });
  if (!response.ok) throw new Error(`Claude usage query returned HTTP ${response.status}; run claude auth login for user:profile scope, or configure CLAUDE_USAGE_COMMAND`);
  return claudeUsage(await response.json());
}
export class Quotas {
  constructor(config, read = readUsage) {
    this.config = config; this.read = read;
    this.disabled = new Map(); this.active = new Map(); this.values = new Map(); this.refreshing = null;
  }
  available(provider) { return this.values.has(provider) && !this.disabled.has(provider); }
  disable(provider, reason) {
    if (this.disabled.has(provider)) return;
    this.disabled.set(provider, reason);
    console.log(`[quota] ${provider} stopped: ${reason}`);
    for (const controller of this.active.get(provider) ?? []) controller.abort(new Error(reason));
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = Promise.all(["codex", "claude"].map(async (provider) => {
      if (this.disabled.has(provider)) return;
      try {
        const usage = validateUsage(await this.read(provider, this.config));
        this.values.set(provider, usage);
        if (usage.remainingPercent <= this.config.reservePercent) this.disable(provider, `five-hour remaining ${usage.remainingPercent}% (reserve ${this.config.reservePercent}%)`);
      } catch { this.disable(provider, "subscription usage could not be verified (run doctor for details)"); }
    })).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async run(provider, action) {
    await this.refresh();
    if (!this.available(provider)) throw new Error(`${provider} is unavailable`);
    const controller = new AbortController();
    const active = this.active.get(provider) ?? new Set();
    this.active.set(provider, active); active.add(controller);
    const timer = setInterval(() => { void this.refresh(); }, this.config.pollIntervalMs);
    try { return await action(controller.signal); }
    finally { clearInterval(timer); active.delete(controller); }
  }
  stop() { for (const provider of ["codex", "claude"]) this.disable(provider, "runner interrupted"); }
}
