---
title: The shape of a quota reading
labels: [wayfinder:grilling, on-hold]
blocked_by: [18]
parent: 4
assignee: claude (with user)
status: closed
---
## Question

`Usage` is `{ remainingPercent, resetsAt, observedAt }` for the five-hour window only. What does a reading become now that weekly matters: one reading per window (five-hour, weekly, maybe per-model weekly) with remaining % and reset each? How is a provider with several weekly buckets reduced to one "weekly left"? And how does the `CLAUDE_USAGE_COMMAND` / `CODEX_USAGE_COMMAND` JSON contract change: extended in a backward-compatible way, or replaced?

From [What weekly usage each provider reports](18-weekly-usage-data.md): some plans have **no five-hour window** (Codex Pro, Claude Ultra) and are wrongly disabled today; Codex windows must be matched by duration (weekly can be `primary`), not by `=== 300`; Claude has a newer `limits[]` array (`session` / `weekly_all` / `weekly_scoped`) that may be a better source than `seven_day*` keys; both providers have per-model buckets; units differ (Unix seconds vs ISO string) and values can be null.

## Answer

The first version is a throwaway prototype: everything below **replaces** today's `Usage`, parsers and override contract. No old-format fallbacks, no config migration.

**Shape**, one per provider per poll:

```ts
interface Window  { remainingPercent: number; resetsAt: number | null }   // resetsAt: Unix seconds
interface Reading { observedAt: number;                                   // Unix ms
                    fiveHour: Window | null; weekly: Window | null;
                    weeklyByModel: Record<string, Window> }               // keyed by the provider's own model label
```

- `null` = the provider reports no such limit; it counts as 100% left. Nothing is folded together (today's "any weekly at 100% → 0" goes away).
- Weekly is reduced outside the reading: `weeklyLeft(reading, model)` = tighter of `weekly` and the matching `weeklyByModel` bucket. Ranking and stop thresholds both use it.

**Missing windows, per provider:** Codex may have neither window (flexible Enterprise/Edu are documented as unlimited). Claude must have weekly (every plan has a weekly cap); missing = unverifiable.

**Matching a role's model to a bucket:** Codex `normalModelSlug` equals the configured model (case-insensitive). Claude: the first word of `scope.model.display_name` (e.g. "fable") appears in the model id. No match = no per-model limit; `doctor` lists unmatched buckets.

**Claude source: `limits[]` only.** `session` → `fiveHour`, `weekly_all` → `weekly`, `weekly_scoped` with `scope.model` → `weeklyByModel`; other kinds and surface-scoped rows ignored. The `five_hour` / `seven_day*` keys are not read. A body without `limits[]` = unverifiable. `utilization`/`percent` null = window missing.

**Codex source:** `codexLimitId` config is removed; the main bucket is always `"codex"`. Five-hour and weekly are matched by `windowDurationMins` ≈300 / ≈10080 (±5%) in either slot. Other buckets with a `normalModelSlug` contribute their weekly window to `weeklyByModel`; per-model five-hour windows are dropped. `ordinaryUsageAllowed` is not in the reading ([ticket 24](24-stop-condition-extension-point.md) may add it).

**Validation:** `observedAt` at most 60 s old; `remainingPercent` finite 0-100, else unverifiable; `resetsAt` may be null (display only); a past `resetsAt` means the window already reset → 100%.

**`CLAUDE_USAGE_COMMAND` / `CODEX_USAGE_COMMAND`:** print a `Reading` as JSON (same units). The old `{remainingPercent, resetsAt, observedAt}` shape is rejected with an error pointing to the README.
