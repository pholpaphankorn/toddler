---
title: "State, resume and logs: keep, slim, or cut"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Does `state.json` (jobs, sticky implementer, `lastError` pause) and per-stage logging stay as is, shrink, or go, given that continuation is from the preserved worktree ([Quota stops](67-quota-stops.md)), the implementer stays sticky and the reviewer is re-picked each round ([How work is split across providers by quota left](69-provider-split.md)), and a provider-limit failure no longer sets `lastError`? Inventory rows 32, 33.

## Answer

Resolved with phol 2026-11-25, applying [Rule for code, harness or cut](61-code-or-harness-rule.md).

- **`state.json` stays as code**, toddler's own file. Rebuilding it each run from branches and forge PRs would lose round counts, the sticky implementer and the reviewed SHA the publish guard needs; an agent cannot hold it across sessions.
- **Needs attention becomes an explicit job status with a reason**, replacing `lastError` (today written but never read; only the in-memory `attempted` set skips the issue). Reasons: a failed stage, review round cap, merge fix cap ([Unattended runs from a queue](64-unattended-queue.md)), human review required. Skipped for the rest of the run, however long a sleeping run lasts; the next `toddler run` phol starts retries it, as today. No new release command. Provider-limit failures are quota stops, never needs attention ([Quota stops](67-quota-stops.md)).
- **phol learns about it from the run's console output and `state.json`**; the end-of-run summary lists each needs-attention issue with its reason. No forge comment or label for now.
- **Finished jobs stay in state, no pruning.** The files tracker reads `done` for blockers.
- **Logs stay one file per stage in `.sandcastle/logs/`, no pruning.** New: the needs-attention reason includes the failing stage's log path.
- **New state from earlier decisions lives in `state.json`**: the merge fix counter, waiting on auto-merge, needs-attention reasons. Field shapes are for the reshape spec. `reviewer` stays only for the PR body, since the reviewer is re-picked each round ([How work is split across providers by quota left](69-provider-split.md)).
