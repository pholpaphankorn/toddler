---
title: When a stop lifts, and what reads quota while a provider is stopped
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: open
---
## Question

[Quota stops](../../7-harness-boundary/issues/67-quota-stops.md) settled that a stop lasts while its check keeps returning it. Today `Quotas.refresh` skips stopped providers, so nothing ever re-checks them. Decide:

- When a stopped provider (or provider + model) is read again: on every `pick`, on the poll timer, only at `wakeAt`, or a mix.
- Whether a failed quota read ("usage could not be verified") is a stop that lifts on the next good read, and how often it is retried.
- Per-model stops: lift independently of the provider-wide stop?
- A project's own stop condition: lifts by the same rule (its check stops returning it)?
- What the run log says when a stop lifts.
