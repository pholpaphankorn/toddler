---
title: What weekly usage each provider reports
labels: [wayfinder:research, adult]
blocked_by: []
parent: 4
status: closed
assignee: claude (research subagent)
---
## Question

What weekly quota data can toddler read for each provider, from the same sources it uses today ([quota.ts](../../../../src/quota.ts))? For Codex `account/rateLimits/read`: which window is weekly (`windowDurationMins` 10080?), is it always present, and which `limitId` buckets exist. For Claude's `/api/oauth/usage`: which `seven_day*` keys exist (e.g. per-model weekly limits like `seven_day_opus`), what each means, and which should count as "weekly left" for a provider. Also: reset times and units for each, and how stale the numbers can be. Cite docs or source; mark anything undocumented.

## Answer

Full findings: [docs/research/weekly-usage-data.md](../../../../docs/research/weekly-usage-data.md).

- **Codex weekly** = the window whose `windowDurationMins` is ≈10080 (Codex's own TUI uses ±5%), in **either** `primary` or `secondary`; slot order is not fixed (source + test fixture with weekly as `primary`). Docs don't say which slot is which.
- **Not always present:** Codex Pro has "no five-hour limit" (docs), so a bucket can be weekly-only; flexible Enterprise/Edu have no fixed limits. Claude **Ultra has only a weekly cap** (help center). toddler today throws when the five-hour window is missing, so these plans get disabled.
- **Codex per-model buckets:** extra `rateLimitsByLimitId` entries keyed by backend `metered_feature` (docs example `codex_other`), each with `limitName`, `normalModelSlug` and its own windows. The set of ids is undocumented.
- **Claude weekly left** = `100 - seven_day.utilization` (all models). Also in the newer `limits[]` array as `kind: "weekly_all"`.
- **Claude per-model weekly:** the documented "separate weekly limit for Fable" is a `limits[]` row `kind: "weekly_scoped"` with `scope.model.display_name`, not a `seven_day_*` key. `seven_day_opus` and `seven_day_sonnet` are legacy model-family windows (likely null). `seven_day_oauth_apps` is a meter Claude Code never blocks on, so toddler's `startsWith("seven_day")` scan over-counts it while missing `weekly_scoped`.
- **Units:** Codex `usedPercent` is an integer 0-100, `resetsAt` is Unix **seconds** and nullable. Claude `utilization` is 0-100 and nullable, `resets_at` is an **ISO 8601 string** and nullable. Weekly reset anchor is undocumented for both.
- **Staleness:** Codex app-server does a live backend fetch per read (no cache); Codex's own UI calls >15 min stale. Claude endpoint freshness is undocumented (Claude Code caches it 60 s client-side). toddler's fresh-per-poll read avoids client caches.
- **Undocumented:** the whole Claude `/api/oauth/usage` body; Codex `limitId` set and slot semantics. The only *documented* Claude weekly figure is the statusline's `rate_limits.seven_day` (Unix seconds), available only inside a running Claude Code session.
