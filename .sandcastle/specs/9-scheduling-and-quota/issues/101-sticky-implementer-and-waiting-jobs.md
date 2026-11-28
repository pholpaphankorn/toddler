---
title: Sticky implementer, re-picked reviewer, waiting jobs
labels: []
blocked_by: [99]
parent: 9
status: closed
---
An issue keeps the provider that started building it while that provider has quota, review is re-picked every round, and a job whose role has no provider waits instead of holding a slot or failing.

1. **Sticky implementer** through the existing `Job.implementer`, no new state: at every implementation stage start (later rounds, merge fix rounds, resumed jobs), if it is still configured and not stopped for its implementation model, it is used without the ranker; otherwise the ranker picks. The first implementer comes from `pick`; `initialProvider` at job creation goes.
2. **A stopped sticky implementer moves at once** to the ranker's pick, which becomes the sticky implementer after its stage succeeds. No moving back when the old stop lifts.
3. **Review is re-picked every round**, no stickiness.
4. **`pick` returns none for one role only** (e.g. both review models stopped): the job gives up its slot and waits at its stage; not needs attention. The loop keeps filling free slots with stages that can start. A waiting job is not running; a waiting non-`parallel-safe` job resumes only once nothing else runs.
5. **Fill order**: merge fixes (once spec 8's #87 lands), then waiting jobs, then fresh issues. `wakeAt` is asked only when nothing at all can start.

- [ ] Scheduler tests: sticky implementer kept; moves at once when stopped; no move back after the lift; reviewer re-picked each round; a per-model stop gives none for one role while another stage starts
- [ ] Loop test: a job with no reviewer waits and frees its slot; it resumes when a reviewer has quota
