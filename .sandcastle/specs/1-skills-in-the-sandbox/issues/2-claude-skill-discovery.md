---
title: How Claude Code finds skills in headless mode
labels: [wayfinder:research, adult]
blocked_by: []
parent: 1
assignee: claude (research subagent)
status: closed
---
## Question

Where does Claude Code (the version toddler runs, invoked by sandcastle's `claudeCode` provider with `-p`) look for skills, and does it load them in print mode? Cover: user-level paths under `HOME` / `CLAUDE_CONFIG_DIR`, project `.claude/skills`, whether `--setting-sources` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` affect it, the SKILL.md format it needs, and which source wins when a user-level and a project skill share a name. Cite the official docs.

## Answer

Yes. `claude -p` (no `--bare`) discovers skills like an interactive session, and sandcastle 0.14.0 passes no flag that turns this off. User skills live in `$HOME/.claude/skills/<name>/SKILL.md`, project skills in `.claude/skills/` from the cwd up to the repo root. **Personal beats project on a name clash**, so skills seeded into the sandbox HOME win over skills the target repo commits. SKILL.md frontmatter is optional (`name` defaults to the folder name). Risk: the docs say `--bare` will become the default for `-p` later; only `--add-dir` directories would still load. Not verified: whether `CLAUDE_CONFIG_DIR` moves the skills path, and an actual run inside Seatbelt.

Findings: `docs/research/claude-skill-discovery.md`.
