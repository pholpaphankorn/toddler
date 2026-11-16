---
title: Trackers
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files with `parent: 3`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec for two settings: the **tracker** (where a project's specs and issues live: local files, GitHub or GitLab) and the **forge** (where code is pushed and pull/merge requests open: GitHub, GitLab or none), with GitLab at parity with GitHub (issues, labels, blocking, push, merge requests, self-hosted instances) and specs on every tracker. The spec is ready to break into toddler issues.

## Notes

- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today (2026-11-14): `issues: "github" | "local"` and `openPr` in `src/config.ts`; `offline()` = `local` + `openPr: false`. GitHub is reached through the host `gh` login (`src/runner.ts`, `src/main.ts`), issues are picked by `issueLabel`, and blocking uses GitHub's native dependencies API (`issues/<n>/dependencies/blocked_by`). Local issues are `.sandcastle/specs/<n>-<slug>/issues/*.md` with `blocked_by` frontmatter (`src/policy.ts`). GitHub has no spec concept today.
- **Reuse sandcastle** wherever it covers the need; build only what it lacks (standing rule). For trackers and forges it covers nothing (see Decisions so far).
- **Tracker and forge are separate concepts, one host setting** (see **Tracker** and **Forge** in the glossary). Config has `forge: "github" | "gitlab" | "none"` and `issues: "files" | "forge"`; a remote tracker is always the forge, so cross-host pairs can't be written. `none` means nothing is pushed (today's offline); any other forge always opens a PR/MR. Merging only happens with `autoMerge: true` (see [Publishing to a GitLab forge](issues/48-gitlab-merge-requests.md)). Shape in [Tracker and forge config shape](issues/44-tracker-forge-config.md).
- **Old keys are rejected**: `openPr`, and the old `issues` values `"github"`/`"local"`, fail at load with an "obsolete setting" error pointing to the new shape (the `reservePercent` / spec 2 pattern). No compatibility shims.
- **Forge auth is the host CLI login** (`gh`, `glab`), as GitHub works today (sandcastle has no forge client). It is not a **Provider login** ([spec 6](../6-provider-logins/spec.md)).
- **Specs on remote trackers are in scope**: this spec decides where a spec lives on each tracker; how the PM role uses specs stays in [spec 5](../5-pm-role/spec.md).
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs). Research findings live on local `research/<name>` branches (no git remote), pointed to from the ticket's answer.
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Tracker**, **Forge**, **Provider**, **Role**).
- Spec 2's implementation issues (38–40) touch `src/config.ts`; implementation issues from this spec are `blocked_by` them where they overlap.

## Decisions so far

- [What sandcastle offers for trackers and forges](issues/41-sandcastle-forge-support.md): nothing to reuse: no tracker, push or PR/MR API (only `init` scaffold prompts); toddler owns both seams, forge calls stay on the host via `gh`/`glab`.
- [GitHub facts for specs on a GitHub tracker](issues/43-github-spec-facts.md): sub-issues (GA, 100/parent, 8 levels) are the native spec holder; `gh` flags need ≥ 2.94.0 (2.88.1 here); one GraphQL call reads a spec's sub-issues + blockers.
- [GitLab facts for tracker and forge parity](issues/42-gitlab-facts.md): blocking links and epics are Premium+, Free has no issue-to-issue parent/child; labels, MRs and `glab api` all work on Free; host comes from `GITLAB_HOST` or the git remote; project paths must be URL-encoded.
- [Tracker and forge config shape](issues/44-tracker-forge-config.md): `forge` (default `"github"`, or `"gitlab"`/`"none"`) + one `repository` + `issues: "files" | "forge"`; no `tracker` key and no PR switch (a forge always opens a PR/MR); host left to `gh`/`glab`; old `issues` values and `openPr` rejected as obsolete.
- [Where specs live on each tracker](issues/45-specs-per-tracker.md): a spec only groups issues, never gates picking; files unchanged, GitHub = parent issue + direct sub-issues, GitLab = plain issue pointed to by a `Spec: #<iid>` body line in each child (works on Free); exposes id, title, body, issues.
- [Blocking and labels on a GitLab tracker](issues/46-gitlab-blocking-labels.md): blocked while an open blocker comes from a native `is_blocked_by` link (Premium) or a `Blocked by: #<iid>` body line (any tier); an unresolvable body line blocks and is logged; labels unchanged, scoped labels matched whole; GitHub stays native-only.
- [Tracker and forge interface](issues/47-tracker-forge-interface.md): one `Forge` per host (github/gitlab/none) owning a `Tracker` side and a request side; `issues: "files"` swaps in the files tracker; tracker is read-only (`issues`, `blocked`, `comments`, `spec`), forge has `base`, `findRequest`, `openRequest`; normalised `Issue`; adapters tested with fake `gh`/`glab`, runner with in-memory fakes.
- [Publishing to a GitLab forge](issues/48-gitlab-merge-requests.md): same request rules and body text on both forges (open or merged request blocks re-picking); new `autoMerge` (default off) turns on native auto-merge on GitHub/GitLab and fast-forwards the local branch on none; files `blocked` also counts `done` jobs; tracker stays read-only until PM role.

## Not yet specified

- `toddler init` and `toddler doctor` per tracker/forge: checks for `gh`/`glab` login and repository access, whether the repo allows auto-merge when `autoMerge` is on, and what `init` writes.

## Out of scope

- Trackers other than local, GitHub and GitLab (e.g. Jira, Linear).
- Cross-host pairs (e.g. GitHub issues with GitLab merge requests): closing across hosts would be toddler's job and no one needs it (settled while charting, 2026-11-14).
- How the PM role reads or writes specs: belongs to [PM role](../5-pm-role/spec.md).
