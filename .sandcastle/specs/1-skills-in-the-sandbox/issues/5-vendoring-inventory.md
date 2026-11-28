---
title: Inventory of the skills to vendor
labels: [wayfinder:research, adult]
blocked_by: []
parent: 1
assignee: claude (research subagent)
status: closed
---
## Question

For mattpocock-skills (1.3.1, all of it) and ponytail (`skills/` only): list every skill and its folder; confirm each license (ponytail not yet checked) and what attribution vendoring needs; flag any skill that depends on plugin-relative paths (`${CLAUDE_PLUGIN_ROOT}`), bundled scripts/executables, other skills, a setup step (e.g. `/setup-matt-pocock-skills`, `docs/agents/issue-tracker.md`), or a human in the loop. Note where the upstream repos live so updates can be pulled.

## Answer

44 skills: 38 from mattpocock-skills (20 engineering, 7 productivity, 7 in-progress, 4 misc) and 6 from ponytail. Both repos are MIT. To vendor, keep each repo's LICENSE file next to its skills, and carry `pr`'s `CREDITS.md` with it. No skill uses `${CLAUDE_PLUGIN_ROOT}`, but supporting files are referenced by relative path, so each skill folder is copied whole. Every mattpocock skill has an `agents/openai.yaml` for Codex, which should be kept.

Things to watch:
- **Bundled bash scripts.** `diagnosing-bugs`, `wizard` and `git-guardrails-claude-code` ship bash. The last one **installs a Claude hook**, which conflicts with the skills-only rule.
- **Wait for a human.** 19 skills wait for answers from a person, including grilling, wayfinder, tdd, to-spec, to-tickets and triage.
- **Need a configured tracker.** Six skills expect `/setup-matt-pocock-skills` to have configured an issue tracker (`docs/agents/*.md`), and will use `gh`/`glab` unless the tracker is local.
- **Need the host.** `retro` needs host session logs and `claude-handoff` needs the `claude` CLI.
- **ponytail without hooks.** Its lite/full/ultra levels depend on plugin hooks, so a skills-only copy has no lasting level.

Upstream:
- mattpocock-skills: github.com/mattpocock/skills (version in `package.json`)
- ponytail: github.com/DietrichGebert/ponytail (npm `@dietrichgebert/ponytail`)

Record the commit SHA as well as the version. Not verified online: tag names, the npm release, and the license of the `show-me` text that `pr` copies.

Findings: `docs/research/vendoring-inventory.md`.
