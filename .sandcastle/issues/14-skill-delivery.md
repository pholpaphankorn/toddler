---
title: Link each role's skill set into the sandbox
labels: []
blocked_by: [13]
status: open
---
Make a stage's skill set available inside its Seatbelt sandbox without reading anything from the host's own skill folders.

- **Mount.** In `src/main.ts`, where `runner.sandboxProvider = seatbelt({...})` is built, add a read-only mount of toddler's own `vendor/skills` directory. Resolve it from toddler's install location. The mount appears at its host path.
- **Links.** In `runStage` (`src/runner.ts`), alongside the existing Codex `auth.json` setup exec, create one symlink per skill in the role's set:
  - `$HOME/.claude/skills/<name>` → the skill folder
  - `$HOME/.agents/skills/<name>` → the skill folder

  Do this for both providers. Skills outside the set get no link.
- **Smoke.** Extend `scripts/smoke-seatbelt.ts` (no model calls). Mount a fixture skills dir read-only, create links for one set, then assert from inside the sandbox that:
  - every linked `SKILL.md` is readable under both paths;
  - writing through a link fails;
  - a skill outside the set has no link.

Done when `npm test` and `npm run smoke:seatbelt` pass. The smoke test must be run by the human on the host, because Seatbelt cannot nest. If the agent cannot run it, say so in the summary.

Decision record: `.sandcastle/issues/6-skill-delivery.md`.
