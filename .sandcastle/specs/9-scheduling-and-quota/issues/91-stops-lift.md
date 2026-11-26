---
title: When a stop lifts, and what reads quota while a provider is stopped
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: closed
assignee: claude
---
## Question

[Quota stops](../../7-harness-boundary/issues/67-quota-stops.md) settled that a stop lasts while its check keeps returning it. Today `Quotas.refresh` skips stopped providers, so nothing ever re-checks them. Decide:

- When a stopped provider (or provider + model) is read again: on every `pick`, on the poll timer, only at `wakeAt`, or a mix.
- Whether a failed quota read ("usage could not be verified") is a stop that lifts on the next good read, and how often it is retried.
- Per-model stops: lift independently of the provider-wide stop?
- A project's own stop condition: lifts by the same rule (its check stops returning it)?
- What the run log says when a stop lifts.

## Answer

Settled with phol 2026-11-26.

- **When a stopped provider is read again**: on every quota refresh, like providers that aren't stopped (each `pick`, the 60 s poll while anything runs, the re-read after `wakeAt`). `refresh` no longer skips stopped providers; no separate schedule.
- **One lifting rule for every stop that comes from a check**: on each fresh reading, every stop condition (built-in thresholds and project modules) runs, and the stops are recomputed. A stop is keyed by provider + optional model, not by its reason. It lifts when no condition returns that key any more. Per-model and provider-wide stops lift independently. A reason whose text changes ("4%" → "3%") is neither a lift nor a new stop.
- **Failed quota read** ("usage could not be verified") is a stop that lifts on the next good read, retried on the same refreshes, no backoff. **It blocks new starts only and does not cancel live sessions** (changed from today). The provider's own hard limit is the backstop, made a quota stop by [A provider-limit failure counted as a quota stop](93-provider-limit-failure.md). How often to retry while nothing runs is for [Sleeping until the next reset: what wakeAt returns](92-wake-at.md).
- **Interrupt is not a stop**: SIGINT/SIGTERM becomes a run-level state outside the stop map that never lifts (today `stop()` reuses `disable(…, "runner interrupted")`).
- **Stops no check returns** (a provider-limit failure) are left to [A provider-limit failure counted as a quota stop](93-provider-limit-failure.md): under the rule above they would lift on the next reading and loop if the reading still shows quota left.
- **Run log**: `[quota] claude stop lifted (was: <reason>)`, `[quota] claude (opus) stop lifted (was: <reason>)`; printed only on stop/lift transitions, never on reason-text changes.
