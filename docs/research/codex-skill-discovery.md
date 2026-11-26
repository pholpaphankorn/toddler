# Codex skill discovery (for infant's codex stages)

Question: where does Codex look for skills, does it load them under `codex exec`, does Claude Code's `SKILL.md` format work as-is, and which copy wins when a user-level and a repo-level skill share a name?

Sources:

- **[docs]** OpenAI Codex skills docs: `https://developers.openai.com/codex/skills`, which 308-redirects to `https://learn.chatgpt.com/docs/build-skills` (fetched 2026-11-04; the page shows no last-updated date).
- **[src]** `openai/codex` at tag `rust-v0.163.0` (commit `83086188ae06`). That is the same version as the locally installed `codex-cli 0.163.0`. Paths below are relative to `codex-rs/`.
- **[sandcastle]** `node_modules/@ai-hero/sandcastle` 0.14.0 (`dist/chunk-H2PEFS4W.js`) and `sandcastle/src/AgentProvider.ts`.

Status: everything below comes from reading the docs and the source. I did not run `codex exec` with probe skills, because the sandbox denied that run. See "Unverified" at the end.

## 1. How sandcastle runs Codex

`codex(model, opts).buildPrintCommand` (sandcastle `AgentProvider.ts` L1058-1089, and the same code in `dist/chunk-H2PEFS4W.js` ~L897-904) produces:

```
codex exec --json --dangerously-bypass-approvals-and-sandbox -m '<model>' [-c 'model_reasoning_effort="<e>"']   # prompt on stdin
```

There are two variants. With `approvalsReviewer: "auto_review"`, the bypass flag becomes `-a on-request -s danger-full-access -c 'approvals_reviewer="auto_review"'`. When resuming or forking, the command is `codex exec resume|fork <id> ... -`. infant calls `sandcastle.codex(model, { captureSessions: false })` with no effort or reviewer option (runner.ts L154), so it gets the first form. The command has no `-C/--cd`, `--ignore-user-config`, `--enable`, or `-c skills.*`. Codex therefore uses the process cwd (the worktree) and the default config locations.

## 2. Discovery locations

**[src]** `ext/skills/src/host_roots.rs::resolve_skill_roots` builds the root list in this order (`roots_from_layer_stack` walks the config layers from high to low precedence, including disabled layers):

| Scope  | Path                                                                                                                                                                      | Source                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Repo   | `<dir>/.codex/skills` for every `.codex/` dir from the project root down to cwd (a Project config layer exists for any `.codex/` _directory_, even without `config.toml`) | `roots_from_layer_stack`, `ConfigLayerSource::Project`; `config/src/loader/mod.rs` ~L1705-1790 |
| User   | `$CODEX_HOME/skills` (comment in the code: "Deprecated user skills location ... kept for backward compatibility")                                                         | `ConfigLayerSource::User`                                                                      |
| User   | `$HOME/.agents/skills` (`dirs::home_dir()`)                                                                                                                               | same                                                                                           |
| System | `$CODEX_HOME/skills/.system` (bundled skills such as `skill-creator` and `skill-installer`, written into a cache there)                                                   | `skills/src/lib.rs::system_cache_root_dir`                                                     |
| Admin  | `/etc/codex/skills` (the folder of the system config layer)                                                                                                               | `ConfigLayerSource::System`                                                                    |
| Plugin | skill roots from installed plugins                                                                                                                                        | `plugin_skill_roots`                                                                           |
| Repo   | `<dir>/.agents/skills` for every dir from the project root (found by `project_root_markers`, default `.git`) down to cwd                                                  | `repo_agents_skill_roots`                                                                      |

Roots are deduplicated by path only (`dedupe_skill_roots_by_path`). Hidden directories are skipped while scanning. Symlinked skill directories are followed for User, Repo, and Admin roots, but not for System roots (`ext/skills/src/loader/host.rs` ~L164-179).

**[docs]** The docs list `$CWD/.agents/skills`, parent folders, `$REPO_ROOT/.agents/skills`, `$HOME/.agents/skills`, `/etc/codex/skills`, and bundled system skills. They do not mention `.codex/skills` or `$CODEX_HOME/skills`. Both of those are still read in 0.163.0 (see the table above), but treat them as legacy.

**For infant:** `HOME` is private and empty apart from `.codex/auth.json`, and `CODEX_HOME` is unset, so it defaults to `$HOME/.codex`. That means the user-level roots (`$HOME/.codex/skills` and `$HOME/.agents/skills`) are empty unless infant seeds them. Codex will still find repo skills under `<worktree>/.agents/skills` (and `<worktree>/.codex/skills`) because the worktree is the cwd and is a git checkout. To ship infant-owned skills, either write them into `$HOME/.agents/skills/<name>/` during stage setup (the same way `auth.json` is written) or commit them under `.agents/skills/` in the target repo.

## 3. Non-interactive loading and feature flags

- **[src]** Skills are loaded in `core` (`core/src/skills.rs`, `core/src/thread_manager.rs` using `codex_skills_extension::HostSkillsService`). `exec` and the TUI share that path. I found no exec-specific gate (no `SessionSource::Exec` check in the skills code).
- No feature flag is needed. `codex features list` (0.163.0) shows no `skills` toggle. The related flags are `skill_search` (stable, true), `skill_mcp_dependency_install` (stable, true), and `skip_host_skill_discovery` (under development, false). **[docs]** does not mention a flag either.
- Config (`config/src/skills_config.rs`, `[skills]` in `config.toml`). Everything is on by default:
  - `include_instructions` (default `true`, `core/src/config/mod.rs` ~L4133). Setting it to `false` stops the skills section from being injected into the prompt.
  - `max_context_tokens`: **[docs]** says the default catalog budget is 2% of the context window (8,000 characters when the window size is unknown) and that this setting can raise it to 10,000 tokens. When over budget, descriptions are shortened first and then skills are dropped, with a warning.
  - `[[skills.config]]` entries `{ path = "/abs/SKILL.md" | name = "x", enabled = false }`. **[docs]** says the last matching entry wins.
  - `[skills.bundled] enabled = false` turns off the system skills.

## 4. SKILL.md format compared with Claude Code

**[src]** `skills/src/parser.rs`:

- The file must start with YAML frontmatter delimited by `---`. Without it you get the error `missing YAML frontmatter delimited by ---`.
- Recognised keys are `name`, `description`, and `metadata.short-description`. There is no `deny_unknown_fields`, so Claude-only keys (`allowed-tools`, `argument-hint`, `model`, `disable-model-invocation`, etc.) are **ignored**, not rejected. A line-based repair step handles unquoted colons in values, such as `argument-hint: <duration: e.g. 7d>`.
- `name` is optional and defaults to the directory name. It is limited to 64 characters. Whitespace is collapsed to a single line.
- `description` is required. An empty description produces the error `missing field description`, and the skill is not loaded.
- **[docs]** Optional directory contents: `scripts/`, `references/`, `assets/`, and the Codex-only `agents/openai.yaml` (UI metadata, `policy.allow_implicit_invocation` defaulting to true, and `dependencies.tools`).

Conclusion: a Claude Code skill directory (a `SKILL.md` with `name` and `description`, plus bundled reference files linked by relative path) works **unchanged**. Claude-specific frontmatter has no effect in Codex. In particular `allowed-tools` restricts nothing, and `disable-model-invocation` does not stop implicit use. The Codex equivalent of the latter is `agents/openai.yaml` with `policy.allow_implicit_invocation: false`.

## 5. How skills reach the model

**[src]** `ext/skills/src/catalog_prompt.rs` and `render.rs`. A `## Skills` section is injected into the context. It lists each skill as name + description + path (paths may be shortened with root aliases from a `### Skill roots` table). It ends with usage rules, summarised here:

- The model must use a skill when the user names it (`$SkillName` or plain text) or when the task clearly matches the description.
- Before acting, it must read the whole `SKILL.md`. Relative paths such as `references/...` and `scripts/...` resolve against the skill's directory, and it should read only the referenced files it needs.

Loading is progressive (**[docs]**, same behaviour). Only metadata sits in context, and the model reads the body with its own file tools. In infant that means a shell `cat` inside Seatbelt, so the skill directory must be readable by the sandbox profile. The worktree and `$HOME` should already be readable. Codex's own sandbox is turned off by `--dangerously-bypass-approvals-and-sandbox`.

Explicit `$name` mentions in the prompt text are resolved by `skills/src/selection.rs::collect_explicit_skill_mentions`, which injects the matching skill. In `exec`, the prompt arrives on stdin and is treated as user text, so `$name` in a infant prompt should work the same way. This is inferred from source and not run.

## 6. Name clash: user-level vs repo-level

**[src]** Neither copy wins. Both are loaded.

- `ext/skills/src/loader/host_merge.rs::merge_host_skill_root_snapshots` deduplicates **by `SKILL.md` path only**. It then sorts by `(scope_rank, name, path)` with `Repo=0, User=1, System=2, Admin=3`. Both same-name skills stay in the catalog, and the repo copy is listed first.
- **[docs]** agrees: Codex "doesn't merge skills that share a `name`", and both can appear in skill selectors.
- An explicit plain `$name` mention is resolved only when the name is unique. `selection.rs` L181-193 skips the skill when `skill_name_counts[name] != 1`. A plain `$name` that matches two skills therefore injects **neither** of them. A path-qualified mention (structured `UserInput::Skill { path }`, or a link to the skill's path) still resolves.
- For implicit use, the model sees two entries with the same name and different paths and descriptions, and picks one itself.

Practical rule: give infant-seeded skills names that cannot collide with skills in the target repo, for example a `infant-` prefix. Do not rely on precedence.

## Unverified

- I have not run `codex exec` end to end with seeded skills. An empty-HOME probe (repo plus user `probe-clash`, a `.codex/skills` skill, and a legacy `$CODEX_HOME/skills` skill) was blocked by this session's permission classifier. Everything in sections 2-6 comes from reading the docs and source at `rust-v0.163.0`.
- Whether `.codex/skills` is scanned in an **untrusted** project. The source collects project roots from `all_layers_high_to_low()`, which includes disabled layers, so it appears to be scanned. `.agents/skills` does not depend on trust.
- The docs' 2% / 8,000-character / 10,000-token budget figures were not traced in source.
- Whether a `$name` prompt arriving via stdin in `exec` triggers explicit injection (inferred, section 5).
