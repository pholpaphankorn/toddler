# GitLab facts for tracker and forge parity

Research for [ticket 42](../../.sandcastle/specs/3-trackers/issues/42-gitlab-facts.md) (spec 3, trackers). Researched 2026-11-14.

Question: what does GitLab (gitlab.com and self-managed, per tier) offer for the things toddler does on GitHub today in [src/runner.ts](../../src/runner.ts): list open issues by label, read blockers, read comments, find/create a PR for a branch with `Closes #n`, all via `gh`?

Method: docs.gitlab.com (fetched 2026-11-14; the docs carry history notes up to GitLab 19.6), the live gitlab.com GraphQL schema (unauthenticated introspection, 2026-11-14), GitLab source on `gitlab-org/gitlab` `master` (2026-11-14), and the locally installed `glab` 1.115.0 `--help` (1.130.0 is current per its update notice). Nothing was written to any GitLab instance.

Legend: **[doc]** official documentation, **[schema]** live gitlab.com GraphQL schema, **[src]** first-party source, **[glab]** `glab` 1.115.0 help text, **[undocumented]** inferred or not stated anywhere official.

Tier badges below apply equally to GitLab.com, Self-Managed and Dedicated unless noted; every page checked carried all three offerings.

---

## Summary table

| toddler on GitHub today                                                                          | GitLab equivalent                                                                                                                                               | Tier                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `gh api repos/R/issues?state=open&labels=L&per_page=100 --paginate --slurp`, drop `pull_request` | `GET /projects/:id/issues?state=opened&labels=L&per_page=100` (MRs are a separate resource)                                                                     | Free                   |
| `gh api repos/R/issues/N/dependencies/blocked_by`                                                | `GET /projects/:id/issues/:iid/links`, keep `link_type == "is_blocked_by"`, check `state == "opened"`; or GraphQL `linkedItems(filter: BLOCKED_BY)` / `blocked` | Blocking: **Premium+** |
| `gh api repos/R/issues/N/comments`                                                               | `GET /projects/:id/issues/:iid/notes?activity_filter=only_comments`                                                                                             | Free                   |
| `gh pr list --head B --state all/open --json url,state`                                          | `GET /projects/:id/merge_requests?source_branch=B&state=opened` (or `glab mr list -s B`)                                                                        | Free                   |
| `gh pr create --base --head --title --body-file`                                                 | `POST /projects/:id/merge_requests` (`source_branch`, `target_branch`, `title`, `description`) or `glab mr create`                                              | Free                   |
| `Closes #N` in body                                                                              | Same keyword, closes on merge into the **default branch**                                                                                                       | Free                   |
| `gh auth` / `gh api`                                                                             | `glab auth login/status`, `glab api`                                                                                                                            | n/a                    |

---

## 1. Blocking issue links

- **[doc]** Linked issues as a whole: Free, Premium, Ultimate. "Blocks" / "is blocked by": **Premium, Ultimate** ([related issues](https://docs.gitlab.com/user/project/issues/related_issues/), [linked items](https://docs.gitlab.com/user/work_items/linked_items/)). The only history note is a role change in 17.0; no note says blocking moved to Free. Free gets "relates to" only.
- **[doc]** REST [Issue links API](https://docs.gitlab.com/api/issue_links/), page tier Free/Premium/Ultimate:
  - `GET /projects/:id/issues/:issue_iid/links` returns the linked issues, each with `issue_link_id`, `link_type`, `link_created_at`, `link_updated_at` plus issue fields incl. `iid`, `project_id`, `state`.
  - `POST /projects/:id/issues/:issue_iid/links` with `target_project_id`, `target_issue_iid`, `link_type` (`relates_to` default, `blocks`, `is_blocked_by`). `DELETE .../links/:issue_link_id`. `id` in get/create/delete responses since 18.9.
  - The page has one tier badge and does not say which `link_type` values need Premium.
- **[src]** On EE without the `blocked_issues` licensed feature (i.e. Free on gitlab.com, or unlicensed EE self-managed), creating a link with any explicit `link_type` returns **403 "Blocked issues not available for current license"**, not a silent downgrade ([ee/app/services/ee/issue_links/create_service.rb](https://gitlab.com/gitlab-org/gitlab/-/raw/master/ee/app/services/ee/issue_links/create_service.rb)). In the CE base service `set_link_type` is a no-op, so on a pure CE (FOSS) build every link is `relates_to` ([app/services/issuable_links/create_service.rb](https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/services/issuable_links/create_service.rb)).
- **[undocumented]** What the list endpoint returns on Free for `blocks` links created while a project had Premium (trial, downgrade). Not checked.
- **[schema]** GraphQL: `WorkItemWidgetLinkedItems { blocked, blockedByCount, blockingCount, linkedItems(filter: WorkItemRelatedLinkType) }` with enum `RELATED | BLOCKED_BY | BLOCKS`; each `LinkedWorkItemType` has `linkType`, `workItemState`, `workItem`, `linkId`. `linkedItems` is "Introduced in GitLab 16.3: Status: Experiment". The legacy `Issue` type also has `blocked`, `blockedByCount`, `blockedByIssues`, and `linkedWorkItems(filter:)` (17.8, Experiment).
- **[doc]** UI/quick actions: `/relate`, `/blocks`, `/blocked_by`, `/unlink` ([linked items](https://docs.gitlab.com/user/work_items/linked_items/)).
- **vs GitHub:** toddler calls `issues/N/dependencies/blocked_by` and treats any `state == "open"` blocker as blocking, including blockers in other repos. GitLab equivalent is the links list filtered to `link_type == "is_blocked_by"` and `state == "opened"` (GitLab's open state is `opened`). Links can cross projects (`target_project_id`), like GitHub. **On Free there is no blocking at all**, so a Free GitLab tracker needs a fallback (for example a body convention like toddler's local `blocked_by:` front matter).

## 2. Grouping: epics, parent/child, tasks

- **[doc]** [Epics](https://docs.gitlab.com/user/group/epics/): **Premium, Ultimate**. Epics are group-level, are work items (beta 17.2, enabled on gitlab.com 17.6, default on self-managed 17.7, **GA in 18.1**), and can be the parent of issues. **Multi-level (child) epics: Ultimate only**; up to 7 levels deep, max 5000 direct children ([child items](https://docs.gitlab.com/user/work_items/child_items/)).
- **[doc]** [Tasks](https://docs.gitlab.com/user/tasks/): **Free**. A task's parent is an issue in the same project.
- **[src]** Issue type definition: allowed child type is only `task` (max depth 1); parent `epic` requires the `:epics` license ([definitions/issue.rb](https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/models/work_items/types_framework/system_defined/definitions/issue.rb)). So **there is no issue-to-issue parent/child**. On Free the only hierarchy is issue → task.
- **[doc]** Since 18.10 the UI "Work items" list replaced Plan > Issues and Plan > Epics ([work items](https://docs.gitlab.com/user/work_items/)). Configurable work item types also exist ([link](https://docs.gitlab.com/user/work_items/configurable_work_item_types/)); not researched.
- **API:**
  - **[doc]** REST [epics API is deprecated](https://docs.gitlab.com/api/graphql/epic_work_items_api_migration_guide/) (no new features, removal "in a major release", no date). The legacy Epic GraphQL API was planned for removal in 19.0. Replacement: GraphQL `workItems(types: [EPIC])` with `WorkItemWidgetHierarchy`.
  - **[doc]** REST issues carry `epic { id, iid, title, url, group_id }` and accept the `epic_id` filter (Premium+); `epic_iid` is deprecated ([issues API](https://docs.gitlab.com/api/issues/)). REST `issue_type` filter accepts `task`.
  - **[schema]** `WorkItemWidgetHierarchy { parent, hasParent, ancestors, children(state:), hasChildren, rolledUpCountsByType }`. `Project.workItems` / `Group.workItems` / `Namespace.workItems` accept `labelName`, `state`, `types`, `parentIds`, `hierarchyFilters`, `iid(s)`. `Project.workItems` and `Query.workItem` are "Introduced in GitLab 15.1: Status: Experiment"; `Namespace.workItems` 18.1, Experiment. The migration guide says the WorkItem API is "experimental but used in production".
- **vs GitHub:** toddler groups by spec folders and labels, not by GitHub sub-issues, so nothing here is required. If a spec were mapped to an epic it would need Premium and GraphQL; tasks (Free) are the only Free grouping and are too small to hold an issue.

## 3. Labels

- **[doc]** `GET /projects/:id/issues?labels=a,b`: comma-separated, **AND** ("issues must have all labels"); `None` / `Any` special values; `state=opened|closed|all`; default 20 per page; keyset pagination for project issues since 18.3 ([issues API](https://docs.gitlab.com/api/issues/)). Offset pagination max `per_page=100`, `Link` header, `x-total` omitted above 10,000 ([REST basics](https://docs.gitlab.com/api/rest/)).
- **[undocumented]** The issues page never says MRs are excluded; they are a separate resource (`/merge_requests`), so the `pull_request` filter toddler applies on GitHub has no GitLab counterpart. The issues list can include tasks, incidents, test cases (`issue_type` filter / `type` field), so filter `issue_type=issue` if only issues are wanted.
- **[doc]** [Scoped labels](https://docs.gitlab.com/user/project/labels/) (`key::value`, one value per key, last `::` separates scope): **Premium, Ultimate**. The page does not say what Free does with `::` in a name; **[undocumented]**: presumably a plain label. Plain labels are Free.
- **vs GitHub:** same shape. toddler's single `issueLabel` URL-encoded into `labels=` maps directly; use `state=opened` instead of `open`.

## 4. Merge requests

- **[doc]** Find the open MR for a branch: `GET /projects/:id/merge_requests?source_branch=B&state=opened` (`state` = `opened|closed|locked|merged|all`, default `all`) ([MR API](https://docs.gitlab.com/api/merge_requests/)). **[glab]** `glab mr list -s B` (`--source-branch`, `--target-branch`, `-R/--repo`).
- **[doc]** Create: `POST /projects/:id/merge_requests` with required `source_branch`, `target_branch`, `title`; optional `description`, `remove_source_branch`, `target_project_id`, `labels`, `squash`. **[glab]** `glab mr create -s B -b base -t title --description-file f -y -R group/project` (no local clone needed when all inputs are flags). **[undocumented]** the error returned when an open MR already exists for the same source/target was not found on the page; toddler already checks first.
- **[doc]** Merge: `PUT /projects/:id/merge_requests/:iid/merge` with `auto_merge`, `sha`, `squash`, `should_remove_source_branch`, commit messages; `merge_when_pipeline_succeeds` deprecated in 17.11 for `auto_merge`; `sha` becomes required when the group/instance setting is on (19.2). Errors: 400 SHA missing, 401, **405 cannot be merged**, **409 SHA does not match HEAD**, 422 branch cannot be merged. **[glab]** `glab mr merge` defaults to auto-merge while a pipeline runs (`--auto-merge=false` to merge now), `--sha`, `--squash`, `-d`, `-y`.
- **[doc]** `GET /projects/:id/merge_requests/:iid/closes_issues` lists issues that will close on merge.
- **[doc]** Closing keywords ([managing issues](https://docs.gitlab.com/user/project/issues/managing_issues/)): close/fix/resolve/implement families, refs `#123`, `group/project#123`, or a full URL. Issues close when the commit is pushed to, or the MR is merged into, **the project's default branch**. Per-project toggle "Auto-close referenced issues on default branch" (Maintainer+); admins on self-managed/Dedicated can change the pattern. **[undocumented]** behaviour for an MR targeting a non-default branch is not stated; by the rule above the issue does not close on that merge. This matches GitHub, where closing keywords also only act on PRs targeting the default branch ([GitHub docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue), not re-fetched for this note), so toddler's `Closes #N` with a non-default `job.baseBranch` already has this gap on GitHub.
- **vs GitHub:** 1:1. toddler's `gh pr list --state all` and "skip if not CLOSED" maps to GitLab states `opened`/`merged`/`locked` (anything but `closed`).

## 5. Auth and host selection (`glab`)

- **[doc]** `glab auth login` ([login](https://docs.gitlab.com/cli/auth/login/)): `--hostname`, `-t/--token`, `--stdin`, `-a/--api-host`, `--api-protocol`, `-g/--git-protocol`, `--web` (OAuth), `-j/--job-token`, `--insecure-storage`. Device flow on self-managed needs GitLab 17.9+ ([authentication](https://docs.gitlab.com/cli/authentication/)). PAT scopes needed: `api`, `write_repository`.
- **[doc]** Credential storage: OS keyring by default (macOS Keychain, Windows Credential Manager, Linux Secret Service). Plaintext in the global `config.yml` if no keyring, `--insecure-storage`, or `CI`/`GITLAB_CI` set. Config file search: `$GLAB_CONFIG_DIR/config.yml`, then legacy `~/.config/glab-cli/config.yml`, then `$XDG_CONFIG_HOME/glab-cli/config.yml` (macOS `~/Library/Application Support/glab-cli/config.yml`, confirmed by `glab config path` here), then `$XDG_CONFIG_DIRS` ([configuration](https://docs.gitlab.com/cli/configuration/)).
- **[doc]** Token precedence: `GITLAB_TOKEN`, `GITLAB_ACCESS_TOKEN`, `OAUTH_TOKEN` (first set wins, sent only to trusted hosts: the `GITLAB_HOST`/config host, `GITLAB_REPO` host, configured hosts) > stored credential > `CI_JOB_TOKEN` (if CI auto-login on) > unauthenticated ([authentication](https://docs.gitlab.com/cli/authentication/)).
- **[doc]** Host precedence: `GITLAB_HOST` (aliases `GL_HOST`, `GITLAB_URI`) **always wins, and glab errors if no remote matches it**; then a git remote in the current repo; then the `host` config key; then `gitlab.com` ([configuration](https://docs.gitlab.com/cli/configuration/)). `remote_alias` config picks which remote. `-R/--repo` accepts `GROUP/NAMESPACE/REPO` or a full URL; `GITLAB_REPO` is its default. **[glab]** `glab api` uses the current repo's authenticated host, else gitlab.com, overridable by `--hostname`; the docs do not rank `--hostname` against `GITLAB_HOST` **[undocumented]**.
- **[glab]** `glab auth status [--hostname H | --all] [--show-token]` checks the context host (git remote, `GITLAB_HOST`, or config). The docs say it reports where each token is stored; exit-code semantics are **[undocumented]** on the pages read.
- **[doc][glab]** `glab api <endpoint>|graphql` ([api](https://docs.gitlab.com/cli/api/)) is the `gh api` analogue: placeholders `:id`, `:fullpath`, `:group`, `:namespace`, `:repo`, `:branch`, `:user`, `:username` from the current repo; `--placeholder name=value`; `-X/--method` (GET, or POST once fields are given); `-f/--raw-field`, `-F/--field` (typed, `@file`), `--input`, `--form`; `--paginate`; `--output json|ndjson`. GraphQL `--paginate` needs `$endCursor` and `pageInfo { hasNextPage endCursor }`. No `--slurp`: default `json` output prints arrays "as a single JSON array" **[undocumented whether pages are merged into one array]**; `--output ndjson` is the safe way to stream all pages. On HTTP 429 `--paginate` exits rather than retrying.
- **vs GitHub:** toddler relies on `gh` stored auth and `--repo owner/name`. With glab, prefer `-R group/subgroup/project` or `glab api projects/<encoded>/...` plus `--hostname` (or `GITLAB_HOST`) so a self-hosted host does not depend on the cwd's remote. Beware: setting `GITLAB_HOST` makes glab error in a repo whose remotes do not match it.

## 6. Project path vs numeric id

- **[doc]** Every `/projects/:id/...` endpoint takes the numeric id or the **URL-encoded** full path: `group%2Fsubgroup%2Fproject` (`/` → `%2F`). Unencoded paths do not match a route and return **404**; proxies must not decode `%2F` ([REST basics](https://docs.gitlab.com/api/rest/), [issue links](https://docs.gitlab.com/api/issue_links/)). Branch names with `/` in path params are encoded the same way. A project's path is not necessarily its name.
- **[doc]** Issues and MRs are addressed by `iid` (per-project number shown as `#N` / `!N`) in project routes; `id` is global. GraphQL uses `fullPath` strings and `gid://gitlab/...` global IDs.
- **vs GitHub:** toddler builds `repos/${repository}/...` with a raw `owner/name`. On GitLab the repository string must be `encodeURIComponent`-ed (it encodes `/` as `%2F`) before being placed after `projects/`, or toddler should resolve and store the numeric id. `glab api` `:fullpath`/`:id` placeholders avoid this only when cwd is the repo.

---

## Open / undocumented

- Free-tier read of pre-existing `blocks` links after a downgrade.
- Whether `glab api --paginate` (json output) merges pages into one array; use ndjson.
- Error code for creating a duplicate MR for the same source branch.
- Closing behaviour when the MR targets a non-default branch (implied: no close).
- Scoped-label syntax on Free (presumably a plain label).
- GraphQL work item fields are still marked Experiment in the live schema (2026-11-14) despite production use.
