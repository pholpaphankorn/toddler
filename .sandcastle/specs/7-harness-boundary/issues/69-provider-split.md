---
title: How work is split across providers by quota left
labels: [wayfinder:grilling, on-hold]
blocked_by: [62]
parent: 7
status: closed
assignee: claude
---
## Question

phol wants providers chosen by quota left (see [Rule for code, harness or cut](61-code-or-harness-rule.md)), but today's ranking only picks one implementer per issue. What rule splits a set of ready issues across the available providers by their quota left, under the scheduling answer from [One orchestrator session per batch or one session per issue](62-orchestrator-session.md)? Does the project ranker module survive? Inventory rows 10, 11.

Scheduling answer: one session per issue, up to `maxParallelIssues` at once, and one provider may run several of them. So the rule assigns a provider to each of up to N ready issues.

From [One provider builds, the other reviews](66-cross-provider-review.md): the reviewer is also chosen by quota left and may be the implementer's provider, so the rule assigns a provider to each review stage too, not only to each implementation.

From [Quota stops](67-quota-stops.md): stops now lift when quota recovers and the runner sleeps to the next reset, so a provider can drop out and come back within one run; the split is recomputed as that happens.

## Answer

Settled with phol 2026-11-25. **Ranking stays extendable as a module; infant ships two rankers, `balanced` (default) and `most-quota`.** Today's built-in quota ranker and the `order` mode go.

- **A provider is picked when each stage starts**, on a fresh quota reading and the sessions running at that moment. No split of the ready set up front.
- **Contract**: the ranker gets `{ candidates: [{ provider, model, reading, running }] }`, where `running` is that provider's live sessions in every role. It returns every candidate provider, reordered, synchronously. Today's validation stays. infant takes the first, and the rest are the fallback order. No `role` input until a real case needs it.
- **`balanced`** (default): score = quota left ÷ (running + 1), where quota left is the tighter of weekly-for-the-model and five-hour, rounded down. Highest score first; a coin flip breaks ties. Work spreads in proportion to quota left, with neither provider starved. Plans of different sizes are not corrected for.
- **`most-quota`**: ignores `running`. Weekly left for the model, then five-hour, then a coin flip (today's sort), applied to every slot. Everything lands on one provider until it is stopped.
- **Both are built-in modules written against the public contract, picked by name** (`"ranking": "balanced" | "most-quota"`). A project-relative path still loads the project's own module, and the doctor check for it stays.
- **`order` is dropped**, along with today's built-in rule. A fixed preference can be written later as another module.
- **The implementer stays on later rounds** while it has quota. The ranker picks it only on the first round or when that provider is stopped.
- **The reviewer is picked again by the ranker every review round**, with no stickiness, and may be the implementer ([One provider builds, the other reviews](66-cross-provider-review.md)).
- `assignments()`' two-slot, opposite-provider pairing and `reviewer()`'s opposite-provider preference go; scheduling up to `maxParallelIssues` is from [One orchestrator session per batch or one session per issue](62-orchestrator-session.md).
