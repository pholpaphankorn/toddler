---
title: How doctor and smoke check that skills load
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

How do `toddler doctor` (no model calls) and `toddler smoke` (small model calls) show that each provider actually discovers the role's linked skills inside Seatbelt? It must catch symlinks being ignored, a future `claude -p --bare` default, and a missing or stale vendored folder. What does each command check, and what does the failure message say?

## Answer

- **`toddler doctor` (static, no model).** It checks that:
  - `vendor/skills` exists and the name index builds, with no duplicate names.
  - Each upstream has its `LICENSE` and `UPSTREAM.json`.
  - Every name in each role's skill set resolves. Example failure: `skills: "tdd" in review set is not in vendor/skills`.

  It also lists any project skill at HEAD (`.claude/skills`, `.agents/skills`) that clashes with a role's set, so the Codex warning shows before a run.
- **`smoke:seatbelt` (real Seatbelt, no model).** It mounts `vendor/skills` read-only, creates the per-stage links for one skill set, then asserts from inside the sandbox that:
  - every `$HOME/.claude/skills/<name>/SKILL.md` and `$HOME/.agents/skills/<name>/SKILL.md` is readable;
  - writing through a link fails;
  - a skill outside the set has no link.
- **`toddler smoke` (model).** _Updated after prompt triggers was revised._ A **canary skill**, a test fixture that is not in `vendor/skills`, is written to a temp dir with a fresh random code and linked the same way. The existing per-provider, per-role smoke prompt uses the same generated load line as real stages ([How toddler's prompts trigger skills](10-prompt-skill-triggers.md)) for the canary, then asks for READY and the code it contains. Only real discovery yields the code, which catches ignored symlinks, a `-p --bare` default and Codex path changes. It adds no model calls. Example failure: `claude: skills not discovered inside Seatbelt (symlinked skills ignored or -p --bare?); fall back to copy-in`.
- **`toddler run`.** No per-run discovery probe. It only logs the Codex clash warnings per stage.
