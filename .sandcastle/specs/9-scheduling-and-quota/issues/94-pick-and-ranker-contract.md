---
title: pick and the new ranker contract
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: closed
assignee: claude
---
## Question

[How work is split across providers by quota left](../../7-harness-boundary/issues/69-provider-split.md) settled the ranker input `{ candidates: [{ provider, model, reading, running }] }`, the `balanced` and `most-quota` modules, a sticky implementer and a reviewer re-picked each round. Decide how `pick(role, job) → provider | none` does it:

- Migration: today's contract passes `role` and `issue`, and configs may say `"quota"` or `"order"`. Error, translate, or keep extra fields?
- `running` when two slots are filled at once: does the second pick see the first's session?
- When the ranker is called: with one candidate, with none; whether `pick` returns none for one role while another role could still start (per-model stops), and how the loop treats that.
- Sticky implementer across merge fix rounds and resumed jobs (state field?), and what "has quota" means for stickiness.
- Where `maxParallelIssues` and `parallel-safe` are read (the scheduler seam), and what replaces `assignments()` / `reviewer()`.
- Whether the built-in modules ship as files loaded through the same loader as a project's module.

> From [A provider-limit failure counted as a quota stop](93-provider-limit-failure.md): a limit stop is an ordinary stop for stickiness; decide here whether a stopped sticky implementer moves to another provider.

## Answer

Settled with phol 2026-11-26. **A new `scheduler.ts` deep module owns quotas, the ranker and reservations; the loop only asks it `admit`, `pick` and `wakeAt`.**

- **Seam** (changes spec 8's `pick → provider | none`): `pick(role, job) → { provider, release() } | none`; `admit(issue, runningIssues) → boolean`; `wakeAt()`. `release()` runs whenever the stage ends (success, failure or limit stop). `assignments()`, `reviewer()` and `ranked()` leave `policy.ts`; `ready()` and `reviewReport()` stay.
- **`admit`** reads `maxParallelIssues` (new config, default 2) and the `parallel-safe` rule: an issue without the label runs only when nothing else is running and blocks other starts while it runs; with it, issues share up to the cap. A fresh issue starts only when `admit` says yes **and** `pick(implementation)` returns a provider; otherwise no job is created and it stays ready.
- **`running`** counts a provider from the moment `pick` returns it until `release()`, across roles, so slots filled in one pass see each other. `Quotas.active` (counted only once sandcastle starts) is not used for it.
- **Ranker calls**: 0 candidates → none, no call; 1 candidate → that provider, no call (today's rule). A project module only ever sees 2+. Candidates are configured providers with a reading, not stopped for that role's model.
- **Contract**: input is `{ candidates: [{ provider, model, reading, running }] }` only; `role` and `issue` are dropped with no shim. The output permutation check stays.
- **Old config values**: `"ranking": "quota"` and `"order"` are config-load errors naming the replacement (`"balanced"`/`"most-quota"`; `order` removed, write a module). Default becomes `"balanced"`.
- **Built-in rankers ship as files** (`src/rankers/balanced.ts`, `src/rankers/most-quota.ts`), default export against the public contract, loaded through the same `loadRanker` path and validation. The exact names `"balanced"`/`"most-quota"` resolve to them; anything else is a project-relative path (`./balanced` for a project file of that name). Coin-flip control in tests is left to [How scheduling is tested](96-scheduling-tests.md).
- **`pick` returns none for one role only** (e.g. both review models stopped): the job gives up its slot and waits at its stage, not needs attention. The loop keeps filling free slots with stages that can start. Fill order: merge fixes, then waiting jobs, then fresh issues. A waiting job is not running; a waiting non-`parallel-safe` job resumes only once nothing else runs (may wait, never stuck). `wakeAt` is asked only when nothing at all can start.
- **Sticky implementer** uses the existing `Job.implementer`, no new state: at every implementation stage start (later rounds, merge fix rounds, resumed jobs), if it is still configured and not stopped for its implementation model (thresholds, stop conditions or a limit stop alike), it is used without the ranker; otherwise the ranker picks. The first implementer comes from `pick`; `initialProvider` at job creation goes.
- **Stopped sticky implementer moves at once** to the ranker's pick, which becomes the sticky implementer after its stage succeeds; no moving back when the old stop lifts. A limit stop from [A provider-limit failure counted as a quota stop](93-provider-limit-failure.md) sends the job back to wait, and the move happens on its next `pick`.
- Review stays re-picked every round with no stickiness ([How work is split across providers by quota left](../../7-harness-boundary/issues/69-provider-split.md)). No ADR: the choice was made in spec 7 and this is easy to reverse.
