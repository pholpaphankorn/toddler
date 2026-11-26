---
title: One quota poller owned by the scheduler
labels: []
blocked_by: [102]
parent: 9
status: open
---
While anything runs, quota is re-read on one schedule however many sessions share a provider, and a stop found by that read cancels exactly the sessions it covers.

1. **One poller** replaces the per-session `setInterval` in `Quotas.run`. It runs while total `running` > 0 (from `pick` to the last `release()`), refreshes every configured provider, stopped ones included. `pollIntervalMs` (default 60 s) stays the only setting.
2. **Interval counts from the last refresh of any kind**: the next poll is due `pollIntervalMs` after it, so a `pick` or wake re-read pushes it back. The `refreshing` dedupe stays; polls never overlap.
3. **The loop drives the timer**: `scheduler.nextPollAt() → time | none` (none at 0 running) and `scheduler.poll()`. The loop's single wait adds "poll due" beside a slot freeing, a landing event and the sleep timer, on the one injected clock. No timer hidden in the scheduler.
4. **A stop found by a poll cancels live sessions with the same key** (thresholds and project stop conditions alike; provider-wide → every session on the provider, per-model → that model's). Cancelled stages go back to ready with their worktree and are not counted as a round. Failed reads still cancel nothing.
5. **A throwing or invalid stop-condition module** (`StopConditionError`) during any refresh is a failed read for that provider; the log names the module. Today's run-wide `stop()` on a poll error goes.
6. `Quotas.run`, its timer and `Quotas.active` go.

- [ ] Scheduler tests: `nextPollAt()` none at 0 running, last refresh + interval otherwise, pushed back by a `pick`; `poll()` with a threshold stop aborts only same-key signals; a failed read leaves signals alone; a throwing module gives a failed read that lifts on the next good pass
- [ ] Loop test: slot busy → poll fires → stop cancels the stage → job back to ready, round not counted
