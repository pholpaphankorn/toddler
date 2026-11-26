---
title: How infant reaps a stage's leftover processes
labels: [wayfinder:grilling, on-hold]
blocked_by: [111]
parent: 10
status: open
---
## Question

Given [What happens to Codex's setsid() children when a stage is cancelled](111-codex-setsid-children.md), what does infant do so a cancelled or finished stage leaves no processes behind?

- Which gaps to close: Ctrl+C or SIGTERM on infant (sandcastle's handler SIGKILLs and `process.exit(1)`s before `stopAgent` runs), Codex shutting down in more than 10 s, infant crashing, and self-detached commands.
- The mechanism: a descendant list captured before SIGINT, then SIGKILL after the grace period with a start-time check; and/or a backstop that kills by current directory (`lsof -a -d cwd`) under the stage's worktree or private home/tmp, run after `close()`.
- How infant gets in ahead of sandcastle's signal handler (its own handler first? a sandcastle change?), and whether this applies to Claude stages too.
- Whether anything is logged or reported when stragglers are killed, and how it is tested without real agents.
