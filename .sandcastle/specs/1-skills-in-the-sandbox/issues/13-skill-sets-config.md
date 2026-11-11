---
title: Skill index and per-role skill sets in config
labels: []
blocked_by: [12]
status: closed 
---
Needs `vendor/skills/` populated by `scripts/vendor-skills.sh` from the previous issue (layout `vendor/skills/<upstream>/<skill>/`).

1. **Skill index.** Scan every `vendor/skills/*/*/SKILL.md` and build a name → folder index. The name is the frontmatter `name`, falling back to the folder name. A duplicate name across upstreams is an error.
2. **Skill sets in config.** Add `skills` to `defaults` in `src/config.ts`, keyed by role:
   - implementation: `["tdd", "diagnosing-bugs", "codebase-design", "ponytail"]`
   - review: `["code-review", "ponytail-review", "codebase-design"]`
3. **Project overrides.** `.sandcastle/config.json` may set `"skills": { "<role>": [names] }`.
   - A listed role replaces that role's default list.
   - A role it leaves out keeps the default.
   - `[]` means no skills.
   - An unknown name fails in `loadConfig` with e.g. `skills: "tdd" in review set is not in vendor/skills; add it to vendor/skills.json and re-run scripts/vendor-skills.sh`.
   - The same set applies to both providers.

Done when tests cover the index (frontmatter name, folder fallback, duplicate error) using a fixture `vendor/skills`, plus the override and unknown-name rules. Document the `skills` key in the README config table.

Decision record: `.sandcastle/specs/1-skills-in-the-sandbox/issues/7-role-skill-sets.md`.
