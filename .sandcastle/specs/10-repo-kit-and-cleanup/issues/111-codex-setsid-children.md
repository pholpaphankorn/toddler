---
title: What happens to Codex's setsid() children when a stage is cancelled
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

Codex starts shell commands under `setsid()` ([What Codex can orchestrate headless in Seatbelt](../../7-harness-boundary/issues/59-codex-headless-orchestration.md)), so they leave the process group that toddler/sandcastle signals on cancel ([A Seatbelt sandbox per stage](../../7-harness-boundary/issues/65-sandbox-per-stage.md)).

1. In Codex's source (current release), which commands get `setsid()`, and does Codex itself kill them when it gets SIGTERM/SIGINT (or when its own parent dies)?
2. How `@ai-hero/sandcastle` 0.14.0 stops an agent (signal, target pid/pgid, timeout, SIGKILL) and what toddler's `stop` adds ([process.ts](../../../../src/process.ts), [agents.ts](../../../../src/agents.ts)).
3. Under Seatbelt on macOS, what toddler could use to reap stragglers (process tree walk via `ps`/`pgrep -P`, session id, a marker env var), and whether Seatbelt limits that.
4. Any known reports of orphaned Codex children.

Cite versions and source lines; mark anything not reproduced live.
