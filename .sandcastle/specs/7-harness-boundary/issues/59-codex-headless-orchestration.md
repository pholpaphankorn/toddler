---
title: What Codex can orchestrate headless in Seatbelt
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude (research subagent)
---
## Question

Same questions as [What Claude Code can orchestrate headless in Seatbelt](58-claude-headless-orchestration.md), for the Codex CLI run headless (`codex exec`, current version) inside toddler's Seatbelt sandbox: subagents or multi-agent features, distinct prompts, parallelism, per-subagent worktrees/branches, fresh context, quota sharing, behaviour on kill, machine-readable results. If Codex has no subagents, say what the closest equivalent is. Cite docs/source/changelog; mark anything undocumented.

## Answer

Full findings: `docs/research/codex-headless-orchestration.md` on local branch `research/codex-headless-orchestration` (sources: openai/codex source at `rust-v0.163.0`, local CLI help, docs subagents page). Nothing was run; read from source.

- **Subagents exist and are on by default under `codex exec`** (`multi_agent` feature): model-called tools `spawn_agent` / `send_input` / `wait` / `close_agent`. No CLI flag drives them; only the prompt, `AGENTS.md` or a skill can ask.
- **Distinct prompt per worker, parallel, fresh context** (`fork_context` false by default). Max 6 workers per session, depth 1.
- **No per-worker worktree or branch**: workers share the parent's cwd, sandbox and approval policy, so parallel workers edit one checkout. `codex exec --worktree` makes one detached-HEAD worktree under `$CODEX_HOME` (toddler's private home), per session, not per worker; untested under Seatbelt.
- **Shared quota; soft model pin**: workers inherit the model, but the parent model may choose another `model` / `reasoning_effort` per worker, which could bypass toddler's per-role pin and per-model quota stops.
- **`--json` shows workers only as `collab_tool_call` items** on the parent; a worker's own commands/edits are filtered; a failed worker doesn't fail the run.
- **Kill**: workers are threads in one process and die with it. Risk (inferred, untested, affects plain `codex exec` today): shell-tool commands start under `setsid()`, so a process-group SIGTERM on macOS may orphan a running command inside the sandbox.
- **Alternatives**: experimental `codex app-server` hosts many threads with their own model/cwd but one process and one Seatbelt profile; no `codex mcp-server` in 0.163.0. Off switch: `--disable multi_agent` or `-c agents.enabled=false`.
