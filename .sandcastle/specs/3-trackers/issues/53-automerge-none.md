---
title: autoMerge with no forge, and finished jobs unblock issue files
labels: []
blocked_by: [51]
parent: 3
status: open
---
Make offline work (`forge: "none"`) flow without manual merging.

1. **`autoMerge: true` with none**: once a job is approved, toddler fast-forwards `toddler/local-N` into the base branch (the one checked out when the run started):
   - base checked out and clean → `git merge --ff-only`
   - otherwise, base is an ancestor → `git update-ref`
   - fast-forward not possible → skip, log it, leave the branch
   The job is `done` either way.
2. **`autoMerge: false` with none**: as today; approved work stays on its branch, marked `done`.
3. **Unblocking issue files**: the files tracker's `blocked` counts a blocker as finished when its file is closed **or** its job is `done` in toddler's state. Nothing writes to issue files.
4. **`init` next steps** for none add that `"autoMerge": true` fast-forwards approved work into the base branch. Doctor's none line reads `OK Forge: none (nothing pushed; autoMerge on/off)`.

Done when tests cover each fast-forward path (checked-out clean base, base not checked out, not fast-forwardable), the `done` job unblocking its dependents, and the doctor line.

Decision records: [48](48-gitlab-merge-requests.md), [49](49-init-doctor-per-forge.md).

## Note (2026-11-20): temporary patch, close commit in place

Contrary to item 3 above, a stopgap now writes to issue files: for a local issue, `closeCommit()` in `src/runner.ts` adds a separate `pm: close issue N` commit (`status: closed`) on top of the reviewed SHA, so the file closes when the PR merges. It applies to GitHub forges only (`openPr: true`); with `openPr: false` nothing changes. Toddler also reads issue files from `origin/<base>` while PRs are on (`issueRef`), so the merged close commit is what unblocks dependents. Remove both here or when the PM role ([spec 5](../../5-pm-role/spec.md)) gains tracker writes.
