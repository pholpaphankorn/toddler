---
title: One orchestrator session per batch or one session per issue
labels: [wayfinder:grilling, adult]
blocked_by: [58, 59, 61]
parent: 7
status: closed
assignee: claude
---
## Question

Should toddler keep scheduling one provider session per issue (today's runner), or hand a batch of ready issues to one provider session that parallelises with its own subagents, one branch per issue? Which gates, if any, sit outside that session follows from the guarantee tickets; don't assume them. Weigh against the facts in [What Claude Code can orchestrate headless in Seatbelt](58-claude-headless-orchestration.md) and [What Codex can orchestrate headless in Seatbelt](59-codex-headless-orchestration.md), and the rule from [Rule for code, harness or cut](61-code-or-harness-rule.md).

## Answer

Settled with phol 2026-11-25. **One provider session per issue stays.** No batch goes into one session. What phol wants is more issues at once, and toddler can do that itself; a provider's subagents are only for the work inside one issue. Reason: one session per issue keeps each issue isolated with its own sandbox and checks (rule 1, a guard), and it is simpler.

- **Toddler picks the ready issues** (no open blockers, not on hold). That work is deterministic, so it stays code.
- **New config `maxParallelIssues`** (default 2, today's effective cap) limits how many issues run at once.
- **The `parallel-safe` label stays**: an issue without it always runs alone; issues with it share the run up to the cap.
- **One provider can run several issue sessions at once.** The one-session-per-provider-and-role queue (inventory row 12) goes. Which provider gets which issue is decided in [How work is split across providers by quota left](69-provider-split.md).
- **Code checks on each issue's branch decide the outcome** (it exists, descends from the base, is not empty, the tree is clean), as the post-stage gates do today. The agent's own report is not trusted.
- **The per-issue loop is unchanged**: implement → review → requested changes, with the round limit and provider fallback. Whether review stays cross-provider is decided in [One provider builds, the other reviews](66-cross-provider-review.md).
- **Subagents inside one issue's session are allowed** (Claude when it decides to, Codex by default). The Codex worker model-choice risk moved to [Quota stops](67-quota-stops.md).

This reverses the batch example in ADR 0001 and the "Agent" verdict for rows 10, 12 and 13 in [Rule for code, harness or cut](61-code-or-harness-rule.md); both are updated.
