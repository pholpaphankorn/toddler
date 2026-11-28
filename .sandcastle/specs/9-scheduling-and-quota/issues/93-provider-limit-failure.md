---
title: A provider-limit failure counted as a quota stop
labels: [wayfinder:grilling, adult]
blocked_by: [90]
parent: 9
status: closed
assignee: claude
---
## Question

[Quota stops](../../7-harness-boundary/issues/67-quota-stops.md) settled that a stage killed by the provider's own limit stops that provider and leaves the issue ready, instead of an ordinary failure (which is needs attention under [Job states](../../8-landing/issues/79-job-states.md)). Using the signals from [What each CLI reports when a session hits the provider's own limit](90-provider-limit-signals.md), decide:

- How toddler recognises it (which signal, and what if it is ambiguous: fall back to a fresh reading?).
- Which stop it sets: the whole provider, or provider + model; and what makes it lift (ties to [When a stop lifts](91-stops-lift.md)).
- What happens to the job: back to ready with its preserved worktree; does the interrupted stage count against `maxReviewRounds` / `maxMergeFixRounds`; does the sticky implementer move to the other provider.
- Whether other live sessions on the same provider are cancelled at once or left to hit the limit themselves.

> From [When a stop lifts](91-stops-lift.md): stops lift when no condition returns them on a fresh reading. A failure-based stop has no condition, so decide how it lifts; lifting on the next reading loops when the reading still shows quota left (the reading lags the provider's own limit).

> From [Sleeping until the next reset](92-wake-at.md): a sleeping run wakes at the earliest `resetsAt` over all windows of the stopped providers, or after 30 min at most, and re-reads. A failure-based stop that carries the reset time from the failure (Claude's `resetsAt`, Codex's parsed text) could feed that formula; decide whether it does.

## Answer

Settled with phol 2026-11-26.

- **Recognising it**: Claude: `api_error: "usage_limit_reached"` (with `api_error_params.rate_limit_info`) in the raw stream lines `onAgentStreamEvent` sees; `error: "rate_limit"` alone is not enough (ordinary throttling shares it). Codex: the `{"type":"error"}` event's text matching the usage-limit message. **Ambiguous** (a stage fails with neither signal): one fresh quota reading; if it now stops the stage's provider (or its model), the failure is a quota stop, otherwise an ordinary `stage-failed`.
- **Which stop**: Claude's per-model buckets (`seven_day_opus`, …) set a provider + model stop; `five_hour`, `seven_day` and any unknown type stop the whole provider. Codex (no bucket given) always stops the whole provider.
- **How it lifts**: the stop carries the reset time from the failure (Claude's `resetsAt`, or the time parsed from Codex's text) and holds until then; after that it follows the rule in [When a stop lifts](91-stops-lift.md) (lifts when no condition returns it). No reset time found: held 30 min. This avoids the lift-and-loop while the reading lags. Its reset time **feeds `wakeAt`** like any window's `resetsAt` ([Sleeping until the next reset](92-wake-at.md)).
- **The job**: back to ready with its preserved worktree, no `attention`. The interrupted stage does not count toward `reviewRounds` or `mergeFixRounds` (a round counts a finished review or merge fix). Stickiness treats a limit stop like any other stop; whether the implementer moves is [pick and the new ranker contract](94-pick-and-ranker-contract.md)'s.
- **Other live sessions**: cancelled at once, like any quota stop with the same key (provider-wide: all sessions on that provider; model stop: that model's sessions); their issues go back to ready the same way. Unlike a failed read (which only blocks new starts), the provider has already refused.
- **Glossary**: added **Provider limit**.
