---
title: What happens to Codex's setsid() children when a stage is cancelled
labels: [wayfinder:research, adult]
blocked_by: []
parent: 10
status: closed
assignee: claude (research subagent)
---
## Question

Codex starts shell commands under `setsid()` ([What Codex can orchestrate headless in Seatbelt](../../7-harness-boundary/issues/59-codex-headless-orchestration.md)), so they leave the process group that toddler/sandcastle signals on cancel ([A Seatbelt sandbox per stage](../../7-harness-boundary/issues/65-sandbox-per-stage.md)).

1. In Codex's source (current release), which commands get `setsid()`, and does Codex itself kill them when it gets SIGTERM/SIGINT (or when its own parent dies)?
2. How `@ai-hero/sandcastle` 0.14.0 stops an agent (signal, target pid/pgid, timeout, SIGKILL) and what toddler's `stop` adds ([process.ts](../../../../src/process.ts), [agents.ts](../../../../src/agents.ts)).
3. Under Seatbelt on macOS, what toddler could use to reap stragglers (process tree walk via `ps`/`pgrep -P`, session id, a marker env var), and whether Seatbelt limits that.
4. Any known reports of orphaned Codex children.

Cite versions and source lines; mark anything not reproduced live.

## Answer

Researched 2026-11-26 from Codex `rust-v0.172.0` source (logic checked against the installed 0.163.0), installed sandcastle 0.14.0, and the macOS 27.2.1 man pages, plus one live `sandbox-exec` probe using `perl`/`sleep` stand-ins. No real agent was run and no quota used. Full findings: `docs/research/codex-setsid-children.md` on local branch `research/codex-setsid-children` (commit `3da8942`, not pushed).

1. **Codex**: every shell command the model runs is `setsid()`'d into its own session and process group (`exec_command` pipe and PTY modes, plus the older shell tool). `codex exec` handles only SIGINT: shutdown then sends SIGKILL to each command's group (read in source, not run). SIGTERM and SIGKILL have no handler, so commands are orphaned. The parent-death signal is Linux-only. Commands that detach themselves (`setsid`/`nohup &`) escape even a clean shutdown (openai/codex#10860).
2. **sandcastle**: each exec is a detached `sandbox-exec … /bin/sh -c`, so the shell's group id equals its pid. Its only kill is SIGKILL to that group, with no grace period. It fires on shell exit, on `close()`, from its own SIGINT/SIGTERM handler (which then `process.exit(1)`s), and from a host-death watchdog. **toddler**: `stopAgent` ([agents.ts](../../../../src/agents.ts)) sends SIGINT to that group from the host and waits up to 10 s before `close()`, which triggers Codex's clean shutdown. **Gaps**: Ctrl+C or SIGTERM to toddler (sandcastle exits before `stopAgent` runs), Codex taking more than 10 s to shut down, toddler crashing, and self-detached commands.
3. **Reaping** must happen on the host, because a same-sandbox process can't `kill`/`ps` (probe). From the host, `kill`, `pgrep -P`, `ps -o pid,ppid,pgid` and `lsof -a -d cwd` all reach sandboxed `setsid` processes. These don't help: `ps -o sess` (always 0), reading another process's environment with `ps -E`, and a parent-pid walk once Codex is gone (children are re-parented to pid 1). Suggested approach: record the group's descendants before signalling, SIGKILL any still alive after the grace period if their start time matches, and as a backstop kill processes whose current directory is under the stage's worktree or private home/tmp.
4. **Known reports** (open on openai/codex): #15379 (macOS, children outlive the parent), #61647 (Linux, orphans under init), #10860 (`setsid` survives turn-end cleanup), and the related leaks #14962, #30408, #54877. None covers macOS `codex exec` + SIGTERM exactly; that case comes from source only.

Most likely orphan source today: Ctrl+C on toddler itself, because sandcastle's signal handler skips `stopAgent`.
