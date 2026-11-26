# What can hold a spec on a GitHub tracker

Research for [ticket 43](../../.sandcastle/specs/3-trackers/issues/43-github-spec-facts.md) (spec 3, trackers). Researched 2026-11-14.

Question: on GitHub, what can hold a **spec** (a document grouping a set of issues): sub-issues, issue types / issue fields, milestones, labels? What are the APIs, and can a spec's sub-issues plus their `dependencies/blocked_by` (already read by [src/runner.ts](../../src/runner.ts) ~L228) be read in one call, at what rate-limit cost for ~100 issues?

Method: docs.github.com (REST, GraphQL, Issues guides), the GitHub changelog, the `gh` manual, and the locally installed `gh` 2.88.1. No live API call was made (this repo has no remote).

Legend: **[doc]** docs.github.com or cli.github.com, **[changelog]** github.blog/changelog, **[local]** observed on this machine, **[undocumented]** not stated by any primary source read; inferred, may change.

---

## Sub-issues (best fit: the spec is the parent issue)

- **Availability.** **[changelog]** Public preview 2025-01-13 ("release sub-issues, issue types and advanced search for issues to everyone"), GA 2025-04-09 ([Evolving GitHub Issues and Projects](https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/)). **[undocumented]** No source read states a plan, repo-visibility or org-vs-personal restriction for sub-issues; neither the GA post, the [sub-issue guide](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues) nor the [REST page](https://docs.github.com/en/rest/issues/sub-issues) mentions one. Treat as "all github.com repos" but unconfirmed.
- **Limits.** **[doc]** "You can add up to 100 sub-issues per parent issue and create up to eight levels of nested sub-issues" ([adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)). An issue has at most one parent (REST `parent` returns one issue; adding to a new parent needs `replace_parent`). Sub-issues may come from other repos; **[doc]** REST POST requires the sub-issue to "belong to the same repository owner" as the parent.
- **REST.** **[doc]** ([sub-issues](https://docs.github.com/en/rest/issues/sub-issues)), all under `/repos/{owner}/{repo}/issues/{n}`:
  - `GET .../sub_issues` list a parent's sub-issues, `per_page` max 100 (so one page covers the 100-sub-issue cap), ordered by the parent's priority order (reorder with `PATCH .../sub_issues/priority`).
  - `GET .../parent` get an issue's parent. The issue object also carries `parent_issue_url` and `sub_issues_summary {total, completed, percent_completed}` ([issues](https://docs.github.com/en/rest/issues/issues#get-an-issue)).
  - `POST .../sub_issues` (`sub_issue_id` = the issue's numeric **id**, not number; optional `replace_parent`), `DELETE .../sub_issue`.
- **GraphQL.** **[doc]** ([Issue object](https://docs.github.com/en/graphql/reference/issues)): `Issue.subIssues(first/after…): IssueConnection!`, `Issue.parent: Issue`, `Issue.subIssuesSummary`; mutation `addSubIssue(issueId, subIssueId | subIssueUrl, replaceParent)`. No preview header or deprecation note on these fields.
- **gh.** **[changelog]** `gh` **v2.94.0 (2026-06-10)** added `--parent` (create), `--set-parent`, `--remove-parent`, and `parent`/`subIssues`/`subIssuesSummary` JSON fields on `gh issue view|list` ([changelog](https://github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli/), [gh issue view](https://cli.github.com/manual/gh_issue_view)). **[local]** The installed `gh` 2.88.1 (2026-03-12) has none of these JSON fields; infant must use `gh api` (REST or `gh api graphql`) or require gh >= 2.94.0. **[undocumented]** The manual does not say how many sub-issues the `subIssues` JSON field returns or whether it paginates.
- **Legacy "tracked issues".** **[doc]** `Issue.trackedIssues` / `trackedInIssues` (task-list tracking) still exist in GraphQL; not deprecated in the reference, but they are the pre-sub-issues mechanism. Not recommended for new work **[undocumented]**.

## Issue dependencies (already used by infant)

- **[changelog]** GA 2025-08-21 ([Dependencies on issues](https://github.blog/changelog/2025-08-21-dependencies-on-issues/)): available on Free, Pro, Team and Enterprise Cloud; creating needs triage permission; search qualifiers `is:blocked`, `is:blocking`, `blocked-by:`, `blocking:`; "fully supported in the API and webhooks".
- **REST [doc]** ([issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies)): `GET|POST .../dependencies/blocked_by`, `DELETE .../dependencies/blocked_by/{issue_id}`, `GET .../dependencies/blocking`; `per_page` max 100. Issue object carries `issue_dependencies_summary {blocked_by, blocking, total_blocked_by, total_blocking}` (blocked_by = open blockers count **[undocumented]** semantics of open vs total inferred from names).
- **GraphQL [doc]**: `Issue.blockedBy` / `Issue.blocking` (connections, `orderBy` default `DEPENDENCY_ADDED_AT DESC`), `Issue.issueDependenciesSummary`; mutation `addBlockedBy`.
- **[undocumented]** A search result (not fetched) cites a 2026-08-20 changelog note that `blocked_by`/`blocking`/`relates_to` REST endpoints now filter results by the token's granted scope: a fine-grained token without access to a blocker's repo may silently not see that blocker. Verify before relying on cross-repo blockers.
- **[undocumented]** No primary source read states a max number of blockers per issue.

## Issue types and issue fields (metadata, not grouping)

- **Issue types.** **[changelog]** GA 2025-04-09, organization-level; REST support 2025-03-18 ([changelog](https://github.blog/changelog/2025-03-18-github-issues-projects-rest-api-support-for-issue-types/)). Extended to **personal-account repos on 2026-11-11** ([Issue types and fields are available for personal accounts](https://github.blog/changelog/2026-11-11-issue-types-and-fields-are-available-for-personal-accounts/); details here come from search-result excerpts of that post: defaults Bug/Task/Feature, up to 25 types, configured under account Settings > Planning). API **[doc]**: REST issue object `type`; `GET /repos/{o}/{r}/issues?type=<name>|*|none`; GraphQL `Issue.issueType`, `createIssueType`, `CreateIssueInput.issueTypeId`; user-level REST at [/rest/users/issue-types](https://docs.github.com/en/rest/users/issue-types). gh 2.94.0: `--type` on create/edit and list filter.
- **Issue fields.** **[changelog]** Private preview Nov 2025, public preview 2026-03-12 (select orgs) and 2026-05-21 (all orgs), **GA 2026-07-02** for orgs on Free, Team, Enterprise and GHE.com ([GA post](https://github.blog/changelog/2026-07-02-issue-fields-are-now-generally-available)); personal accounts 2026-11-11 (same post as above). Types: text, number, date, single-select, multi-select; up to 25 fields; defaults Priority, Effort, Start date, Target date. API **[doc]**: REST issue object `issue_field_values`; GraphQL `Issue.issueFieldValues`, `createIssueField`, `createIssueFieldValue`, `deleteIssueFieldValue`.
- **Fit for specs:** a type (e.g. "Spec") could _mark_ the parent issue, and a field could tag children with a spec name, but neither groups issues by itself. **[undocumented]** No source read says types or fields are available on GHES; personal-account support is two days old at research time.

## Milestones and labels (weaker alternatives)

- **Milestones** **[doc]** ([REST milestones](https://docs.github.com/en/rest/issues/milestones)): repo-scoped, one milestone per issue, carry title/description/due date and open/closed counts; filter with `GET .../issues?milestone=<number>` or search `milestone:"name"` ([search docs](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)). A milestone's `description` could hold a short spec, but it is single-repo, has no ordering, and is usually used for releases.
- **Labels** **[doc]**: repo-scoped, many per issue, `GET .../issues?labels=spec-3`, search `label:"spec-3"`. No body to hold the spec text and no parent object; any grouping is by convention only. Infant already uses labels for work selection, so a spec label would mix two concerns.

## Reading a spec's sub-issues and their blockers in one call

- **REST: no.** **[doc]** Needs 1 `GET .../sub_issues?per_page=100` + 1 `GET .../dependencies/blocked_by` per sub-issue = **101 requests for 100 sub-issues** (or 1 + only those whose `issue_dependencies_summary.blocked_by > 0` **[undocumented]** optimization relying on the summary being in the sub-issues list items). Budget: 5,000 req/h per user; `GITHUB_TOKEN` in Actions 1,000 req/h per repo; secondary limit 900 points/min, GETs cost 1 ([REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
- **GraphQL: yes, one query.** **[doc]** Both are `Issue` connections, so they nest:

  ```graphql
  query ($owner: String!, $repo: String!, $n: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $n) {
        subIssues(first: 100) {
          nodes {
            number
            state
            title
            blockedBy(first: 100) {
              nodes {
                number
                state
                repository {
                  nameWithOwner
                }
              }
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
    }
  }
  ```

  Run as `gh api graphql -F owner=… -F repo=… -F n=…` (works on gh 2.88.1).

- **Cost.** **[doc]** formula ([GraphQL limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)): sum the requests per connection assuming each fills `first` (1 for `subIssues` + 100 for the nested `blockedBy`) = 101, divide by 100, round: **~1 point** of 5,000/h. Node ceiling: 100 + 100x100 = 10,100 nodes, well under 500,000. Secondary limit: 2,000 points/min, a non-mutation query counts 1. **[undocumented]** Computed from the documented formula, not measured; the `rateLimit { cost }` field in the query reports the real cost. A blocker list over 100 needs a follow-up page (no documented cap on blockers).
- Sub-issues cap at 100 per parent, so one `subIssues(first: 100)` page always covers a whole spec level; nested levels (up to 8) need a deeper query or recursion.

## Answer in brief

Sub-issues are the native "spec holds issues" structure (parent issue = spec, its body = spec text): GA since 2025-04-09, 100 per parent, 8 levels, one parent per issue, REST + GraphQL, `gh` flags/JSON only from v2.94.0. Issue types/fields are metadata (orgs since 2025/2026, personal accounts since 2026-11-11), milestones/labels group but cannot hold structure. One GraphQL query reads a spec's sub-issues and each one's `blockedBy` for ~1 point; REST needs ~101 calls.
