---
title: How work is split across providers by quota left
labels: [wayfinder:grilling, on-hold]
blocked_by: [62]
parent: 7
status: open
---
## Question

phol wants providers chosen by quota left (see [Rule for code, harness or cut](61-code-or-harness-rule.md)), but today's ranking only picks one implementer per issue. What rule splits a set of ready issues across the available providers by their quota left, under the scheduling answer from [One orchestrator session per batch or one session per issue](62-orchestrator-session.md)? Does the project ranker module survive? Inventory rows 10, 11.

Scheduling answer: one session per issue, up to `maxParallelIssues` at once, and one provider may run several of them. So the rule assigns a provider to each of up to N ready issues.

From [One provider builds, the other reviews](66-cross-provider-review.md): the reviewer is also chosen by quota left and may be the implementer's provider, so the rule assigns a provider to each review stage too, not only to each implementation.
