---
title: Which scheduling choices the ranking drives
labels: [wayfinder:grilling, on-hold]
blocked_by: [20]
parent: 4
status: open
---
## Question

Today [policy.ts](../../../../src/policy.ts) makes three provider choices: who implements a lone issue (Codex first), who takes each of two `parallel-safe` issues, and who reviews (the other provider, falling back to the same one). Which of these does the ranking decide? In particular, does "review goes to the other provider" stay a rule above the ranking, and is the ranking recomputed per stage or once per run?

From [Weekly and five-hour stop thresholds](22-stop-thresholds.md): availability is per **provider and model**, not per provider. A per-model weekly bucket can stop one model while the provider stays available for roles on other models, so a choice must check the model the role will run.
