---
title: Roles in config
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Charted as a skeleton only; tickets come in a later session. -->

## Destination

A spec for a config shape where each role (implementation, review, and later pm) declares its prompt, skill set and model per provider, with today's two roles moved onto it without changing their behaviour. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today: `models` per provider and role in `src/config.ts`, prompts in `prompts/prompt.md` and `prompts/review.md`, project notes from `.sandcastle/project.md`.
- Builds on spec 1's settled decision [Per-role skill sets](../1-skills-in-the-sandbox/issues/7-role-skill-sets.md) (`skills` keyed by role); not reopened.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Tickets are files with `parent: 2` and carry `on-hold` so `toddler` never implements them. Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (issue numbers are unique across specs, so cross-spec blocking works).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Skill set**).
- Implementation issues from this spec are `blocked_by` [spec 1](../1-skills-in-the-sandbox/spec.md)'s open issues (13–17) where they touch the same code.

## Decisions so far

## Not yet specified

- Whether a project can define new roles, or only configure the built-in ones.
- How a project overrides a role's prompt: replace it, or append like `project.md` does today.
- Whether a role can limit which providers may run it (touches [Quota-aware scheduling](../4-quota-aware-scheduling/spec.md)).
- How `doctor` validates role config.

## Out of scope

- New provider adapters (ruled out when the destinations were named).
