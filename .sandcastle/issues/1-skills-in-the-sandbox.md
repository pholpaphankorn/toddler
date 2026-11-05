---
title: Skills in the sandbox
labels: [wayfinder:map, on-hold]
status: closed
---
<!-- Wayfinder map. Tickets are files with `parent: 1`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec for how toddler ships vendored skills (only the skills it uses, plus the skills they refer to, listed in `vendor/skills.json`) and gives each role a chosen skill set inside its Seatbelt sandbox, for both Claude Code and Codex, without reading anything from the host. Every skill in a role's set is loaded explicitly by path, so bundled skills are used even when a project skill shares the name. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler (this repo) on `@ai-hero/sandcastle` 0.14.0, Seatbelt provider. Each stage gets a private, empty `HOME`; the worktree is the target project ([runner.ts](../../runner.ts) `runStage`, [agents.ts](../../agents.ts)).
- Vocabulary: [GLOSSARY.md](../../GLOSSARY.md) (**Bundled skill**, **Skill set**).
- Skills only, never full plugins: hooks and commands are Claude-only. Always-on behaviour (e.g. ponytail) is triggered from toddler's prompts, not hooks.
- Never read the host's `~/.claude`, `~/.codex` or plugin caches for skills. Only what ships with toddler.
- Vendor only the skills toddler uses (explicitly loaded in some role's set), plus every skill they refer to, as listed in `vendor/skills.json`. Today that is tdd, diagnosing-bugs, codebase-design, code-review (mattpocock-skills) and ponytail, ponytail-review (ponytail). Per-role skill sets keep HITL skills out of unattended stages. Skills are loaded explicitly, never picked up implicitly.
- Vendored copies, upstream version recorded. Project-committed skills still work. Explicit loading by path means a name clash can't displace a bundled skill.
- Tracker: these files. Claim = `assignee:` frontmatter; resolve = `## Answer` section + `status: closed`; blocking = `blocked_by`.

## Decisions so far

- [How Claude Code finds skills in headless mode](2-claude-skill-discovery.md): `-p` loads `$HOME/.claude/skills` and project `.claude/skills`; personal wins on a clash; a future `--bare` default is a risk.
- [How sandcastle can put files into the sandbox's private home](4-sandbox-home-files.md): mounts land only at their host path (read-only, per `seatbelt()` instance); best fit is a read-only mount + symlink from HOME (~25 ms/stage), tar over stdin as fallback.
- [How Codex finds skills in exec mode](3-codex-skill-discovery.md): `exec` loads `$HOME/.agents/skills` and repo `.agents/skills`; same SKILL.md format; **no precedence on a name clash**: both load, and `$name` triggers neither.
- [Inventory of the skills to vendor](5-vendoring-inventory.md): 44 skills, both repos MIT (keep the LICENSE files); copy whole folders; 19 wait for a human, 6 need a configured tracker, `git-guardrails-claude-code` installs a hook, and ponytail has no lasting level without hooks.
- [How skills get into the sandbox](6-skill-delivery.md): one read-only mount of the vendored folder; per-stage symlinks for the role's set into `$HOME/.claude/skills` and `$HOME/.agents/skills`; upstream names kept, Codex clashes warned; tar fallback if symlinks are ignored.
- [Per-role skill sets](7-role-skill-sets.md): default sets are implementation `tdd, diagnosing-bugs, codebase-design, ponytail` and review `code-review, ponytail-review, codebase-design`; a project replaces a role's list via `skills` in config; a no-human line in the prompts; a project picks only from vendored skills.
- [Vendored layout and update procedure](8-vendored-layout.md) (revised): the manifest `vendor/skills.json` lists each upstream's repo, ref and skills; `vendor/skills/<upstream>/<skill>/` holds verbatim skill folders plus `LICENSE` and `UPSTREAM.json`; a name index is built by scanning; `scripts/vendor-skills.sh` (no arguments) syncs to the manifest; a human reviews and commits.
- [How doctor and smoke check that skills load](9-skill-load-checks.md): doctor checks the vendored folder, the index, skill-set names and project clashes; `smoke:seatbelt` checks the links are readable and read-only; `toddler smoke` proves discovery with a canary skill holding a random code; `run` only warns.
- [How toddler's prompts trigger skills](10-prompt-skill-triggers.md): explicit loading only. Every skill in the role's set is loaded at stage start: Codex via path-qualified `$name` mentions, Claude via "read and follow these skill files". This works for user-invoked-only skills too, and ponytail needs no fixed prompt lines.
- [Issue-tracker setup for code-review in the sandbox](11-tracker-setup-for-skills.md): the review stage tells code-review that the fixed point is the base SHA and the spec is the issue text in the prompt, with no tracker lookup; findings feed the single `<sandcastle-review>` verdict.

## Not yet specified

_Empty: the way to the destination is clear. Handed off as implementation issues 12–17 (vendor script → skill sets config → sandbox links, prompt load lines, doctor checks → canary smoke)._


## Out of scope

- Async planning mode (HITL skills write questions + recommended answers to markdown; `toddler plan continue` resumes). Next map, built on this one. It adds the skills it needs (wayfinder, grilling...) to `vendor/skills.json`.
- Renaming the existing `toddler plan` command. The user will do it as part of the planning-mode effort.
- A tracker doc generated from `.sandcastle/config.json` (e.g. local → `.sandcastle/issues/` format) so tracker-writing skills (to-tickets, to-spec, triage, wayfinder) know where issues live. Planning-mode map.
- Extra Seatbelt access for skill scripts. Skills run under toddler's existing profile; a project that opts into a script-running skill (wizard, git-guardrails-claude-code, setup-ts-deep-modules) accepts it may fail in the sandbox.
- Full plugins (hooks, slash commands) in the sandbox. Ruled out: Claude-only.
