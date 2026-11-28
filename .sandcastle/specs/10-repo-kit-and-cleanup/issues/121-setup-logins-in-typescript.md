---
title: setup login steps in TypeScript, with a glab step
labels: []
blocked_by: [120]
parent: 10
status: closed
---
`toddler setup` signs in only the CLIs this repo's config uses, including `glab` for GitLab, and the bash wizard goes. Settled in [setup as a toddler command](109-setup-command.md) (steps 1–4, 7) and [How spec 10's setup, kit and doctor row are tested](114-testing-spec-10.md) (step 3).

1. **`scripts/setup.sh` and its wizard library are deleted.** Each login step is "status command, else login command with inherited stdio"; plain one-line output, no screen clearing or Enter pauses.
2. **Steps follow the config**: `gh` only for `forge: github`, `glab` only for `forge: gitlab`, no forge step for `none`. `codex`/`claude` only when some role uses that provider, else `<provider>: skipped (no role uses it)`.
3. **Signed-in checks** (exit 0 = signed in): `gh auth status --hostname github.com`, `glab auth status` (in the repo root), `codex login status`, `claude auth status`. glab login: `glab auth login --hostname <host>`, host from `glab config get host`, falling back to gitlab.com.
4. **Output and exit**: `gh: signed in` / `gh: signing in…` / `gh: not signed in` per step; a failed or cancelled login doesn't stop `setup`. Then `doctor` in-process; `setup`'s exit code is doctor's.
5. README's setup section and any `setup.sh` mentions updated.

- [ ] Process tests with fake `gh`/`glab`/`codex`/`claude` scripts that log their arguments and take their status exit code from an env var: steps run per `forge` and role providers (`codex: skipped (no role uses it)`, no `glab` step on GitHub); `login` runs after a failing status; a failed login doesn't stop `setup`; exit code equals doctor's with those fakes
- [ ] No reference to `setup.sh` left in the repo
