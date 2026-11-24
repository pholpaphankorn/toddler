---
title: What Claude Code can orchestrate headless in Seatbelt
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude (research subagent)
---
## Question

For Claude Code run headless (`claude -p`, current CLI) inside a toddler Seatbelt sandbox with only its worktree writable: can one session spawn subagents with a distinct prompt each, run them in parallel, give each its own git worktree/branch (does `git worktree add` work under the sandbox's write rules), define agent types in `.claude/agents`, run scripted workflows, and use hooks? Do subagents get fresh context? How do they share quota and model pins? What happens to subagents when the parent process group is killed? Can the session report per-subagent results in a machine-readable form? Cite docs/changelog; mark anything undocumented or untested.

## Answer

Full findings: `docs/research/claude-headless-orchestration.md` on local branch `research/claude-headless-orchestration` (sources: code.claude.com docs, `claude --help` 2.1.306, sandcastle 0.14.0 source; probes: `git worktree add` inside a real sandcastle `seatbelt()` sandbox, a live `claude -p` run on the host, a process-group kill). Not tested end to end inside a toddler run.

- **Distinct prompt per subagent, parallel, fresh context: yes** (forks excepted). Defaults: 20 concurrent, nesting depth 3. Project `.claude/agents` load under `-p`; `--agents` also works.
- **Per-subagent branch is possible but not via Claude's own `isolation: worktree`**: it creates worktrees under the main checkout's `.claude/worktrees`, which the sandbox can't write. `git worktree add` works inside the sandbox worktree or `$TMPDIR`; branches land in the host's shared `.git` and outlive the sandbox. A `WorktreeCreate` hook could redirect it (untested).
- **Scripted workflows run under `-p`** as saved `.claude/workflows/*.js` (`/name`); 16 concurrent, 1,000 agents per run; untested here.
- **Hooks**: project `.claude/settings.json` hooks fire under `-p` (`SubagentStart`/`SubagentStop` with `agent_id`, `cwd`); subagent-frontmatter hooks need the folder trusted in `~/.claude.json`.
- **Quota and model**: subagents share the parent's limits; in `-p` they fail rather than pause at a limit. `CLAUDE_CODE_SUBAGENT_MODEL` + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` pins one model.
- **Machine-readable results**: `stream-json` (already what sandcastle reads) has `task_started` / `task_progress` / `task_notification` and per-Agent `agentId`, `usage`, `worktreeBranch`; partly documented. `--output-format json` has no per-subagent split, and sandcastle's parser skips subagent messages.
- **Kill (observed)**: subagents die with the parent, but each Bash command runs in its own process group and **survived** the SIGKILL sandcastle sends, reparented to PID 1. SIGTERM first lets Claude kill its Bash trees. Same class of risk as the Codex finding.
