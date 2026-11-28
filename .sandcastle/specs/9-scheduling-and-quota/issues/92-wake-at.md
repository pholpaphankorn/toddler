---
title: "Sleeping until the next reset: what wakeAt returns"
labels: [wayfinder:grilling, adult]
blocked_by: [91]
parent: 9
status: closed
assignee: claude
---
## Question

When nothing can start and landing is idle, the run asks `wakeAt() → time | none` ([The run loop's shape](../../8-landing/issues/75-run-loop-shape.md)). Decide:

- The time: earliest `resetsAt` of a window that caused a stop, over every stopped provider (and model?) that some ready issue could use.
- A stop with no reset time (failed read, a project stop condition, a provider-limit failure with no reset given): retry interval, or none (the run ends)?
- A cap on one sleep, or on total sleeping in a run.
- What happens on wake when the reading is still below the threshold (reset late, threshold above post-reset quota).
- SIGINT/SIGTERM during a sleep; how the sleep shows in the log and the run summary.

## Answer

Settled with phol 2026-11-26.

- **Wake time**: `wakeAt = min(earliest future resetsAt + ~1 min slack, now + 30 min)`, the resets taken over **every** window of every stopped provider (or provider + model). It doesn't try to work out which window caused a stop (a stop condition doesn't say), and it doesn't filter by whether a ready issue could use the provider (no role-to-provider limits). A wasted wake just re-reads quota and sleeps again.
- **Stops with no reset time** (failed read, a project stop condition, a limit failure with no reset given) are covered by the same formula: rechecked every 30 min. The 30 min is fixed, not a config setting. `wakeAt` returns none only when there are no stops at all; then the run ends as today.
- **No cap on total sleep**: a run sleeps as long as it takes (days, for a weekly window) until its work is done or phol interrupts it. No `maxSleep`.
- **On wake**: re-read quota (stops recomputed per [When a stop lifts](91-stops-lift.md)), then `pick` again. If a provider is still stopped (late reset, threshold above post-reset quota), it is logged once as still stopped and the run sleeps again. No error, no needs attention.
- **Interrupt during a sleep** ends the run at once (nothing live, landing idle); the summary says it ended while sleeping.
- **Log**: `[run] sleeping until 14:05 (claude: reset 14:04; codex: usage could not be verified, recheck 14:05)` when a sleep starts and `[run] woke` when it ends. The run summary adds total time slept. Lifts are logged as in 91.
- **Glossary**: added **Sleeping**; **Run** now says that every provider being stopped never ends a run.
