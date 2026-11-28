---
title: init commits its config
labels: []
blocked_by: [120]
parent: 10
status: closed
---
`toddler init` writes the config and commits it, and nothing else; the person no longer commits `.sandcastle/` by hand. Settled in spec 7's [doctor, setup, init, plan and smoke](../../7-harness-boundary/issues/72-cli-modes.md) (2026-11-26 revision).

1. On first run `init` commits the files it created (config, `.sandcastle/.gitignore`) with the same pathspec rule as `setup`'s kit commit, message `toddler: add config`; other staged changes stay out. Not a git repo or detached HEAD → written, not committed, with a line saying so.
2. On a configured repo it prints "already exists" and does nothing (no kit refresh).
3. Next-steps text: step "Commit .sandcastle/" goes; it ends with "run: toddler setup".

- [ ] Process tests in temp git repos: first run commits exactly the created files with `toddler: add config`; a pre-staged unrelated file stays staged and uncommitted; second run changes nothing
- [ ] README's getting-started steps match
