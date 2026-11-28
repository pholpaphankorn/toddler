---
title: Repo kit and cleanup
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 10`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec, ready to break into toddler issues, for the third reshape area: `setup` writes and refreshes a committed planning kit (per-tracker templates + the toddler block in `AGENTS.md`/`CLAUDE.md`) and gains a `glab` step, `init` goes back to config only, `doctor` flags spec children missing `issueLabel`; plus the cleanup: skill doctor cut to one repo test, role prompts trimmed and project notes cut, legacy config/state shims removed, the sandbox leftovers from spec 7 settled, and README/GLOSSARY brought in line.

## Notes

- Third reshape area after [spec 7 Harness boundary](../7-harness-boundary/spec.md), split agreed in [spec 8](../8-landing/spec.md) (which first called it "plain issues, no map"; phol chose a map, 2026-11-26). Settled there, not reopened here: [doctor, setup, init, plan and smoke](../7-harness-boundary/issues/72-cli-modes.md) (kit in `setup`, `init` config only, commit rule, doctor row), [Bundled skills, vendoring and skill doctor](../7-harness-boundary/issues/70-skills.md), [Role prompts, workflow rules and prompt assembly](../7-harness-boundary/issues/73-prompts-rules.md). Tickets here decide *how*, not *whether*.
- **Settled without a ticket** (phol, 2026-11-26), go straight to implementation issues when the map is broken down:
  - Skill doctor → one repo test, and the prompt trim + project-notes cut, exactly as tickets 70 and 73 say.
  - **Legacy shims removed, no translation.** Old config and state get no special handling; anyone upgrading fixes files by hand (or with an agent). Goes: the "obsolete setting" errors in [config.ts](../../../src/config.ts) (`reservePercent`/`codexLimitId`, `openPr`, `issues`, `roles.<role>.models`/`skills`) and their test rows; the old `state.json` translation built by spec 8's [Job states, state.json and the run summary](../8-landing/issues/83-job-states-and-run-summary.md) (`runner.ts` load: `lastError`, `conflictBase`, `rounds`, `pr`/`done`) and its fixtures. An old value just fails ordinary validation ("invalid ranking"); old state fields are not read. Spec 9's open [Ranker contract](../9-scheduling-and-quota/issues/100-ranker-contract-and-builtins.md) was edited to match (no `"quota"`/`"order"` replacement errors).
- Code today: [scripts/setup.sh](../../../scripts/setup.sh) (logins, bash), [main.ts](../../../src/main.ts) (`init`, `doctor`, the "write notes in `.sandcastle/project.md`" step), [skill-doctor.ts](../../../src/skill-doctor.ts), [runner.ts](../../../src/runner.ts) (project notes in the prompt), [prompts/](../../../prompts).
- Research to reuse: [github-spec-facts](../../../docs/research/github-spec-facts.md), [gitlab-facts](../../../docs/research/gitlab-facts.md), [Claude](../7-harness-boundary/issues/58-claude-headless-orchestration.md) / [Codex](../7-harness-boundary/issues/59-codex-headless-orchestration.md) headless orchestration.
- Tracker: these files, same conventions as spec 9. Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs). Ticket numbers continue from spec 9 (108+).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Tracker**, **Forge**, **Local login**, **Role**, **Provider**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), prototype (prototype tickets), writing-for-agents for the toddler block and templates.

## Decisions so far

- [What happens to Codex's setsid() children when a stage is cancelled](issues/111-codex-setsid-children.md): Codex kills its `setsid()`'d commands only on SIGINT; toddler's `stopAgent` sends SIGINT, but Ctrl+C/SIGTERM on toddler (sandcastle SIGKILLs and exits first), a slow shutdown, a crash, or self-detached commands leave orphans; reaping works only from the host (descendant list, `lsof` cwd), not from inside the sandbox.
- [Planning kit templates and the toddler block](issues/108-planning-kit-templates.md): templates follow to-spec (spec sections) and to-tickets (issue template), with toddler's label (`Sandcastle` for `ready-for-agent`), paths/numbering and blocker format replacing the skills' tracker steps; labels baked in from config and re-rendered each `setup`; usage notes in a top comment; a ~3-line block pointing agents (and those skills) at the templates.
- [setup as a toddler command: kit step, login steps and glab](issues/109-setup-command.md): TypeScript in `main.ts`, `setup.sh` deleted; login steps follow `forge` and the roles' providers; glab's host comes from glab; commits kit paths git reports changed (skipping ones with prior uncommitted edits, none on detached HEAD); kit → commit → logins → doctor.

## Not yet specified

- How spec 10 is tested (kit writer on temp repos, marker edge cases, setup's commit rule, the doctor row against forge fixtures): once the kit, setup and doctor tickets settle.
- README/GLOSSARY sweep: what changes falls out of the other tickets (`scripts/setup.sh` is deleted per the setup ticket); likely implementation only.

## Out of scope

- [Spec 5 PM role](../5-pm-role/spec.md) and [spec 6 Provider logins](../6-provider-logins/spec.md): postponed/paused; `setup` keeps local logins only, standalone logins come with spec 6.
- Landing (spec 8) and scheduling (spec 9), beyond the shim removal above.
- Running toddler off macOS.
