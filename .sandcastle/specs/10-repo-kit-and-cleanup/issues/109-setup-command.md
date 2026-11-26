---
title: setup as a toddler command: kit step, login steps and glab
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

How is `toddler setup` built now that it writes the kit (in TypeScript) before the login wizard that lives in [scripts/setup.sh](../../../../scripts/setup.sh)?

- Does the bash script go, with the login steps moved into TypeScript, or does the TS command call it?
- The new `glab auth login` step: which host (gitlab.com vs the configured repository's host), and how "already signed in" is detected for `gh`, `glab`, `claude`, `codex`.
- How "files written this run" is known for the pathspec commit (compare before/after content?), and what `setup` prints (files updated, commit SHA, each login's state).
- What `setup` does on a dirty index or a detached/non-default branch before committing.

Settled in [doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md): no flags, both steps always, "run `toddler init` first" with no config, commit message `toddler: set up planning kit`, no commit when nothing changed.
