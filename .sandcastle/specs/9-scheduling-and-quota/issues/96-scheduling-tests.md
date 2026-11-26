---
title: How scheduling is tested
labels: [wayfinder:grilling, on-hold]
blocked_by: [92, 93, 94]
parent: 9
status: open
---
## Question

How are `pick`, the rankers, stops lifting, provider-limit failures, `wakeAt` sleeps and `plan`'s dry-run slot filling ([How plan and doctor explain a ranking or a stop](95-plan-doctor-explain.md)) tested without real providers or real time? Which fakes (readings, a clock, `wait`, CLI failure output) and which contract tests, following [How landing is tested](../../8-landing/issues/80-landing-tests.md)?
