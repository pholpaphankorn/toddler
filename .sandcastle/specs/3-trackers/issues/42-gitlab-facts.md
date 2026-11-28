---
title: GitLab facts for tracker and forge parity
labels: [wayfinder:research, adult]
blocked_by: []
parent: 3
status: closed
assignee: claude (research subagent)
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

## Answer

Full findings: `docs/research/gitlab-facts.md` (sources: docs.gitlab.com as of 2026-11-14 (GitLab 19.6), the live gitlab.com GraphQL schema, `gitlab-org/gitlab` master source, `glab` 1.115.0 help; 1.130.0 is current). Nothing was run against a real GitLab project; the Free-tier 403 comes from reading source.

- **Blocking is Premium+** on gitlab.com and self-managed; Free has only "relates to" links. Read with REST `GET /projects/:id/issues/:iid/links`, keeping `link_type == "is_blocked_by"` with `state == "opened"`. Creating a typed link without a license returns 403. GraphQL `linkedItems(filter: BLOCKED_BY)` is still an Experiment. A Free GitLab tracker needs a fallback, e.g. a body convention like the local `blocked_by:`.
- **Grouping**: epics are Premium+, group-level, and work items since 18.1; nested epics are Ultimate. Free has tasks, but only a task can be a child of an issue, so there is **no issue-to-issue parent/child**. The REST epics API is deprecated in favour of GraphQL `workItems(types: [EPIC])`.
- **Labels**: `GET /projects/:id/issues?state=opened&labels=a,b` ANDs the labels. Add `issue_type=issue` to drop tasks and incidents. The state is `opened`, not `open`. Scoped `key::value` labels are Premium+. Comments come from `…/notes?activity_filter=only_comments`.
- **Merge requests (Free)**: find with `GET …/merge_requests?source_branch=B&state=opened`, create with `POST …/merge_requests`, merge with `PUT …/:iid/merge` (`auto_merge`, `sha`); `…/:iid/closes_issues` lists what a merge closes.
- **Closing keywords** (`Closes #N`) close only on merge to the default branch, and a project setting can turn them off. GitHub behaves the same, so toddler already has this gap when `baseBranch` isn't the default branch.
- **Auth**: `glab auth login --hostname`; token scopes `api` + `write_repository`; credentials in the OS keyring (plaintext config fallback); `glab auth status`. Host order: `GITLAB_HOST` always wins and errors if no git remote matches it, then the git remote, then the config `host`, then gitlab.com.
- **`glab api`** works like `gh api` (REST paths, `graphql`, `--paginate`, `--hostname`, `:fullpath`/`:id` placeholders) but has no `--slurp`; use `--output ndjson`. It does not retry on 429.
- **Project id**: `/projects/:id` takes a numeric id or the URL-encoded path (`group%2Fsub%2Fproject`); unencoded gives 404. Issues and MRs are addressed by `iid`.
