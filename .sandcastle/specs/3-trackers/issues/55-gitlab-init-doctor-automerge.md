---
title: GitLab init, doctor and autoMerge
labels: []
blocked_by: [52, 54]
parent: 3
status: closed
---
Finish GitLab parity for setup, checks and auto-merge.

1. **`init` detection**: try `gh repo view --json nameWithOwner`, then `glab repo view` (full `group/…/project` path), else `forge: "none"`. Infant parses no remote URLs. If a git remote exists but neither CLI can read it, `init` still writes `none`, names the remote, and says to log in with `gh`/`glab` and rerun. GitLab next steps match GitHub's ("merge request" wording).
2. **`doctor` for GitLab**: `glab api projects/<encoded path>`; FAIL unless the higher of `permissions.project_access` / `group_access` is ≥ 30 (Developer); report `default_branch`. A failed call (not logged in, no access) is the FAIL, showing `glab`'s error. The `issueLabel` check from #51 works on GitLab. No tier report.
3. **`autoMerge: true` on GitLab**: after opening the MR, `enableAutoMerge` calls `PUT …/merge_requests/<iid>/merge` with `auto_merge=true`. Refusal behaves as on GitHub (#52): MR stays open, job stays `pr`, error logged.
4. **No doctor check for GitLab auto-merge**: GitLab has no project setting that must be turned on for auto-merge (confirmed by phol, 2026-11-20), so there is nothing like GitHub's `autoMergeAllowed` to check. A refused auto-merge is caught at run time as in step 3.

Done when tests cover `init` for each detection outcome (gh, glab, neither, remote unreadable), the GitLab access check at and below Developer and on a failed call, and enabling auto-merge plus its refusal path.

Decision records: [48](48-gitlab-merge-requests.md), [49](49-init-doctor-per-forge.md).
