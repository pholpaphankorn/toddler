import type { Provider } from "./config.ts";

// A provider's own refusal of a session; `resetsAt` is epoch ms when the CLI said.
export interface LimitSignal {
  type?: string;
  resetsAt?: number;
}

// Reads one raw stdout line (sandcastle's onAgentStreamEvent) for the CLI's usage-limit refusal.
// Claude's api_error fields are @internal and Codex has text only (spec 9 #90); `rate_limit` alone is throttling.
export function limitSignal(
  provider: Provider,
  line: string,
  now = Date.now(),
): LimitSignal | undefined {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (provider === "claude") {
    if (event?.api_error !== "usage_limit_reached") return undefined;
    const info = event.api_error_params?.rate_limit_info;
    return {
      type:
        typeof info?.rateLimitType === "string"
          ? info.rateLimitType
          : undefined,
      resetsAt: Number.isFinite(info?.resetsAt)
        ? info.resetsAt * 1000
        : undefined,
    };
  }
  const text = event?.type === "error" ? String(event.message ?? "") : "";
  if (!/You[’']ve hit your usage limit/.test(text)) return undefined;
  const when = /try again at (.+?)\.(?:\s|$)/i.exec(text)?.[1];
  let resetsAt: number | undefined;
  if (when) {
    const clock = /^(\d{1,2}):(\d{2}) (AM|PM)$/i.exec(when);
    if (clock) {
      // Codex prints the bare time only for today, local.
      const date = new Date(now);
      date.setHours(
        (Number(clock[1]) % 12) + (clock[3].toUpperCase() === "PM" ? 12 : 0),
        Number(clock[2]),
        0,
        0,
      );
      resetsAt = date.getTime();
    } else
      resetsAt = new Date(when.replace(/(\d)(st|nd|rd|th),/, "$1,")).getTime();
    if (!Number.isFinite(resetsAt) || resetsAt! <= now) resetsAt = undefined;
  }
  return { resetsAt };
}

// The model a limit stops with its provider: Claude's per-model weekly buckets (seven_day_opus, ...) when the stage runs that model.
// Everything else (five_hour, seven_day, overage, unknown, all of Codex) stops the whole provider.
export function limitModel(
  provider: Provider,
  type: string | undefined,
  model: string,
): string | undefined {
  const bucket = /^seven_day_(?!overage)(\w+)$/.exec(type ?? "")?.[1];
  return provider === "claude" && bucket && model.toLowerCase().includes(bucket)
    ? model
    : undefined;
}
