---
title: Scheduling and quota
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 9`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec, ready to break into toddler issues, for how toddler schedules agents by quota: it fills [spec 8](../8-landing/spec.md)'s `pick` and `wakeAt` slots; reshapes ranking into the `balanced` (default) and `most-quota` modules with `running`, picked at each stage start (sticky implementer, reviewer re-picked each round); runs up to `maxParallelIssues` slots with several sessions per provider; treats a provider-limit failure as a quota stop; lets stops lift and sleeps the run to the next reset; and makes `plan` and `doctor` explain a ranking or a stop.

## Notes

- Second reshape area after [spec 7 Harness boundary](../7-harness-boundary/spec.md), split agreed in [spec 8](../8-landing/spec.md). Settled there, not reopened here: [How work is split across providers by quota left](../7-harness-boundary/issues/69-provider-split.md), [One orchestrator session per batch or one session per issue](../7-harness-boundary/issues/62-orchestrator-session.md), [One provider builds, the other reviews](../7-harness-boundary/issues/66-cross-provider-review.md), [Quota stops: keep, delegate, or drop](../7-harness-boundary/issues/67-quota-stops.md), and spec 8's [The run loop's shape and its idle states](../8-landing/issues/75-run-loop-shape.md) (`pick(role, job) → provider | none`, `wakeAt() → time | none`, asked only when nothing can start and landing is idle). Tickets here decide *how*, not *whether*.
- **Replaces [spec 4 Quota-aware scheduling](../4-quota-aware-scheduling/spec.md)** (phol, 2026-11-26), whose issues are built: `Reading`, `weeklyLeft`, per-provider `stopAt`, per-model stops, `stopConditions` modules and the ranker-module loader stay unless a ticket here changes them. Spec 4 is closed with a pointer here.
- Code today: [quota.ts](../../../src/quota.ts) (`Quotas`: `refresh` skips stopped providers, so stops never lift; a failed read stops a provider for the run; `active` already counts live sessions per provider; 60 s polling only while a session runs), [policy.ts](../../../src/policy.ts) (`Ranker` takes `{ role, issue, candidates }`; `makeRanker` handles `"quota"`/`"order"`; `assignments`, `reviewer`), [runner.ts](../../../src/runner.ts).
- Implementation issues from this spec are `blocked_by` spec 8's [Slot-based event loop](../8-landing/issues/84-slot-event-loop.md) where they fill `pick`, `wakeAt` or slots.
- Tracker: these files, same conventions as spec 8. Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs). Ticket numbers continue from spec 8 (90+).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Stop threshold**, **Stop condition**, **Ranking**, **Run**, **Needs attention**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), prototype (prototype tickets), codebase-design for the scheduler seam and the ranker contract.

## Decisions so far

- [What each CLI reports when a session hits the provider's own limit](issues/90-provider-limit-signals.md): Claude gives typed `api_error: "usage_limit_reached"` + `rateLimitType`/`resetsAt` in stream-json, Codex only a text message (no reset time); sandcastle flattens both to `exited with code 1`, but `onAgentStreamEvent` sees raw lines; `ordinaryUsageAllowed` is the backend's own flag, not derived from percentages. Source-read only, nothing reproduced live.
- [When a stop lifts, and what reads quota while a provider is stopped](issues/91-stops-lift.md): stopped providers are re-read on every refresh; stops are recomputed per (provider, model) from all conditions and lift when none returns them; a failed read lifts on the next good read and blocks new starts without cancelling live sessions; interrupt becomes a run state, not a stop; lifts are logged.
- [Sleeping until the next reset: what wakeAt returns](issues/92-wake-at.md): wake at the earliest reset over all windows of all stops, capped at a 30 min recheck (which also covers stops with no reset); no cap on total sleep; still stopped on wake → sleep again; interrupt ends the run at once.
- [A provider-limit failure counted as a quota stop](issues/93-provider-limit-failure.md): recognised by Claude's typed `usage_limit_reached` or Codex's error text, else a fresh reading decides; Claude per-model buckets stop provider + model, otherwise the whole provider; held until the failure's reset time (30 min if none) then the normal lifting rule, and that time feeds `wakeAt`; job back to ready, stage not counted as a round; other live sessions with the same key cancelled.
- [pick and the new ranker contract](issues/94-pick-and-ranker-contract.md): new `scheduler.ts` with `admit`, `pick(role, job) → { provider, release() } | none` and `wakeAt`; `running` counts from pick to release; ranker sees only `{ candidates }` and only 2+; `"quota"`/`"order"` error, default `balanced`; built-ins are files through the same loader; a job with no provider gives up its slot and waits; sticky implementer via `Job.implementer`, moves at once when stopped.
- [How plan and doctor explain a ranking or a stop](issues/95-plan-doctor-explain.md): `plan` prints text (Providers with stops and how they lift, Slots, Next stages with the picked provider or why not, would-sleep line), `--json` kept; fills slots like a dry run; no ranker reasons; doctor's ranking row only checks the ranker loads.
- [How scheduling is tested](issues/96-scheduling-tests.md): `scheduler.test.ts` at the `admit`/`pick`/`release`/`wakeAt` seam with scripted readings and one injected clock `{ now(), wait(ms) }`; rankers as plain functions with `Math.random` stubbed; hand-written limit fixtures; exact-text `plan` tests; no real-provider smoke; polling tests left to its own ticket.
- [How quota polling works with several sessions per provider](issues/97-quota-polling.md): one scheduler-owned poller while `running` > 0, due `pollIntervalMs` after the last refresh; a poll's stop cancels same-key live sessions; a throwing stop-condition module is a failed read; `pick` returns a `signal`, `Quotas.run`/`active` go; the loop waits on `nextPollAt()`.
- [Whether Codex's ordinaryUsageAllowed becomes a built-in stop condition](issues/98-ordinary-usage-allowed.md): yes, always on and provider-wide; `Reading` gains `allowed: boolean | null` (Claude always `null`); `null` lifts it; a poll that finds `false` cancels live Codex sessions; `wakeAt` uses the 30 min recheck; reason `provider reports ordinary usage not allowed`.

## Not yet specified

_(nothing left in the fog)_

## Out of scope

- Exporting helpers (quota ranking, `weeklyLeft`) for projects' own rankers and stop conditions: until a project needs them (from spec 4's fog).
- Limiting a role to certain providers: no `role` input until a real case needs it ([How work is split across providers by quota left](../7-harness-boundary/issues/69-provider-split.md); from spec 4's fog).
- Codex `setsid()` shell commands that may survive a process-group SIGTERM, and branches for subagents inside one issue: sandbox concerns from [A Seatbelt sandbox per stage](../7-harness-boundary/issues/65-sandbox-per-stage.md), not scheduling.
- Landing, the merge fix loop and the forge: [spec 8](../8-landing/spec.md).
- New provider adapters.
