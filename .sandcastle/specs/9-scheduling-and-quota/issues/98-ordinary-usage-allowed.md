---
title: Whether Codex's ordinaryUsageAllowed becomes a built-in stop condition
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: closed
assignee: claude
---
## Question

[What each CLI reports when a session hits the provider's own limit](90-provider-limit-signals.md) found that Codex's rate-limit read carries `ordinaryUsageAllowed`, the backend's own yes/no, not derived from the percentages. Decide whether `Reading` carries it (and in what shape, given Claude has no equivalent), whether `false` is a built-in stop alongside thresholds (provider-wide; how it lifts under [When a stop lifts](91-stops-lift.md), and what `wakeAt` uses when it has no reset time), and how `plan` shows it ([How plan and doctor explain a ranking or a stop](95-plan-doctor-explain.md)). Carried over from spec 4's fog.

## Answer

Settled with phol 2026-11-26.

- **A built-in stop, always on**: Codex reporting `ordinaryUsageAllowed: false` stops Codex. No config and no opt-out: thresholds are config because they're toddler's own choice, but this flag is the provider's ruling. Without it, percentages showing quota left while the backend says no would loop every 30 min (limit failure → 30 min hold → reading looks fine → start → fail). `false` may also mean that further usage bills paid credits, which is one more reason to stop.
- **`Reading` gains `allowed: boolean | null`**, meaning the provider's own yes/no on whether ordinary usage may continue. Codex fills it from `ordinaryUsageAllowed`. Claude always gives `null`, as does a Codex reading without the flag. Project stop conditions see it through the `Reading` they already get.
- **Provider-wide**: the stop key is Codex with no model. Toddler can't reliably tell which models draw on the main `codex` bucket, so it over-stops rather than spend paid credits.
- **Normal lifting and cancelling**: under [When a stop lifts](91-stops-lift.md), the stop lifts on the first fresh reading whose `allowed` is `true` or `null`; an unknown never stops a provider. Under [How quota polling works](97-quota-polling.md), a poll that finds `false` cancels every live Codex session. After a limit failure's 30 min hold ([A provider-limit failure counted as a quota stop](93-provider-limit-failure.md)), a reading that still says `false` keeps the stop, which ends the loop.
- **`wakeAt` unchanged**: there's no reset time of its own, so the existing formula in [Sleeping until the next reset](92-wake-at.md) covers it (earliest window reset capped at a 30 min recheck). A wake is only a re-read: the flag is checked again, never assumed lifted from a reset time.
- **Its own built-in stop condition**, registered before the threshold condition rather than folded into it. If both fire, they share one provider-wide stop.
- **Wording**: the reason is `provider reports ordinary usage not allowed`. The log says `[quota] codex stopped: provider reports ordinary usage not allowed`, and lifts use the usual line. In `plan`'s Providers section ([How plan and doctor explain a ranking or a stop](95-plan-doctor-explain.md)) it reads `lifts when a reading allows it; recheck on next read`. Nothing is shown when the flag is `true` or `null`.
- **Glossary**: **Stop condition** now says the stop thresholds and the provider's own yes/no are built in.
