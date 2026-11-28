---
title: How skills get into the sandbox
labels: [wayfinder:grilling, adult]
blocked_by: [2, 3, 4]
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

Given how each provider finds skills and what sandcastle can do: where do a role's skills land in the sandbox, are they mounted or copied, can one layout serve both Claude Code and Codex, and does the chosen location make bundled skills win over project skills on a name clash (or what extra step does)?

Inputs so far: Claude prefers HOME skills over project skills on a clash, but Codex has no precedence (both load, `$name` triggers neither). This conflicts with the decision that bundled skills win. Settle it here: rename/prefix the bundled skills, drop the project's same-name skill from the sandbox, or accept the clash.

## Answer

- **Mount once, link per stage.** Toddler adds one read-only mount of its whole vendored skills folder to the single `seatbelt()` provider it already builds. At stage start, the exec that writes the Codex `auth.json` also creates one symlink per skill in the role's **skill set**:
  - `$HOME/.claude/skills/<name>` (Claude)
  - `$HOME/.agents/skills/<name>` (Codex; not the deprecated `$CODEX_HOME/skills`)

  Only linked skills are discovered, so per-role sets need no extra mounts.
- **Prove links work first.** The first implementation issue proves symlinked skills load, with one real run per provider. If a provider ignores symlinks, that provider falls back to a tar copy-in over exec stdin.
- **Name clashes: keep upstream names.** No prefix, so cross-references like wayfinder → grilling keep working. On Claude, the bundled skill wins (HOME beats project). On Codex, both copies load, so toddler logs a warning for any stage where a project skill (`.agents/skills` / `.codex/skills` in the worktree) shares a name with a skill in the role's set.
- **Future `--bare` default for `claude -p`.** No change now. `toddler doctor`/`smoke` should detect when skills stop loading.

_Note after prompt triggers was revised:_ Claude now reads skills by file path, so a project skill with the same name no longer shadows a bundled one. Codex uses path-qualified mentions, which also resolve on a clash. The doctor clash listing stays as information. The links stay for both providers.
