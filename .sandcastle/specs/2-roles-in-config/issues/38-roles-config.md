---
title: roles config replaces models and skills
labels: []
blocked_by: []
parent: 2
status: open
---
Move each built-in role's settings into one place in `.sandcastle/config.json`. Implementation and review must behave exactly as they do today.

1. **Shape.** A top-level `roles` replaces the top-level `models` and `skills`:
   ```json
   "roles": {
     "implementation": { "skills": ["tdd", "..."], "models": { "codex": "gpt-6.1-terra", "claude": "claude-sonnet-5-5" } },
     "review": { "skills": ["code-review", "..."], "models": { "codex": "gpt-6.1-sol", "claude": "claude-opus-5-5" } }
   }
   ```
   The defaults are today's values, moved as they are.
2. **Merge: role, then field, then provider.**
   - A role the project leaves out keeps its defaults.
   - A field the project leaves out keeps its default.
   - Each provider in `models` merges separately.
   - `skills` replaces the whole list (`[]` means no skills).
   - Example: `{"roles":{"review":{"models":{"claude":"x"}}}}` changes only review's claude model.
3. **Old keys rejected.** A top-level `models` or `skills` fails at load with an "obsolete setting" error that points to `roles.<role>.…` and the README, like `reservePercent`.
4. **Validation at load.** Each error names its path (e.g. `roles.review.models.claud`):
   - an unknown role
   - an unknown field inside a role (`prompt` is unknown until #40)
   - an unknown provider in `models`
   - a model that is not a non-empty string
   - the existing skills checks (array of names, vendored names only)
5. **One shared read.** Everything that needs "the models this provider uses" uses one read across all roles instead of `Object.values(config.models[provider])`: doctor's advertised-model check, the models quota passes to stop conditions, and the runner's provider availability check. All other readers of `models[provider][role]` and `skills[role]` move to `roles`, including the smoke script and doctor's skill-load check.

Adding a third role later should take only its name in `Role`, a default entry, and its workflow code. Merging and validation loop over the roles.

Done when tests cover the merge rules (including the example), each validation error and its path, the obsolete-key error, and the shared read. Existing workflow tests pass unchanged apart from the config shape. The README config table documents `roles` and drops `models`/`skills`.

Decision record: [36](36-role-config-shape.md).
