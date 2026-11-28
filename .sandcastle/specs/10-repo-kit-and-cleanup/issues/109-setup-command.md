---
title: setup as a toddler command: kit step, login steps and glab
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

How is `toddler setup` built now that it writes the kit (in TypeScript) before the login wizard that lives in [scripts/setup.sh](../../../../scripts/setup.sh)?

- Does the bash script go, with the login steps moved into TypeScript, or does the TS command call it?
- The new `glab auth login` step: which host (gitlab.com vs the configured repository's host), and how "already signed in" is detected for `gh`, `glab`, `claude`, `codex`.
- How "files written this run" is known for the pathspec commit (compare before/after content?), and what `setup` prints (files updated, commit SHA, each login's state).
- What `setup` does on a dirty index or a detached/non-default branch before committing.

Settled in [doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md): no flags, both steps always, "run `toddler init` first" with no config, commit message `toddler: set up planning kit`, no commit when nothing changed.

## Answer

Resolved with phol 2026-11-28 (grilling).

1. **TypeScript, script deleted.** `setup` becomes a function in `main.ts`; `scripts/setup.sh` and its wizard library go. Each login step is "status command, else login command with inherited stdio"; plain one-line output, no screen clearing or Enter pauses. `doctor` is called in-process at the end.
2. **Steps follow the config.** `gh` only for `forge: github`, `glab` only for `forge: gitlab`, no forge step for `none` (today's "has a git remote" test goes). `codex` / `claude` only when some role uses that provider; otherwise `<provider>: skipped (no role uses it)`.
3. **glab host comes from glab.** `glab auth status` run in the repo root (glab resolves the host from the git remote); non-zero → `glab auth login --hostname <host>`, host from the same resolution (`glab config get host`, falling back to gitlab.com). No `host` config key until a real self-hosted case needs one.
4. **Signed-in checks**, exit 0 = signed in: `gh auth status --hostname github.com`, `glab auth status`, `codex login status`, `claude auth status`. Subscription-vs-API-key stays with `doctor` / spec 6.
5. **Commit = kit paths git reports changed.** Each kit file is written only when its rendered content differs; then `git commit --only -- <kit paths git status reports changed>` (`--only` keeps any other staged changes out). A kit file that already had uncommitted changes before `setup` ran is written but left out of the commit, with `<file>: has your uncommitted edits, commit it yourself`. Using git status, not "written this run", lets a run interrupted before its commit be finished by the next one.
6. **Any branch.** Commits on whatever branch is checked out, no default-branch check. Detached HEAD: kit written, not committed, `detached HEAD: kit written, not committed`.
7. **Order and output**: kit → commit → logins → `doctor`. Lines like `kit: wrote …`, `kit: committed <sha> (toddler: set up planning kit)` or `kit: up to date`, then `gh: signed in` / `gh: signing in…` / `gh: not signed in` per step (a failed or cancelled login doesn't stop `setup`), then the doctor rows. `setup`'s exit code is doctor's.

Glossary: **Planning kit** added.
