---
title: "doctor, setup, init, plan and smoke: keep, delegate, or cut"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Which of toddler's side commands stay as code, become agent work, or go: `init`, `setup` wizard, `doctor` (ranking, stop modules, forge, logins checks; its skill checks are already cut in [Bundled skills, vendoring and skill doctor](70-skills.md)), `plan` dry-run, and `smoke-seatbelt` (`smoke-agents` is already cut in [A Seatbelt sandbox per stage](65-sandbox-per-stage.md))? Inventory rows 1–6. Spec 6 Provider logins is paused; only note where this changes it.

## Answer

> **Revised 2026-11-26 with phol: the planning kit moves from `init` to `setup`.** `init` = toddler's config; `setup` = make this repo and this machine ready for toddler and for planning sessions outside it. The kit itself (templates, marked block, commit rule, message) is unchanged; only who runs it changes:
> - **`init`** writes the config on first run and nothing else. On a configured repo it prints "already exists" and does nothing (no kit refresh).
> - **`setup`** first writes or refreshes the kit (in TypeScript, reading labels from the config), then runs the login wizard. No flags: always both steps; login steps already skip when signed in.
> - **No config**: `setup` stops with "run `toddler init` first" (it never runs `init` itself).
> - **Commit**: same rule, now in `setup`: only files written this run, by pathspec, `toddler: set up planning kit`; nothing changed (a teammate on a fresh clone) → no commit, repo untouched.
> - **Config commit**: `init` commits the config it creates (same pathspec rule, message `toddler: add config`). `setup` does not change the config; if it ever did, it would commit it along with the kit.
>
> Where the original text below says `init` writes, refreshes or commits the kit, read `setup`.

Resolved with phol 2026-11-25, applying [Rule for code, harness or cut](61-code-or-harness-rule.md). Every side command stays as code; nothing is delegated or cut.

- **`init`: keep, and add a planning kit.** Forge detection and config writing stay unchanged (deterministic). New: `init` prepares a repo for planning sessions run outside toddler, so the specs and issues they write are in the format and labels toddler reads.
  - **Templates**: `.sandcastle/templates/spec.md` and `.sandcastle/templates/issue.md` for the **configured tracker only**: files frontmatter (`title`, `labels`, `blocked_by`, `parent`, `status`), GitHub parent issue + sub-issues + native blocking, or GitLab `Spec: #<iid>` / `Blocked by: #<iid>` lines; label names filled from config (`issueLabel`, `parallelLabel`, `blockedLabels`); forge templates include the `gh`/`glab` commands that create and wire them.
  - **Agent files**: a block between `<!-- toddler:start -->` and `<!-- toddler:end -->` pointing at the templates and saying when to use them. Written into whichever of `AGENTS.md` / `CLAUDE.md` exists (both if both); neither → `AGENTS.md` with the block plus `CLAUDE.md` holding `@AGENTS.md`. If a file already has both markers, only the text between them is replaced (never a second block; text outside is never touched); a start marker without an end marker stops `init` with the file named; a file missing the block gets it.
  - **Re-running `init`** on a configured repo leaves the config alone and refreshes the templates and blocks.
  - **Commit**: `init` commits only the files it wrote this run (config on first run, templates, agent files) by pathspec, so other changes stay out; no commit when nothing changed; message `toddler: set up planning kit`; it prints the files updated and the commit SHA. This replaces today's "commit `.sandcastle/` yourself" step.
  - **Check**: one `doctor` row per forge tracker lists open spec children (GitHub sub-issues, GitLab `Spec:`-linked issues) missing `issueLabel`, since those are never picked and nothing else says so. Nothing new for files: a malformed file already fails when read.
- **`setup`: keep.** A human doing browser sign-ins; not agent work. It handles **local logins** (today's `gh`/`codex`/`claude` sign-ins, kept). The forge step follows the configured `forge`: `gh auth login`, `glab auth login`, or none (today GitLab gets no step). Standalone provider logins come later from [spec 6](../../6-provider-logins/spec.md), **alongside** local logins, not replacing them.
- **`doctor`: keep**, as its own command, not folded into `run`: its value is checking before phol walks away. Rows: ranking, stop conditions, Sandcastle, Seatbelt, forge checks, logins, quota, CLI versions, Codex models (skill rows already cut in [Bundled skills, vendoring and skill doctor](70-skills.md)); the ranking row follows `balanced`/`most-quota`. Login health reporting stays with spec 6.
- **`plan`: keep.** Its `next` list uses the same ranker as `run` (default `balanced`, `running` = 0) and is labelled a preview, since the real pick is at each stage start and the reviewer is re-picked each round.
- **Smoke: keep both.** `toddler smoke [codex|claude]` (`smoke-agents`, one real model call per role) is **kept**, reversing [A Seatbelt sandbox per stage](65-sandbox-per-stage.md); `smoke-seatbelt` stays (`npm run smoke:seatbelt`).
- **Spec 6 (paused)**: its settled notes "host CLI logins are never read" and "replaces the host-reading path" no longer hold; a note is added there. **Spec 5 (postponed)**: noted that planning outside toddler now has a kit from `init`.
- Glossary: **Local login** added; "host login" dropped from **Provider login**'s avoid list.
