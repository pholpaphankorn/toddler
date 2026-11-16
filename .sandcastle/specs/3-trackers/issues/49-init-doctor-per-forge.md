---
title: Init and doctor for each forge
labels: [wayfinder:grilling, on-hold]
blocked_by: [44, 47, 48]
parent: 3
status: open
---
## Question

What do `toddler init` and `toddler doctor` (`src/main.ts`) do for each setup in [Tracker and forge config shape](44-tracker-forge-config.md): GitHub or GitLab with forge issues, GitHub or GitLab with issue files, and none with issue files?

- **`init` detection**: today it runs `gh repo view` and, if that fails, writes the now-obsolete `{ issues: "local", openPr: false }`. How does it choose `forge` (git remote host, `gh` then `glab`, `GH_HOST`/`GITLAB_HOST`), fill `repository` (GitLab `group/…/project`), and pick `issues`? Does it write `autoMerge` and `issueLabel`, or leave the defaults unwritten? What does it print as next steps for each setup?
- **`doctor` forge check**: today a single "GitHub" check reads `viewerPermission` and the default branch. What does the GitLab check read (`glab auth status`, project access level ≥ Developer to push, default branch), and what does none report?
- **`autoMerge` checks** (from [Publishing to a GitLab forge](48-gitlab-merge-requests.md)): should doctor confirm that the GitHub repo allows auto-merge (`allow_auto_merge`) and that the GitLab project can auto-merge? Is a failure a FAIL, or a warning, given that toddler only logs a refused auto-merge?
- **Tracker checks**: with forge issues, does doctor check that `issueLabel` exists? With GitLab, should it note the tier (no native blocking on Free, so only `Blocked by:` lines count)? With issue files, does it check the `.sandcastle/specs/` layout?
- Does the check go through the `Forge` from [Tracker and forge interface](47-tracker-forge-interface.md) (e.g. a `doctor()` per adapter), or stay in `main.ts`?
