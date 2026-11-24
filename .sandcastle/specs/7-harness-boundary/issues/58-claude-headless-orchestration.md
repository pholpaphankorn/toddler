---
title: What Claude Code can orchestrate headless in Seatbelt
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 7
status: open
---
## Question

For Claude Code run headless (`claude -p`, current CLI) inside a toddler Seatbelt sandbox with only its worktree writable: can one session spawn subagents with a distinct prompt each, run them in parallel, give each its own git worktree/branch (does `git worktree add` work under the sandbox's write rules), define agent types in `.claude/agents`, run scripted workflows, and use hooks? Do subagents get fresh context? How do they share quota and model pins? What happens to subagents when the parent process group is killed? Can the session report per-subagent results in a machine-readable form? Cite docs/changelog; mark anything undocumented or untested.
