---
title: Which scheduling choices the ranking drives
labels: [wayfinder:grilling, on-hold]
blocked_by: [20]
parent: 4
assignee: claude (with user)
status: closed
---
## Question

Today [policy.ts](../../../../src/policy.ts) makes three provider choices: who implements a lone issue (Codex first), who takes each of two `parallel-safe` issues, and who reviews (the other provider, falling back to the same one). Which of these does the ranking decide? In particular, does "review goes to the other provider" stay a rule above the ranking, and is the ranking recomputed per stage or once per run?

From [Weekly and five-hour stop thresholds](22-stop-thresholds.md): availability is per **provider and model**, not per provider. A per-model weekly bucket can stop one model while the provider stays available for roles on other models, so a choice must check the model the role will run.

## Answer

**Ranking decides three choices**, each worked out at the moment it is made from the latest refreshed readings (never once per run):

1. **A new job's implementer**: the top-ranked available provider. "Codex first" goes away.
2. **The order of a `parallel-safe` pair**: when both providers are available, both run, under `"quota"` and `"order"` alike. Ranking only decides who gets the first (higher-priority) issue; the other takes the second.
3. **Fallback when a job's implementer is stopped**: the top-ranked available provider takes over, replacing today's fixed-order `providers.find`.

**Ranking never decides review.** The reviewer is the provider that did not implement whenever it is available, whatever its quota. Only when it is stopped or not enabled (one-provider projects) does the implementer review itself, and then always in a **fresh session**, never the implementation session. Today every stage already gets a new sandbox and agent with `captureSessions: false`; that must stay true.

**Sticky implementer:** later implementation rounds (after review findings) and jobs resumed from `state.json` in a later invocation stay with `job.implementer` while it is available, even if another provider now ranks higher. This also keeps the reviewer stable.

**Availability is per provider and model:** every choice above checks the model the role runs on that provider (implementation model for 1–3, review model for review). A provider stopped for one model is unavailable for roles on that model only. With nothing available for a role, the job pauses as today; it is never moved to another model.
