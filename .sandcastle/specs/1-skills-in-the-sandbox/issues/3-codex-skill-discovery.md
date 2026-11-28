---
title: How Codex finds skills in exec mode
labels: [wayfinder:research, adult]
blocked_by: []
parent: 1
assignee: claude (research subagent)
status: closed
---
## Question

Where does Codex (as invoked by sandcastle's `codex` provider) look for skills, and does it load them non-interactively? Cover: `$CODEX_HOME/skills` / `~/.codex/skills`, repo-level `.agents/skills` (or other), whether it reads the same SKILL.md format as Claude Code (frontmatter fields, bundled files), enable flags, and which source wins on a name clash. Cite official docs or source.

## Answer

`codex exec` (as sandcastle runs it: `--json --dangerously-bypass-approvals-and-sandbox -m <model>`) loads skills the same way as interactive mode, with no flag needed. Search paths:
- Repo: `.agents/skills` from the git root down to the cwd (plus legacy `.codex/skills`).
- User: `$HOME/.agents/skills` (plus deprecated `$CODEX_HOME/skills`).
- Also `/etc/codex/skills` and plugins.

Claude's SKILL.md format works unchanged. Codex requires `description`, and `name` defaults to the folder name. Claude-only fields such as `disable-model-invocation` are ignored; the Codex equivalent is `agents/openai.yaml`. **Codex does not resolve name clashes**: both copies load, the repo copy is listed first, and an explicit `$name` that matches both triggers neither. So "bundled wins" needs a unique name (e.g. a `toddler-` prefix) or some other step.

Not verified: an end-to-end `codex exec` run with seeded skills.

Findings: `docs/research/codex-skill-discovery.md`. Sources: Codex skills docs and openai/codex at `rust-v0.163.0`.
