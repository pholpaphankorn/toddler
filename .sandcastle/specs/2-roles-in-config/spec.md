---
title: Roles in config
labels: [wayfinder:map, on-hold]
status: open
---

## Destination

A spec for a config shape where each role (implementation, review, and later pm) declares its prompt, skill set and model per provider, with today's two roles moved onto it without changing their behaviour. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today (2026-11-14): `Role = "implementation" | "review"` in `src/config.ts`; a role's settings are split across `models[provider][role]`, `skills[role]` and a fixed prompt file (`prompts/prompt.md`, `prompts/review.md`, chosen by name in `src/runner.ts`), with `.sandcastle/project.md` appended to both. Spec 4 added `providers`, `ranking`, `stopConditions` and per-provider `stopAt`; `ranked()` in `src/policy.ts` and quota checks read `models[provider][role]`. The workflow itself is hard-coded per role: implementation commits, review returns a `<sandcastle-review>` verdict parsed by the runner, and `skillInstructions` adds a code-review line only for review.
- Builds on spec 1's settled decision [Per-role skill sets](../1-skills-in-the-sandbox/issues/7-role-skill-sets.md) (`skills` keyed by role); not reopened.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Tickets are files with `parent: 2` and carry `on-hold` so `toddler` never implements them. Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (issue numbers are unique across specs, so cross-spec blocking works).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Skill set**).
- Spec 1's implementation issues (13–17) and spec 4's (25–29) are all closed, so implementation issues from this spec have no cross-spec blockers today.

## Decisions so far

## Not yet specified

- How `doctor` validates role config (waits on [Role config shape](issues/36-role-config-shape.md)).

## Out of scope

- New provider adapters (ruled out when the destinations were named).
- Project-defined roles: only built-in roles are configurable, since a new role needs its own workflow slot and output contract that config can't express (settled while charting, 2026-11-14).
- Defining the pm role itself: this spec only checks the shape fits a third role; pm's prompt, skills and workflow belong to [PM role](../5-pm-role/spec.md).
- Moving role behaviour into config: the review verdict contract, the code-review fixed-point line, `maxReviewRounds` and "implementation commits" stay in code.
- Limiting which providers may run a role: no one needs it yet; every role names a model for every provider (see [Role config shape](issues/36-role-config-shape.md)).
