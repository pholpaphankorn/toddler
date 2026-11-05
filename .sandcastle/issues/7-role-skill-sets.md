---
title: Per-role skill sets
labels: [wayfinder:grilling, on-hold]
blocked_by: [5]
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

Which bundled skills does each role (implementation, review, and the future planning role) get by default, and how does a project override that in `.sandcastle/config.json`? Must keep HITL skills out of unattended stages.

Inputs: the inventory flags 19 skills that wait for a human, plus `git-guardrails-claude-code` (installs a Claude hook), `retro` (host logs) and `claude-handoff` (needs the `claude` CLI). Is "bundle all" still right for those, or do some go to Out of scope?

## Answer

- **Default skill sets.** These apply to both providers:
  - implementation: `tdd`, `diagnosing-bugs`, `codebase-design`, `ponytail`
  - review: `code-review`, `ponytail-review`, `codebase-design`
- **Review output.** The reviewer still emits toddler's `<sandcastle-review>` verdict. `review.md` governs the output format, and the skills only inform the review.
- **Project config.** In `.sandcastle/config.json`: `"skills": { "<role>": [names] }`.
  - A listed role replaces that role's default list.
  - A role the project leaves out keeps the default.
  - `[]` means no skills.
  - An unknown skill name fails at config load.
  - The future planning role just adds a key.
- **No-human rule.** `prompt.md` and `review.md` gain one line: "No human is available during this stage. Where a skill says to ask the user or wait for an answer, pick the recommended option yourself and list each such choice in your summary." Without it, a skill like `tdd` can end a stage with a question and no commit.
- **Risky skills.** All skills are vendored, with no deny list. `git-guardrails-claude-code` (installs a hook), `retro` (host logs) and `claude-handoff` (needs the `claude` command) stay out of every default set. A project may opt in at its own risk.

_Updated after prompt triggers was revised:_ every skill in a set is loaded explicitly at stage start, including user-invoked-only skills.
