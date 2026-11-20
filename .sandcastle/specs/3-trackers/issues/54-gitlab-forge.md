---
title: "GitLab forge: issues to merge requests"
labels: []
blocked_by: [51]
parent: 3
status: closed
---
With `forge: "gitlab"`, a GitLab issue labelled `issueLabel` ends up as an open merge request, as GitHub issues do today. All GitLab calls go through the host `glab` login (`glab api`), taken as a `Command` so tests use a fake `glab`.

1. **Config**: `forge: "gitlab"` is accepted; `repository` is `group/…/project` (two or more parts), URL-encoded by toddler for API paths. Host comes from `GITLAB_HOST` or the git remote via `glab`; no config field.
2. **Tracker side**:
   - `issues()`: open issues labelled `issueLabel`; `number` is the iid. Scoped labels (`workflow::blocked`) are plain names matched whole by the existing label rules.
   - `blocked(issue)`: blocked while any blocker is open, from either source:
     - native `is_blocked_by` links (Premium+; on Free the read returns none, so the tier is never checked), in any project
     - body lines `Blocked by: #12, #15`: case-insensitive at the start of a line, one or more same-project `#<iid>`, may repeat; a mid-sentence mention doesn't count
     An unresolvable body line (missing issue, or a cross-project reference like `group/other#4`) counts as **blocked** and is logged.
   - `comments(issue)`: the issue's notes.
3. **Request side**:
   - `base()`: the project's default branch, fetched.
   - `findRequest(branch)`: `merge_requests?source_branch=<branch>`; an `opened` or `merged` MR counts, a `closed` one doesn't.
   - `openRequest(…)`: push, open the MR, return its URL. Body text is the same as GitHub's with "merge request" for "pull request"; `Closes #N` uses the iid. Issue files with a GitLab forge get no `Closes` line.
4. **Run checks**: the push remote must match `repository` (the error names GitLab, not GitHub). `GITLAB_TOKEN` is blanked in the sandbox like `GH_TOKEN`.

Done when GitLab adapter tests with a fake `glab` cover: label filtering and iid numbering, URL encoding of nested paths, native links, each `Blocked by:` form (repeat lines, mid-sentence ignored, unresolvable → blocked and logged), finding opened/merged/closed MRs, and the MR body. README documents `forge: "gitlab"`, `GITLAB_HOST` and the `Blocked by:` line.

Decision records: [46](46-gitlab-blocking-labels.md), [47](47-tracker-forge-interface.md), [48](48-gitlab-merge-requests.md). GitLab API facts: [42](42-gitlab-facts.md).
