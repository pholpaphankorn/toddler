---
title: Publishing to a GitLab forge
labels: [wayfinder:grilling, on-hold]
blocked_by: [44]
parent: 3
assignee: phol (with claude)
status: closed
---
## Question

What does toddler's publish step (`publish()` in `src/runner.ts`: `gh pr list`, `git push`, `gh pr create`) do on a GitLab forge, and on `none`? Facts: [GitLab facts for tracker and forge parity](42-gitlab-facts.md).

- Finding an existing MR for an issue's branch (`source_branch` + `state=opened`), and what counts as "already has a PR".
- MR title/body and the closing reference: `Closes #N` closes only on merge to the default branch, the same gap GitHub has today when `baseBranch` isn't the default. Accept it, warn, or have toddler close issues itself?
- With `issues: "files"` and a GitHub or GitLab forge, what does the PR/MR reference, since there is no remote issue to close?
- Toddler never merges PRs today: does that stay true for MRs, and what does `none` do? (Today approved work stays on its local branch, marked `done`: nothing merges, though [Tracker and forge config shape](44-tracker-forge-config.md) says "work merges locally".)

## Answer

Grilled with phol, 2026-11-16. The closing-keyword gap from the Question can't happen on a forge: [Tracker and forge interface](47-tracker-forge-interface.md) makes `base()` the default branch, which is the branch `Closes #N` needs.

- **Existing request**: GitLab's `findRequest(branch)` reads `merge_requests?source_branch=<branch>` and returns `{ url, open }` for an `opened` or `merged` MR. A `closed` MR counts as none, so the issue can be picked again. The rule is the same on GitHub (`CLOSED` is ignored). `publish()` reuses an open request and otherwise pushes and opens one.
- **Title and body**: the runner writes one text for both forges (`Fix #N: <title>`, Summary/Evidence/Merge Danger, `Closes #N`). Only the word changes, "pull request" or "merge request". On GitLab `#N` is the iid in the same project. Toddler never closes issues itself. If a project turns closing keywords off, that is the user's setting, and toddler doesn't warn.
- **Issue files with a GitHub or GitLab forge**: no `Closes` line. The body names `local issue N` plus the file's path relative to the repo. Closing the file stays manual.
- **`autoMerge: boolean`**, a new top-level config key, default `false`, valid with every forge. No merge-method key: each host's default method is used, and whether a method setting ever comes is open.
  - **GitHub and GitLab**: after opening the request, toddler turns on the host's **native auto-merge** (`gh pr merge --auto`; GitLab `PUT …/merge` with `auto_merge=true`), so the merge waits for required checks and approvals. This holds whether issues are remote or files. If the host refuses (e.g. the repo hasn't enabled auto-merge), the request stays open, the job stays `pr` and the error is logged. The `Forge` request side gains `enableAutoMerge(request)`.
  - **None** (everything offline): toddler merges `toddler/local-N` into the base branch (the one checked out when the run started) by **fast-forward only**: `git merge --ff-only` when the base is checked out and clean, otherwise `git update-ref` when the base is an ancestor. If a fast-forward isn't possible, it skips the merge, logs it and leaves the branch. The job is `done` either way.
  - **`autoMerge: false`**: as today. Toddler never merges. With none, approved work stays on its local branch, marked `done`. This corrects "work merges locally" in [Tracker and forge config shape](44-tracker-forge-config.md): that is true only with `autoMerge: true`.
- **Unblocking issue files**: a merged or `done` local job doesn't change its file, so its dependents would stay blocked. The files tracker's `blocked` counts a blocker as finished when its file is closed **or** its job is `done` in `.sandcastle/state.json`. No tracker writes.
- **The tracker stays read-only in this spec.** Write operations (closing issues, reprioritising) come with [PM role](../../5-pm-role/spec.md), which extends `Tracker` when it needs them. That spec has a note to revisit.
