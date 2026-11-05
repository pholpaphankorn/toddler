---
title: Add scripts/vendor-skills.sh to vendor upstream skills
labels: []
blocked_by: []
status: open
---
Toddler ships third-party skills as vendored copies so sandboxed agents never read skills from the host.

Add `scripts/vendor-skills.sh <upstream> <ref>`:
- `<upstream>` is `mattpocock-skills` (https://github.com/mattpocock/skills) or `ponytail` (https://github.com/DietrichGebert/ponytail). Allow overriding the source URL (e.g. an env var) so tests can use a local fixture repo.
- Shallow-clone the upstream at `<ref>` (tag or SHA) into a temp dir.
- Replace `vendor/skills/<upstream>/` with the upstream's `skills/` tree, copied verbatim, plus its `LICENSE`.
  - For ponytail, copy only `skills/`: no `.openclaw/`, hooks, commands or benchmarks.
  - For mattpocock-skills, copy the whole `skills/` tree, including in-progress, misc and deprecated.
- Write `vendor/skills/<upstream>/UPSTREAM.json`: `{ "repo", "version", "commit" }`, where `version` comes from the upstream `package.json` and `commit` is the resolved SHA.
- Never edit vendored files. Never read from the host's `~/.claude` plugin cache.

Done when:
- A test runs the script against a local fixture git repo and checks the copied tree, `LICENSE` and `UPSTREAM.json`.
- README gains a short "Vendored skills" section explaining how to update.

After this lands, the human runs the script for both upstreams and commits `vendor/skills/` before the next skills issue starts.

Decision record: `.sandcastle/issues/8-vendored-layout.md`.
