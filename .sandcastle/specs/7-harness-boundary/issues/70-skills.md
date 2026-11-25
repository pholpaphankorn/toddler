---
title: "Bundled skills, vendoring and skill doctor: keep, delegate, or cut"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Do toddler's bundled skills (per-role selection, links into the private home), skill vendoring from upstream repos, and the skill doctor stay as code, move to the providers' own skill/plugin features, or go? Inventory rows 4 (skill part), 35, 36 in [Inventory of toddler's features](57-feature-inventory.md). Apply the rule from [Rule for code, harness or cut](61-code-or-harness-rule.md); the sandbox mounts skills read-only ([A Seatbelt sandbox per stage](65-sandbox-per-stage.md)).

## Answer

Resolved with phol 2026-11-25, applying [Rule for code, harness or cut](61-code-or-harness-rule.md).

- **Bundled skills and per-role skill sets: keep as code, unchanged.** Picking a role's skill set and linking it into the private home is deterministic, and ADR 0001 names bundled skills as text toddler gives the agent. Provider-side install (Claude plugins, Codex skills) at stage start was rejected: needs network in the sandbox, differs per provider, loses version pins, and would break the rule that the host user's skill folders are never read. `skills.ts` keeps both the home links (`.claude/skills`, `.agents/skills`) and the load-by-path prompt line.
- **Vendoring: keep.** `scripts/vendor-skills.sh` + `vendor/skills.json` stay; pinned copies with licenses are committed, reviewable in diffs, and work offline.
- **Skill doctor: cut.** `skill-doctor.ts` (~134 lines) and the doctor's skill rows go ("not missed"): a missing skill name or missing `vendor/skills/` already fails config load, and the project-clash check is informational because bundled skills load by path. The manifest-in-sync and LICENSE/UPSTREAM.json checks guard toddler's own committed files, so they move into one test in toddler's test suite.
