---
title: Rule for code, harness or cut
labels: [wayfinder:grilling, on-hold]
blocked_by: [57]
parent: 7
status: closed
assignee: claude
---
## Question

What rule decides whether a toddler feature stays as code, is delegated to the provider's harness, or is cut? Nothing is assumed (see the map's reset note). Candidate inputs: enforces something the agent can't be trusted to keep; must both Claude Code and Codex be able to do it before it counts as delegated; deterministic and repeated; needs judgement; token cost (and whether that alone is a reason); reliability; maintenance cost. Settle the rule and test it against a few features from [Inventory of toddler's features](57-feature-inventory.md).

## Answer

Settled with phol 2026-11-24. The rule is recorded in [ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md). The three outcomes are **keep as code / delegate to the agent / cut**. "Harness" was dropped: what matters is what the agent can do, whether through its provider's features or through ordinary commands.

In order: (1) guards against the agent → code; (2) phol wouldn't miss it → cut; (3) needs thinking, no exactly repeatable result, and every supported provider's agent can do it → agent, given text only, plus a cheap code check where a wrong result matters, and duplicate code goes; (4) otherwise deterministic → code. Token cost only breaks ties. Working code is deleted only after one real run in the sandbox shows the agent doing it. That proof belongs to the reshape specs.

Tested against inventory rows (the real decisions stay with their own tickets):

| Row | Rule says |
|---|---|
| 10, 12, 13 scheduling, concurrency slots, per-issue loop | Agent, plus a code check on branches and clean trees. Each worker can make its own branch with `git worktree add` under `$TMPDIR`, which the Claude research saw working in Seatbelt; branch refs outlive the sandbox. |
| 20 post-stage gates | Code, if the guard is kept |
| 21 format after implementation | Code (deterministic) |
| 23 base conflicts | Agent resolves, code detects |
| 34 prompt assembly | Code (deterministic) |
| 11 ranking | Not cut: phol wants providers chosen by quota left, so it stays code. It needs reshaping into a rule that splits work across providers; see [How work is split across providers by quota left](69-provider-split.md). |
