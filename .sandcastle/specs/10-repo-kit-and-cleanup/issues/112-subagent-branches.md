---
title: Do subagents inside one issue need their own branches?
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

Inside one issue's sandbox, Claude's built-in worktree isolation writes to `.claude/worktrees`, which the sandbox keeps unwritable; subagents share the issue's worktree or make git worktrees inside it or under `$TMPDIR` ([A Seatbelt sandbox per stage](../../7-harness-boundary/issues/65-sandbox-per-stage.md), [What Claude Code can orchestrate headless in Seatbelt](../../7-harness-boundary/issues/58-claude-headless-orchestration.md)). Is anything actually missed?

- Has a run failed or produced tangled commits because subagents shared a checkout?
- If yes: a line in `prompts/rules.md` (make worktrees under `$TMPDIR`, merge back before committing), a writable worktree dir, or a hook that places worktrees; if no: rule it out of scope.

## Answer

Ruled out of scope (phol, 2026-11-28). Across the 82 stage logs in `.sandcastle/logs`, subagents ran three times: the Claude review stages for issues 26, 28 and 29. Each time the code-review skill split its Standards and Spec axes into two parallel `Agent(...)` calls. Both subagents only read, sharing the stage's worktree and sandbox, and the review finished cleanly. No implementation stage started a subagent, none ran `git worktree add`, and no run failed or made tangled commits because of a shared checkout. No change to `prompts/rules.md`, the sandbox or hooks: the existing "Wait for all subagents before committing or responding" rule covers the one real risk. If a run ever trips on this, it comes back as a fresh effort.
