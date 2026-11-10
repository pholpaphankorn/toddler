---
title: Weekly-aware quota readings with per-provider stopAt
labels: []
blocked_by: [13, 16]
parent: 4
status: open
---
Today a quota reading is only the five-hour window, with weekly folded in as an "exhausted" flag. Weekly-only plans (Codex Pro, Claude Ultra) are disabled for having no five-hour window, and Claude's weekly check counts `seven_day_oauth_apps` but misses `weekly_scoped` limits. Replace the reading and the single `reservePercent` threshold outright: no old-format fallbacks, no config migration.

1. **Reading.** One per provider per poll, replacing `Usage`:
   ```ts
   interface Window  { remainingPercent: number; resetsAt: number | null }   // resetsAt: Unix seconds
   interface Reading { observedAt: number;                                   // Unix ms
                       fiveHour: Window | null; weekly: Window | null;
                       weeklyByModel: Record<string, Window> }               // keyed by the provider's own model label
   ```
   `null` = the provider reports no such limit = 100% left.
2. **`weeklyLeft(reading, model)`** = the tighter of `weekly` and the `weeklyByModel` bucket matching `model`. Matching: Codex `normalModelSlug` equals the model (case-insensitive); Claude, the first word of `scope.model.display_name` (e.g. "fable") appears in the model id. No match = no per-model limit.
3. **Claude source: `limits[]` only.** `session` → `fiveHour`, `weekly_all` → `weekly`, `weekly_scoped` with `scope.model` → `weeklyByModel`; ignore other kinds and surface-scoped rows. Do not read `five_hour` / `seven_day*`. No `limits[]`, or no weekly = unverifiable. Null `utilization`/`percent` = window missing. `resets_at` is an ISO string → Unix seconds.
4. **Codex source.** Remove `codexLimitId`; the main bucket is always `"codex"`. Match five-hour and weekly by `windowDurationMins` ≈300 / ≈10080 (±5%) in either `primary` or `secondary`. Both may be missing. Other buckets with a `normalModelSlug` add their weekly window to `weeklyByModel`; their five-hour windows are dropped.
5. **Validation.** `observedAt` at most 60 s old; `remainingPercent` finite 0–100, else unverifiable; `resetsAt` may be null; a past `resetsAt` means that window reset → 100%.
6. **Override commands.** `CLAUDE_USAGE_COMMAND` / `CODEX_USAGE_COMMAND` print a `Reading` as JSON. The old `{remainingPercent, resetsAt, observedAt}` shape is rejected with an error pointing to the README.
7. **`stopAt` replaces `reservePercent`** (removed):
   ```json
   { "stopAt": { "claude": { "weekly": 20 }, "codex": { "fiveHour": 10 } } }
   ```
   Percent left; at or below stops. Every field optional, defaults `fiveHour` 5, `weekly` 10. Values finite 0–100; unknown provider key = config error; a key for a provider not in use is allowed. On every refresh: `fiveHour`, and the all-models `weekly`, against the thresholds; a hit stops that whole provider (cancel its sessions, the other carries on) with a logged reason. A missing window never stops. Unverifiable stops the provider, as today. Stopped stays stopped for the invocation. Per-model buckets are not stopped on yet (next issue).
8. **doctor** prints each provider's five-hour and weekly left with resets, its per-model buckets, and lists buckets that match no configured model.

Done when tests cover: Claude `limits[]` parsing (incl. `weekly_scoped`, ignored `seven_day_oauth_apps`, missing `limits[]`), Codex weekly in `primary`, a weekly-only bucket, a bucket with neither window, per-model buckets, `weeklyLeft` matching for both providers, validation rules, the rejected old override shape, and `stopAt` defaults, validation and five-hour / weekly stops. README documents `stopAt` and the new override JSON contract.

Decision records: [18](18-weekly-usage-data.md), [19](19-quota-reading-shape.md), [22](22-stop-thresholds.md).
