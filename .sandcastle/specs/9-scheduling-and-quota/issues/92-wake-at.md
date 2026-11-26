---
title: "Sleeping until the next reset: what wakeAt returns"
labels: [wayfinder:grilling, on-hold]
blocked_by: [91]
parent: 9
status: open
---
## Question

When nothing can start and landing is idle, the run asks `wakeAt() → time | none` ([The run loop's shape](../../8-landing/issues/75-run-loop-shape.md)). Decide:

- The time: earliest `resetsAt` of a window that caused a stop, over every stopped provider (and model?) that some ready issue could use.
- A stop with no reset time (failed read, a project stop condition, a provider-limit failure with no reset given): retry interval, or none (the run ends)?
- A cap on one sleep, or on total sleeping in a run.
- What happens on wake when the reading is still below the threshold (reset late, threshold above post-reset quota).
- SIGINT/SIGTERM during a sleep; how the sleep shows in the log and the run summary.
