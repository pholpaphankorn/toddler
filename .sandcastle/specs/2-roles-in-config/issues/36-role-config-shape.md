---
title: Role config shape
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 2
status: open
---
## Question

What does `.sandcastle/config.json` look like when each built-in role (implementation, review) declares its prompt, skill set and model per provider in one place? The working candidate is `roles.<role>.{prompt, skills, models: {<provider>: <model>}}`, replacing today's top-level `models` (`Record<Provider, Record<Role, string>>`) and `skills` (`Record<Role, string[]>`) in `src/config.ts`.

Sub-questions:

- How a project's partial `roles` merges with toddler's defaults (today `models` and `skills` merge one level deep in `loadConfig`).
- What happens to the old `models` and `skills` keys: rejected with an "obsolete setting" error like `reservePercent`, or still accepted.
- Must each role name a model for every provider in `providers`? Lean: yes, a missing one is an error; limiting which providers run a role is out of scope (see the map).
- Does the shape still fit a third role (pm, [PM role](../../5-pm-role/spec.md)) without code beyond adding the role name?

Today's two roles must keep their current behaviour after the move.

## Answer
