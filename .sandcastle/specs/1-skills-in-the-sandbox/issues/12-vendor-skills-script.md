---
title: Vendor the skills infant uses from a manifest
labels: []
blocked_by: []
status: closed 
---
Infant ships third-party skills as vendored copies so sandboxed agents never read skills from the host. It vendors only the skills it uses, plus every skill those refer to.

1. **Manifest.** Add the committed file `vendor/skills.json`:
   ```json
   { "mattpocock-skills": { "repo": "https://github.com/mattpocock/skills", "ref": "v1.3.1",
       "skills": ["tdd", "diagnosing-bugs", "codebase-design", "code-review"] },
     "ponytail": { "repo": "https://github.com/DietrichGebert/ponytail", "ref": "v5.3.3",
       "skills": ["ponytail", "ponytail-review"] } }
   ```
2. **Script.** Add `scripts/vendor-skills.sh` (no arguments). For each upstream in the manifest:
   - Shallow-clone `repo` at `ref` into a temp dir. Never read from the host's `~/.claude` plugin cache.
   - Find each listed skill: the folder under the upstream's `skills/` (at any depth) that contains a `SKILL.md`. A listed skill that isn't found is an error.
   - Write `vendor/skills/<upstream>/<skill>/`, a flat, byte-for-byte copy of each skill folder, plus the upstream `LICENSE`.
   - Remove skill folders that are no longer listed.
   - Write `vendor/skills/<upstream>/UPSTREAM.json`: `{ "repo", "ref", "version", "commit" }`. `version` comes from the upstream `package.json`; `commit` is the resolved SHA.
   - Never edit vendored files.
3. **Test.** It must run offline. Point the manifest's `repo` at a local fixture git repo (allow overriding the manifest path, e.g. an env var), with skills nested under category folders. Check:
   - the flat copy;
   - the error for a missing listed skill;
   - removal of an unlisted skill;
   - `LICENSE` and `UPSTREAM.json`.
4. **README.** Add a short "Vendored skills" section. To add a skill or bump a version: edit `vendor/skills.json`, check what the skill refers to and add those too, re-run the script, review the diff, commit.

After this lands, the human runs `scripts/vendor-skills.sh` (it needs network) and commits `vendor/` before the next skills issue starts.

Decision record: `.sandcastle/specs/1-skills-in-the-sandbox/issues/8-vendored-layout.md` (see its revision note).
