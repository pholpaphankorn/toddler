# Claude Code skill discovery in infant's sandboxed `claude -p` runs

Researched 2026-11-04 against code.claude.com docs and Claude Code 2.1.306 (local `claude --version`).
Sources: [skills], [headless], [cli], [env], [sdk-features]. Links at the bottom.

## Answer

Yes: plain `claude -p` loads skills exactly like an interactive session. Only `--bare`, `--safe-mode`,
`--disable-slash-commands`, `CLAUDE_CODE_SIMPLE=1`, or a `--setting-sources` list that leaves a source
out turn discovery off. Sandcastle passes none of these. In infant's sandbox, Claude finds:

- **Project skills**: `.claude/skills/<name>/SKILL.md` in the worktree cwd and every parent up to the repo root.
- **User skills**: `$HOME/.claude/skills/<name>/SKILL.md`. Infant's HOME is private and empty, so there are none
  unless infant writes them there.

When two skills share a name, **enterprise beats personal and personal beats project** [skills].

## What sandcastle actually runs

Installed `@ai-hero/sandcastle` 0.14.0 (`node_modules/@ai-hero/sandcastle/dist/chunk-H2PEFS4W.js:1184`, same as
`../sandcastle/src/AgentProvider.ts:1647`):

```
claude --print --verbose[ --dangerously-skip-permissions | --permission-mode X] --output-format stream-json --model <m> [--effort e] [--resume id [--fork-session]] -p -
```

The prompt arrives on stdin. `dangerouslySkipPermissions` is true whenever the sandbox is not `none`
(`dist/index.js:1731,2590`). The command has no `--bare`, no `--setting-sources`, no `--add-dir`, and no `--disable-slash-commands`.

## Where skills are discovered

From the locations table in [skills]:

| Scope            | Path                                                                                                                | Notes                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Enterprise       | `.claude/skills/<name>/SKILL.md` inside the managed-settings dir (e.g. `/etc/claude-code/.claude/skills/` on Linux) | Turned off with `CLAUDE_CODE_DISABLE_POLICY_SKILLS=1` [env]                                                                      |
| Personal         | `~/.claude/skills/<name>/SKILL.md`                                                                                  | Belongs to the `user` setting source [sdk-features]                                                                              |
| Project          | `.claude/skills/<name>/SKILL.md`                                                                                    | Read from the cwd and every parent dir up to the repository root [skills][sdk-features]. Belongs to the `project` setting source |
| Nested           | `<subdir>/.claude/skills/...` below the cwd                                                                         | Loads the first time Claude reads or edits a file in that subdir [skills]                                                        |
| `--add-dir`      | `<dir>/.claude/skills/...`                                                                                          | Loads even in bare mode [cli][headless]                                                                                          |
| Plugin           | `<plugin>/skills/<name>/SKILL.md`                                                                                   | Namespaced as `plugin:name`, so these never clash with the scopes above [skills]                                                 |
| claude.ai synced | `~/.claude/skills/synced/`                                                                                          | Needs a claude.ai login. A `-p` run must set `CLAUDE_CODE_SYNC_SKILLS=1` to wait for them [env][skills]                          |

Claude Code also watches the user, project and `--add-dir` skill dirs and reloads changes mid-session, except in bare mode [skills].

### HOME vs CLAUDE_CONFIG_DIR

- `CLAUDE_CONFIG_DIR` overrides the config directory, which defaults to `~/.claude`. The docs say "All settings, session history, and plugins are stored under this path" [env].
  **Unverified**: the docs never state that personal skills move to `$CLAUDE_CONFIG_DIR/skills`. That is the likely reading, but I have not tested it.
- Infant unsets `CLAUDE_CONFIG_DIR`, so the user dir is `~/.claude` under the sandbox HOME. **Unverified, inferred**:
  Claude Code resolves `~` through Node's `os.homedir()`, which honours `$HOME` on macOS. To ship user-level skills, write them to
  `$HOME/.claude/skills/<name>/` (for example in the same setup exec that writes `$HOME/.codex/auth.json` in runner.ts).

## Do infant's flags and env vars affect skill loading?

| Item                                         | Effect on skills                                                                                                                                                                                                                                                                                                 | Source                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `-p` / `--print`                             | None. "Without it [`--bare`], `claude -p` discovers and loads them as an interactive session would, including anything configured in the working directory or `~/.claude`." Typing `/skill-name` in the prompt also works under `-p`                                                                             | [headless]                  |
| `--dangerously-skip-permissions`             | None documented. It is the same as `--permission-mode bypassPermissions` and only concerns permission prompts                                                                                                                                                                                                    | [cli]                       |
| `--setting-sources`                          | Not passed, so all sources load (the default equals `user,project,local`). Leaving out `project` would drop project skills; leaving out `user` would drop `~/.claude/skills`                                                                                                                                     | [cli][sdk-features][skills] |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | Its documented list (auto-updates, telemetry, error reporting, release notes, feature flags, plugin `command` sources...) says nothing about local skill discovery. **Unverified**: it might change claude.ai skill sync, but that already needs a claude.ai login, and infant uses a `CLAUDE_CODE_OAUTH_TOKEN` | [env]                       |
| `CLAUDE_CODE_TMPDIR`                         | Unrelated: it only moves temp files                                                                                                                                                                                                                                                                              | [env]                       |
| Turn skills off                              | `--bare` / `CLAUDE_CODE_SIMPLE=1`, `--safe-mode`, `--disable-slash-commands`, `strictPluginOnlyCustomization` policy, `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` (bundled skills only)                                                                                                                                 | [cli][env][skills]          |

Caveat [headless]: `--bare` "will become the default for `-p` in a future release". If that happens, discovery stops unless
the skills sit in an `--add-dir` directory. Pin or re-check the Claude Code version.

Also note: `-p` does not show the workspace trust dialog, so the worktree's project skills, `.claude/settings.json` hooks
and `.mcp.json` all load without a prompt [headless].

## SKILL.md format

Each skill is a directory, `<name>/SKILL.md`: YAML frontmatter between `---` lines, followed by markdown instructions [skills].

- **Every frontmatter field is optional.** `description` is recommended; if it is missing, Claude Code uses the first non-empty line of the body.
- `name`: defaults to the directory name. Some characters are refused (see the "characters a skill name can't hold" section of [skills]).
- `when_to_use`: extra trigger text.
- `disable-model-invocation: true`: only the user can invoke the skill.
- `user-invocable: false`: only Claude can invoke the skill.
- `allowed-tools`: tools pre-approved during the turn that invokes the skill.
- Also: `argument-hint`, `context` (e.g. fork into a subagent), `agent`, `model`, `effort`, `hooks`, `paths`, `shell`.
- Combined `description` + `when_to_use` text is capped at 1,536 chars per skill. The whole listing gets about 1% of the context window.
- Malformed YAML still loads the body, but with empty metadata, so auto-matching fails. `--debug` shows the parse error.
- **Supporting files**: any other files in the skill dir (reference docs, `scripts/`). Point to them from SKILL.md and use `${CLAUDE_SKILL_DIR}` for
  paths. Keep SKILL.md under 500 lines.

## Name-clash precedence

From [skills], quoted: "Enterprise over personal, and personal over project. With `deploy` in both `~/.claude/skills/` and the
project's `.claude/skills/`, `/deploy` runs the personal one."

- A skill beats a `.claude/commands/` file with the same name.
- Plugin skills never clash, because they are namespaced.

**For infant**: a skill infant seeds into the sandbox HOME overrides a same-named skill committed in the target repo.

## Sources

- [skills] https://code.claude.com/docs/en/skills
- [headless] https://code.claude.com/docs/en/headless
- [cli] https://code.claude.com/docs/en/cli-reference
- [env] https://code.claude.com/docs/en/env-vars
- [sdk-features] https://code.claude.com/docs/en/agent-sdk/claude-code-features (settingSources table)
- Sandcastle 0.14.0: `node_modules/@ai-hero/sandcastle/dist/chunk-H2PEFS4W.js`, `dist/index.js`
