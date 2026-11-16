---
title: Init and doctor for each forge
labels: [wayfinder:grilling, on-hold]
blocked_by: [44, 47, 48]
parent: 3
status: closed
assignee: phol (with claude)
---
## Question

What do `toddler init` and `toddler doctor` (`src/main.ts`) do for each setup in [Tracker and forge config shape](44-tracker-forge-config.md): GitHub or GitLab with forge issues, GitHub or GitLab with issue files, and none with issue files?

- **`init` detection**: today it runs `gh repo view` and, if that fails, writes the now-obsolete `{ issues: "local", openPr: false }`. How does it choose `forge` (git remote host, `gh` then `glab`, `GH_HOST`/`GITLAB_HOST`), fill `repository` (GitLab `group/…/project`), and pick `issues`? Does it write `autoMerge` and `issueLabel`, or leave the defaults unwritten? What does it print as next steps for each setup?
- **`doctor` forge check**: today a single "GitHub" check reads `viewerPermission` and the default branch. What does the GitLab check read (`glab auth status`, project access level ≥ Developer to push, default branch), and what does none report?
- **`autoMerge` checks** (from [Publishing to a GitLab forge](48-gitlab-merge-requests.md)): should doctor confirm that the GitHub repo allows auto-merge (`allow_auto_merge`) and that the GitLab project can auto-merge? Is a failure a FAIL, or a warning, given that toddler only logs a refused auto-merge?
- **Tracker checks**: with forge issues, does doctor check that `issueLabel` exists? With GitLab, should it note the tier (no native blocking on Free, so only `Blocked by:` lines count)? With issue files, does it check the `.sandcastle/specs/` layout?
- Does the check go through the `Forge` from [Tracker and forge interface](47-tracker-forge-interface.md) (e.g. a `doctor()` per adapter), or stay in `main.ts`?

## Answer

Grilled with phol, 2026-11-16.

- **`init` detection** stays in `main.ts` (no forge exists yet): try `gh repo view --json nameWithOwner`, then `glab repo view` (full `group/…/project` path), else `forge: "none"`. The CLIs resolve the host (`GH_HOST`/`GITLAB_HOST` or the git remote); toddler parses no remote URLs. If a git remote exists but neither CLI can read it, `init` still writes `none` but names the remote and says to log in with `gh`/`glab` and rerun.
- **`init` writes** `{ forge, repository?, install: "", verify: "" }`: `forge` always (even `"github"`), `repository` only with a forge. `issues`, `autoMerge` and `issueLabel` are left to their defaults.
- **`init` next steps**: GitHub/GitLab: label the issues toddler should work on `<issueLabel>`, or set `"issues": "files"` for issue files. None: how to write issue files, that nothing is pushed, and that `"autoMerge": true` fast-forwards approved work into the base branch. Steps 1–3 (install/verify, `project.md`, commit + `toddler setup`) are unchanged.
- **`doctor` checks come from the forge**: each adapter exposes `doctorChecks(config): [name, action][]` (the `skillDoctorChecks` shape), run through `main.ts`'s existing `check`. Only OK and FAIL; no WARN level.
  - **GitHub**: as today (`viewerPermission` ≥ WRITE, default branch). With `autoMerge: true`, FAIL when `autoMergeAllowed` is false.
  - **GitLab**: `glab api projects/<encoded path>`; FAIL unless the higher of `permissions.project_access` / `group_access` is ≥ 30 (Developer); reports `default_branch`. A failed call (not logged in, no access) is the FAIL, showing `glab`'s error. No auto-merge check (believed not to be a project setting on GitLab; confirm when writing the implementation issue).
  - **None**: `OK Forge: none (nothing pushed; autoMerge on/off)`.
  - **Tracker**: with `issues: "forge"`, FAIL if the `issueLabel` label doesn't exist. No GitLab tier report (`Blocked by:` lines work on every tier). No check for issue files.
