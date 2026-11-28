---
title: Role config shape
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 2
assignee: phol (with claude)
status: closed
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

- **Shape.** Top-level `roles` in `.sandcastle/config.json` replaces the top-level `models` and `skills` keys:
  ```json
  "roles": {
    "implementation": { "skills": ["tdd", "..."], "models": { "codex": "gpt-6.1-terra", "claude": "claude-sonnet-5-5" } },
    "review": { "skills": ["code-review", "..."], "models": { "codex": "gpt-6.1-sol", "claude": "claude-opus-5-5" } }
  }
  ```
  The defaults are today's values, moved as they are, so implementation and review behave exactly as they do now.
- **`prompt` is not settled here.** Whether a role has a `prompt` field, and what it holds, belongs to [Role prompt override](37-role-prompt-override.md). Until then, a `prompt` key is an unknown field.
- **Merge.** The merge goes role, then field, then provider:
  - A role the project leaves out keeps its defaults.
  - A field the project leaves out keeps its default.
  - Each provider in `models` merges separately.
  - `skills` replaces the whole list, as spec 1 decided (`[]` means no skills).
  - Example: `{"roles":{"review":{"models":{"claude":"x"}}}}` changes only review's claude model.
- **Old keys are rejected.** A top-level `models` or `skills` fails at load with an "obsolete setting" error that points to `roles.<role>.…` and the README, the same pattern as `reservePercent`. Neither shape takes precedence, because only one shape is accepted.
- **Validation at config load.** These are errors, and each one names its path (for example `roles.review.models.claud`):
  - an unknown role
  - an unknown field inside a role
  - an unknown provider in `models`
  - a model that is not a non-empty string
  - the existing skills checks (array of names, vendored names only)

  A missing model can't happen, because the defaults name a model for every provider and the merge never drops one. So there is no separate "every provider has a model" check. Limiting which providers may run a role stays out of scope.
- **Skills stay per role, not per provider.** This is spec 1's decision, kept as it is.
- **Fits a third role.** Adding pm takes three things: its name in `Role`, a `defaults.roles.pm` entry, and pm's own workflow code. Merging and validation loop over the roles. Every place that needs "the models this provider uses" (doctor's advertised-model check in `main.ts`, the models that `quota.ts` passes to stop conditions, `runner.ts`'s provider availability check) goes through one shared read across all roles, instead of `Object.values(config.models[provider])`.
- **Doctor.** No new checks. `doctor` already runs `loadConfig`, so it gets the errors above. Its skill-load and advertised-model checks read `roles` through the same shared read.
