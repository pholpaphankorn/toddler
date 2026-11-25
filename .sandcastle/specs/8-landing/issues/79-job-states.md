---
title: Job states, state.json fields and the run summary
labels: [wayfinder:grilling, on-hold]
blocked_by: [75, 77]
parent: 8
status: open
---
## Question

Settled in [State, resume and logs](../../7-harness-boundary/issues/71-state-resume.md): needs attention becomes an explicit job status with a reason (failed stage, review round cap, merge fix cap, human review required), skipped for the rest of the run and retried by the next `toddler run`; the reason includes the failing stage's log path; the end-of-run summary lists each one; the merge fix counter and "waiting on auto-merge" live in `state.json`.

Decide the shapes: the `Job.status` values after the reshape (today `implementation | review | approved | pr | done`) and how a needs-attention job remembers where to resume; the new fields and which old ones go (`lastError`, `conflictBase`, the in-memory `attempted` set); and what the run summary prints.
