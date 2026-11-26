---
title: A provider-limit failure counted as a quota stop
labels: [wayfinder:grilling, on-hold]
blocked_by: [90]
parent: 9
status: open
---
## Question

[Quota stops](../../7-harness-boundary/issues/67-quota-stops.md) settled that a stage killed by the provider's own limit stops that provider and leaves the issue ready, instead of an ordinary failure (which is needs attention under [Job states](../../8-landing/issues/79-job-states.md)). Using the signals from [What each CLI reports when a session hits the provider's own limit](90-provider-limit-signals.md), decide:

- How toddler recognises it (which signal, and what if it is ambiguous: fall back to a fresh reading?).
- Which stop it sets: the whole provider, or provider + model; and what makes it lift (ties to [When a stop lifts](91-stops-lift.md)).
- What happens to the job: back to ready with its preserved worktree; does the interrupted stage count against `maxReviewRounds` / `maxMergeFixRounds`; does the sticky implementer move to the other provider.
- Whether other live sessions on the same provider are cancelled at once or left to hit the limit themselves.

> From [When a stop lifts](91-stops-lift.md): stops lift when no condition returns them on a fresh reading. A failure-based stop has no condition, so decide how it lifts; lifting on the next reading loops when the reading still shows quota left (the reading lags the provider's own limit).

> From [Sleeping until the next reset](92-wake-at.md): a sleeping run wakes at the earliest `resetsAt` over all windows of the stopped providers, or after 30 min at most, and re-reads. A failure-based stop that carries the reset time from the failure (Claude's `resetsAt`, Codex's parsed text) could feed that formula; decide whether it does.
