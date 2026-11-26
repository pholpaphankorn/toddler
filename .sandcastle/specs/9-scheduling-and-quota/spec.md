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

## Not yet specified

- Whether `Reading` should carry Codex's `ordinaryUsageAllowed` (a backend yes/no its source trusts over percentages) as a built-in stop condition; carried over from spec 4, and likely shaped by [What each CLI reports when a session hits the provider's own limit](issues/90-provider-limit-signals.md).
- How 60-second quota polling works once several sessions share one provider and nothing may be running while the run sleeps (one shared poller vs per-session timers).

## Out of scope

- Exporting helpers (quota ranking, `weeklyLeft`) for projects' own rankers and stop conditions: until a project needs them (from spec 4's fog).
- Limiting a role to certain providers: no `role` input until a real case needs it ([How work is split across providers by quota left](../7-harness-boundary/issues/69-provider-split.md); from spec 4's fog).
- Codex `setsid()` shell commands that may survive a process-group SIGTERM, and branches for subagents inside one issue: sandbox concerns from [A Seatbelt sandbox per stage](../7-harness-boundary/issues/65-sandbox-per-stage.md), not scheduling.
- Landing, the merge fix loop and the forge: [spec 8](../8-landing/spec.md).
- New provider adapters.
