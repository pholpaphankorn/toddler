---
title: Remove legacy config and state shims
labels: []
blocked_by: []
parent: 10
status: closed
---
Old config values and old `state.json` fields get no special handling: an old config value fails ordinary validation, and old state fields are not read. Anyone upgrading fixes files by hand (phol, 2026-11-26, see [spec 10](../spec.md) notes).

1. **Config**: the "obsolete setting" errors go (`reservePercent`/`codexLimitId`, `openPr`, `issues: "local"`-style values, `roles.<role>.models`/`skills`, the obsolete quota setting), with their test rows. Whatever ordinary validation then says about those keys is fine.
2. **State**: the old `state.json` translation in the runner's load goes (`lastError`, `conflictBase`, `rounds`, `pr`/`done`), with its fixtures, and any code path kept only for legacy jobs (e.g. the "legacy conflictBase job" review case).
3. README drops any upgrade notes for these.

- [ ] Config tests: obsolete-setting rows removed; nothing in `config.ts` names an old key
- [ ] Runner tests: old-state fixtures and translation tests removed; current `state.json` round-trips as before
- [ ] `npm test` green
