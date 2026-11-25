---
title: "State, resume and logs: keep, slim, or cut"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: open
---
## Question

Does `state.json` (jobs, sticky implementer, `lastError` pause) and per-stage logging stay as is, shrink, or go, given that continuation is from the preserved worktree ([Quota stops](67-quota-stops.md)), the implementer stays sticky and the reviewer is re-picked each round ([How work is split across providers by quota left](69-provider-split.md)), and a provider-limit failure no longer sets `lastError`? Inventory rows 32, 33.
