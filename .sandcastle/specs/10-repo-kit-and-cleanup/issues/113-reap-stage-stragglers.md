---
title: How toddler reaps a stage's leftover processes
labels: [wayfinder:grilling, on-hold]
blocked_by: [111]
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

Given [What happens to Codex's setsid() children when a stage is cancelled](111-codex-setsid-children.md), what does toddler do so a cancelled or finished stage leaves no processes behind?

- Which gaps to close: Ctrl+C or SIGTERM on toddler (sandcastle's handler SIGKILLs and `process.exit(1)`s before `stopAgent` runs), Codex shutting down in more than 10 s, toddler crashing, and self-detached commands.
- The mechanism: a descendant list captured before SIGINT, then SIGKILL after the grace period with a start-time check; and/or a backstop that kills by current directory (`lsof -a -d cwd`) under the stage's worktree or private home/tmp, run after `close()`.
- How toddler gets in ahead of sandcastle's signal handler (its own handler first? a sandcastle change?), and whether this applies to Claude stages too.
- Whether anything is logged or reported when stragglers are killed, and how it is tested without real agents.

## Answer

Resolved with phol 2026-11-28 (grilling).

1. **Ctrl+C/SIGTERM during a stage cancels it cleanly.** Sandcastle's SIGINT/SIGTERM listeners are stripped right after every `createSandbox` (`runner.ts` and `landing.ts`), by one helper in `agents.ts` that removes every SIGINT/SIGTERM listener except toddler's own `stop`. They must go before a signal arrives: Node copies the listener list before calling it, so removing them inside toddler's handler is too late. Sandcastle installs them once behind a flag, so they stay gone; its `exit` teardown is kept as a last resort. The existing `stop` → `quotas.stop()` → scheduler abort then cancels every running stage, whose `finally` runs `stopAgent` → sweep → `close()`; toddler exits 130. A second signal exits at once. The helper carries a `shortcut:` comment: it relies on sandcastle's internal listener behaviour; switch to an upstream option if sandcastle adds one.
2. **One mechanism: a cwd sweep.** After `stopAgent`'s grace period and before `close()` (the `finally` in `runner.ts`), toddler SIGKILLs every process owned by the user, other than toddler itself, whose cwd is under the stage's worktree or its `sandcastle-seatbelt-*` private root, found from the host with `lsof -a -d cwd`. This covers a slow Codex shutdown and self-detached commands. No descendant snapshot; a process that moved its cwd outside those paths escapes (`shortcut:` comment).
3. **Landing sandboxes** (install + verify, no agent) get the same sweep before their `close()`; no `stopAgent`.
4. **Both providers**: the sweep doesn't depend on the provider; `stopAgent` already handles Claude (SIGTERM) and Codex (SIGINT).
5. **A toddler crash is a known gap.** No startup sweep: a preserved worktree may hold the person's own shell or editor. The README notes `lsof +D .sandcastle/worktrees` to find leftovers after a crash.
6. **Reporting**: one console/log line when the sweep kills anything, `[issue #N] killed 3 leftover processes (pids …)`, like the `preserved …` line. Nothing in `state.json` or the run summary.
7. **Tests** in `tests/agent-stop.test.ts`, real seatbelt sandbox with a fake agent (no real CLI, no quota): a self-detached `setsid nohup sleep` that ignores INT/TERM is gone after the stop path; a fake that ignores its own signal past a short `graceMs` is swept; a host `sleep` whose cwd is outside the worktree and private dirs survives. Plus a guard test: after `createSandbox` and the strip helper, `process.listeners("SIGINT")`/`("SIGTERM")` hold only toddler's listener. The end-to-end Ctrl+C path is checked once by hand when implemented.
