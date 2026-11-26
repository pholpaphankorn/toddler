---
title: GitLab deliver and poll, and infant smoke forge
labels: []
blocked_by: [88]
parent: 8
status: closed
---
GitLab merge requests land exactly like GitHub PRs, and phol can check the forge behaviours nobody has tried yet against a scratch repo.

1. **GitLab `deliver`**: push the exact SHA, find or open the MR, re-enable auto-merge after every push (a source push aborts it). A rejected push or a rebase-only project refusing the merge commit → `refused(reason)`.
2. **GitLab `poll`**: one `glab` read mapped to the same union and precedence as GitHub (`detailed_merge_status`, e.g. `need_rebase` → `behind`; `opened` with `merge_when_pipeline_succeeds` false → `auto-merge-off`). `ci-failed` drops `allow_failure` jobs, reads each failing job's trace and cuts it with `logTail`; external CI gives name + link.
3. **`infant smoke forge`**, opt-in, run by hand against a scratch repo phol names, never in CI: opens a PR/MR, pushes a host merge, polls, reports what it saw for GitHub keeping auto-merge after a host push, a GitLab merge commit clearing `need_rebase`, and GitHub linear history; then closes the request and deletes the branch.

- [ ] Table-driven rows in `gitlab.test.ts` matching the GitHub rows in #88, plus `allow_failure` dropped, the trace cut to its tail, auto-merge re-enabled after every push
- [ ] `infant smoke forge` documented in the README with what each reported line means; no test runs it against a real forge

Decision records: [74](74-forge-landing-apis.md), [78](78-forge-seam.md), [80](80-landing-tests.md).
