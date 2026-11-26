---
title: A provider-limit failure becomes a quota stop
labels: [parallel-safe]
blocked_by: [103, 104]
parent: 9
status: open
---
When Claude or Codex refuses a session because its own usage limit is hit, infant treats it as a quota stop: the job goes back to ready instead of needing attention, and the run sleeps until the limit resets.

1. **Recogniser** (pure function over raw stream lines, fed from `onAgentStreamEvent`): Claude `api_error: "usage_limit_reached"` with `api_error_params.rate_limit_info { rateLimitType, resetsAt }`; `error: "rate_limit"` alone is throttling, not a limit. Codex: the `{"type":"error"}` event text matching the usage-limit message, reset time parsed from it when present.
2. **Ambiguous** (a stage fails with neither signal): one fresh quota reading; if it now stops the stage's provider (or model), the failure is a quota stop, otherwise an ordinary `stage-failed`.
3. **Which stop**: Claude per-model buckets (`seven_day_opus`, …) stop provider + model; `five_hour`, `seven_day` and unknown types stop the whole provider. Codex always stops the whole provider.
4. **How it lifts**: held until the failure's reset time (30 min when none), then the normal lifting rule. That reset time feeds `wakeAt`.
5. **The job** goes back to ready with its worktree, no `attention`; the interrupted stage counts toward neither `reviewRounds` nor `mergeFixRounds`. Other live sessions with the same key are cancelled the same way.

- [ ] Hand-written fixtures under `tests/fixtures/limits/`, each marked as written from source reading (spec 9 #90): Claude per-model `usage_limit_reached`, Claude `five_hour`, Claude `rate_limit` alone, Codex usage-limit text, Codex with no parsable time; recogniser tested on each
- [ ] Scheduler tests: limit stop held until its reset (30 min with none), then the normal rule; cancels only same-key sessions; ambiguous failure decided by a fresh reading; its reset counts in `wakeAt`
- [ ] Loop test: limit lines through a fake `onAgentStreamEvent`, exit 1 → job back to ready, round not counted
