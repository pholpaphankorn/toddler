---
title: Reap a stage's leftover processes
labels: []
blocked_by: []
parent: 10
status: closed
---
Ctrl+C or SIGTERM on toddler cancels running stages cleanly, and no stage or landing sandbox leaves processes behind when it closes. Settled in [How toddler reaps a stage's leftover processes](113-reap-stage-stragglers.md) (research: [111](111-codex-setsid-children.md)).

1. **Signals reach toddler first.** One helper in `agents.ts`, called right after every `createSandbox` (runner and landing), removes every SIGINT/SIGTERM listener except toddler's own `stop`. Then `stop` → scheduler abort cancels stages, whose `finally` runs `stopAgent` → sweep → `close()`; toddler exits 130; a second signal exits at once. `shortcut:` comment: relies on sandcastle's internal listener behaviour; switch to an upstream option if sandcastle adds one.
2. **cwd sweep before every `close()`**: SIGKILL every process owned by the user, other than toddler, whose cwd is under the stage's worktree or its `sandcastle-seatbelt-*` private root, found with `lsof -a -d cwd`. Stages run it after `stopAgent`'s grace period; landing sandboxes run it with no `stopAgent`. Provider-independent. `shortcut:` comment: a process that moved its cwd outside those paths escapes.
3. **Log line** when anything is killed: `[issue #N] killed 3 leftover processes (pids …)`. Nothing in `state.json` or the run summary.
4. **Crash is a known gap**: no startup sweep; README notes `lsof +D .sandcastle/worktrees` to find leftovers after a crash.

- [ ] `tests/agent-stop.test.ts`, real seatbelt sandbox, fake agent: a self-detached `setsid nohup sleep` ignoring INT/TERM is gone after the stop path; a fake ignoring its signal past a short `graceMs` is swept; a host `sleep` with cwd outside the worktree and private dirs survives
- [ ] Guard test: after `createSandbox` and the strip helper, `process.listeners("SIGINT")`/`("SIGTERM")` hold only toddler's listener
- [ ] End-to-end Ctrl+C during a stage checked once by hand; result noted in the summary
