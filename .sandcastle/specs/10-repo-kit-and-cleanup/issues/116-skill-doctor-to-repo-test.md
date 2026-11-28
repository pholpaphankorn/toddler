---
title: Skill doctor becomes one repo test
labels: []
blocked_by: []
parent: 10
status: closed
---
`doctor` stops checking bundled skills; the checks that guard toddler's own committed skill files run in toddler's test suite instead. Exactly as settled in spec 7's [Bundled skills, vendoring and skill doctor](../../7-harness-boundary/issues/70-skills.md).

1. `skill-doctor.ts` and doctor's skill rows go. A missing skill name or missing `vendor/skills/` already fails config load; the project-clash check is dropped (bundled skills load by path).
2. The manifest-in-sync and LICENSE/UPSTREAM.json checks become one test over this repo's `vendor/skills.json` and `vendor/skills/`.
3. Bundled skills, per-role skill sets, `skills.ts` and vendoring are unchanged.

- [ ] One test fails when `vendor/skills.json` and `vendor/skills/` disagree or a skill lacks its LICENSE/UPSTREAM.json, and passes on this repo
- [ ] `skill-doctor.test.ts` removed or reduced to that test; no skill rows in `doctor` output
- [ ] README's doctor section no longer lists skill rows
