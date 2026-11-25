---
title: "Quota stops: keep, delegate, or drop"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Should toddler read subscription quota and stop or hand over work at thresholds, or rely on the providers' own limits (Claude subagents fail at a limit under `-p`)? What failure would a missing quota stop cause for phol? Inventory rows 30, 31 (~430 lines).

Fact from [Rule for code, harness or cut](61-code-or-harness-rule.md): phol wants providers chosen by quota left, so toddler keeps reading quota. Whether it also *stops* on quota is still open here.

Also decide here: Codex workers inside an issue session can pick another model, which may get past per-model quota stops ([One orchestrator session per batch or one session per issue](62-orchestrator-session.md) allows subagents within one issue).

## Answer

Settled with phol 2026-11-25. **Quota stops stay as code**, on the same quota reads that pick providers by quota left. What a missing stop would cost: toddler drains the subscription and phol can't use Claude Code or Codex by hand for days; second, sessions die at the provider's hard limit. An agent can't see its quota and can't be its own stop, so this is not delegated (rule 1 and 4 of [ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md)).

- **Stop thresholds and stop conditions both stay** (rows 30, 31). Project stop-condition modules are kept although unused today: phol wants the hook open to non-quota reasons. Its shape does not change now (`{ provider, reading, models }` in, provider or model stops out); inputs or outcomes are added when a real non-quota case needs them.
- **60-second polling and cancelling live sessions stay**, as today.
- **New: a failure caused by the provider's own limit is a quota stop**, not an ordinary failed attempt. Today, if the hard limit kills a session before toddler's reading shows the stop, the job gets `lastError` and is not retried this run. It should instead stop that provider and leave the issue ready.
- **New: stops lift.** A stop lasts while its check keeps returning it, so a quota stop lifts when a fresh reading is back above the threshold ([GLOSSARY.md](../../../../GLOSSARY.md) updated). When every provider is stopped, the runner sleeps until the earliest `resetsAt` of a stopped window, rereads quota and carries on; it exits only when no actionable issues remain. Today stops last the whole invocation and the runner exits at the first full stop.
- **Codex workers switching model** past a per-model stop: accepted, no new code. The provider-wide weekly stop is the backstop.
- **Continuing after a stop is from disk, not a resumed provider session.** Checked in code: a cancelled stage's dirty worktree is preserved and Sandcastle reuses it for the branch's next stage ([runner.ts](../../../../src/runner.ts) `runStage`), and the implementation prompt says to continue existing changes. The next session starts fresh, possibly on the other provider; no `claude --resume`/`codex resume`. phol's bar: state must not be left messy, so the agent can continue where it left off.
