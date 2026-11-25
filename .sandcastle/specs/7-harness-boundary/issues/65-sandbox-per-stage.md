---
title: "A Seatbelt sandbox per stage: keep, delegate, or drop"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Does every stage need its own Seatbelt sandbox and worktree with tokens scrubbed, or can the provider's own sandbox/permission modes do the job, or is a coarser boundary (one sandbox per batch, none) acceptable? What is the sandbox protecting against? Inventory rows 5, 16–19, 37; facts in [What Claude Code can orchestrate headless in Seatbelt](58-claude-headless-orchestration.md) and [What Codex can orchestrate headless in Seatbelt](59-codex-headless-orchestration.md).

## Answer

Settled with phol 2026-11-25. **Toddler's own Seatbelt sandbox, one per agent, stays as code.** Sandcastle runs Claude with `--dangerously-skip-permissions` and Codex with `--dangerously-bypass-approvals-and-sandbox`, so the sandbox is the only boundary between an agent and phol's machine.

- **What it guards against**: agent mistakes that reach the host (deleting or editing files outside the worktree, `~/.ssh`, other repos) and untrusted issue text steering the agent (reading or sending out secrets, pushing). Rule 1 of [ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md): a guard stays code.
- **Not delegated to the providers' own sandboxes or permission modes**: an agent can't be its own guard, and one Seatbelt profile around either provider guards both the same way.
- **One sandbox and fresh worktree per agent** (one provider, one role, one stage), as today. A reviewer or fixer starts clean and sees only committed work, whatever [One provider builds, the other reviews](66-cross-provider-review.md) decides. The per-stage `install` from the lockfile, the read-only skills mount and the private home with the provider login follow from this and stay (inventory rows 16–18).
- **The sandbox is not widened for subagents.** Subagents inside one issue share its worktree or make git worktrees inside it or under `$TMPDIR`; Claude's `.claude/worktrees` stays unwritable. How subagents get branches is left to a reshape spec.
- **Subscription-only env stays** (row 37): API keys are stripped from the sandbox and from host calls, so a run never bills an API account. Forge tokens are decided in [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md).
- **Stop on cancel stays** (row 19). Known gap for the reshape spec: Codex starts shell commands under `setsid()`, so a process-group SIGTERM may orphan one ([What Codex can orchestrate headless in Seatbelt](59-codex-headless-orchestration.md)).
- **Smoke** (row 5): `smoke-seatbelt` stays; `smoke-agents` (one real model call per role) is cut.
