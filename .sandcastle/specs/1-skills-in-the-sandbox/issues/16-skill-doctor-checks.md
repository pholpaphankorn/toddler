---
title: toddler doctor checks vendored skills and skill sets
labels: [parallel-safe]
blocked_by: [13]
status: closed
---
Add skill checks to `doctor()` in `src/main.ts`. No model calls.

- **Vendored folder.** `vendor/skills` exists and the skill index builds, with no duplicate names.
- **Manifest in sync.** Every skill listed in `vendor/skills.json` is vendored, and every vendored skill is listed. Example failure: `skills: "tdd" is in vendor/skills.json but not vendored; run scripts/vendor-skills.sh`.
- **Upstream files.** Each upstream folder has `LICENSE` and `UPSTREAM.json`. Print each upstream's version and short commit.
- **Skill sets.** Every name in each role's skill set resolves. Print each role's set.
- **Project clashes (informational).** List project skills committed at HEAD under `.claude/skills/` or `.agents/skills/` whose name matches a skill in a role's set. This is not a failure: toddler loads bundled skills by path.

Done when tests cover the failure messages and the clash listing with fixtures.

Decision record: `.sandcastle/specs/1-skills-in-the-sandbox/issues/9-skill-load-checks.md`.
