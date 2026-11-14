---
title: GitLab facts for tracker and forge parity
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 3
status: open
---
## Question

From primary GitLab sources (docs, API reference, `glab` docs/source), for gitlab.com and self-managed, per tier (Free / Premium / Ultimate):

- **Blocking:** issue links with "blocks / is blocked by": which tier, the REST/GraphQL API to read them, and what Free offers instead ("relates to" only?).
- **Grouping (for specs):** epics, parent/child issues, tasks, the work item hierarchy: which tier, and API access.
- **Labels:** listing issues by label via the API; scoped labels (tier?).
- **Merge requests:** create, find the open MR for a branch, closing keywords (`Closes #n`) incl. when the default branch differs, merge via API.
- **Auth:** `glab auth login` / `glab auth status`, where it stores credentials, how a self-hosted host is chosen (`GITLAB_HOST`, `--hostname`, git remote), and `glab api` as a REST passthrough like `gh api`.
- **Project id:** `group/subgroup/project` paths vs numeric ids, and URL-encoding them.

Compare each with what toddler uses on GitHub today (`gh api` calls in `src/runner.ts`: labeled issues, `dependencies/blocked_by`, PR creation).
