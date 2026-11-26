---
title: Do subagents inside one issue need their own branches?
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

Inside one issue's sandbox, Claude's built-in worktree isolation writes to `.claude/worktrees`, which the sandbox keeps unwritable; subagents share the issue's worktree or make git worktrees inside it or under `$TMPDIR` ([A Seatbelt sandbox per stage](../../7-harness-boundary/issues/65-sandbox-per-stage.md), [What Claude Code can orchestrate headless in Seatbelt](../../7-harness-boundary/issues/58-claude-headless-orchestration.md)). Is anything actually missed?

- Has a run failed or produced tangled commits because subagents shared a checkout?
- If yes: a line in `prompts/rules.md` (make worktrees under `$TMPDIR`, merge back before committing), a writable worktree dir, or a hook that places worktrees; if no: rule it out of scope.
