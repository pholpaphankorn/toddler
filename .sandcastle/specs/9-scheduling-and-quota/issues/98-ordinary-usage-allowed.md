---
title: Whether Codex's ordinaryUsageAllowed becomes a built-in stop condition
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: open
---
## Question

[What each CLI reports when a session hits the provider's own limit](90-provider-limit-signals.md) found that Codex's rate-limit read carries `ordinaryUsageAllowed`, the backend's own yes/no, not derived from the percentages. Decide whether `Reading` carries it (and in what shape, given Claude has no equivalent), whether `false` is a built-in stop alongside thresholds (provider-wide; how it lifts under [When a stop lifts](91-stops-lift.md), and what `wakeAt` uses when it has no reset time), and how `plan` shows it ([How plan and doctor explain a ranking or a stop](95-plan-doctor-explain.md)). Carried over from spec 4's fog.
