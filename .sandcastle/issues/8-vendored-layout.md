---
title: Vendored layout and update procedure
labels: [wayfinder:grilling, on-hold]
blocked_by: [5]
parent: 1
assignee: phol (with claude)
status: closed
---
## Question

Where do vendored skills live in the toddler repo, how is the upstream source and version recorded, how are licenses kept, and how does an update get pulled in (by hand or a script)?

## Answer

- **Layout.** Each upstream sits at `vendor/skills/<upstream>/` in the toddler repo: `mattpocock-skills/` and `ponytail/`. Each folder holds that upstream's `skills/` tree verbatim, plus its `LICENSE` and an `UPSTREAM.json` file (`{ repo, version, commit }`).
- **Mount.** The whole `vendor/skills` folder is the read-only mount.
- **Index.** At startup toddler builds a name → folder index from every `SKILL.md` under `vendor/skills`. The name comes from frontmatter `name` and falls back to the folder name. A duplicate name across upstreams is an error. Linking and config validation both use this index.
- **No local edits.** Vendored files stay byte-for-byte upstream, including Codex's `agents/openai.yaml`. Toddler-specific behaviour lives in toddler's prompts only.
- **Updates.** `scripts/vendor-skills.sh <upstream> <ref>` does three things:
  1. Shallow-clones the upstream GitHub repo at that ref: `github.com/mattpocock/skills` or `github.com/DietrichGebert/ponytail`, never the host plugin cache.
  2. Replaces the upstream's folder with its `skills/` tree and `LICENSE`.
  3. Writes `UPSTREAM.json` with the version from `package.json` and the resolved commit SHA.

  A human reviews and commits the diff. There are no runtime updates.
- **What gets copied.** All of mattpocock's `skills/`, including in-progress, misc and deprecated. Only `skills/` from ponytail: no `.openclaw` duplicate, hooks, commands or benchmarks.

_Revised: vendor only what toddler uses._
- **What gets vendored.** Only skills toddler uses (loaded explicitly in some role's set), plus every skill they refer to. Today that is mattpocock `tdd`, `diagnosing-bugs`, `codebase-design`, `code-review` and ponytail `ponytail`, `ponytail-review`. `tdd`'s references (codebase-design, code-review) are already included. No automatic reference check: whoever adds a skill checks what it refers to.
- **Manifest.** The committed `vendor/skills.json` maps each upstream to `{ repo, ref, skills: [...] }`.
- **Script.** `scripts/vendor-skills.sh` takes no arguments. It vendors exactly the manifest's skills and removes any skill no longer listed.
- **Layout.** `vendor/skills/<upstream>/<skill>/`, flat within each upstream (no `engineering/` category folders). Each skill folder is byte-for-byte upstream, with `LICENSE` and `UPSTREAM.json` (resolved commit SHA) beside them.
