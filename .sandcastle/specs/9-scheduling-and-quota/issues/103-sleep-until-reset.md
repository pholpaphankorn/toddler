---
title: Sleep until the next reset
labels: []
blocked_by: [102]
parent: 9
status: closed
---
When every provider is stopped the run sleeps until quota should be back instead of ending, then carries on by itself.

1. **`wakeAt`** = `min(earliest future resetsAt + ~1 min slack, now + 30 min)`, resets taken over every window of every stopped provider or provider + model. Stops with no reset (failed read, project stop condition) are covered by the 30 min recheck, which is fixed, not config. `wakeAt` returns none only when there are no stops; then the run ends as today.
2. **No cap on total sleep**: a run sleeps as long as it takes.
3. **On wake**: re-read quota, then `pick` again. Still stopped → logged once as still stopped and the run sleeps again. No error, no needs attention.
4. **Interrupt during a sleep** ends the run at once; the summary says it ended while sleeping.
5. **Log**: `[run] sleeping until 14:05 (claude: reset 14:04; codex: usage could not be verified, recheck 14:05)` when a sleep starts, `[run] woke` when it ends. The run summary adds total time slept. All through the injected clock.

- [ ] Scheduler tests: `wakeAt` = earliest reset + slack capped at 30 min; none with no stops
- [ ] Loop tests (`workflow.test.ts`): sleep → wake → work resumes; still stopped on wake → sleeps again; interrupt during a sleep ends at once; sleeps asserted from the recorded `wait` arguments
