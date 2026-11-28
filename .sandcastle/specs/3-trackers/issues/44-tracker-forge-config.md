---
title: Tracker and forge config shape
labels: [wayfinder:grilling, adult]
blocked_by: [41, 42]
parent: 3
status: closed
assignee: phol (with claude)
---
## Question

What do the tracker and forge settings look like in `.sandcastle/config.json`, replacing `issues` and `openPr` (rejected as obsolete, settled on the map)? Sub-questions:

- Key names and values: e.g. `tracker: "local" | "github" | "gitlab"` and `forge: "github" | "gitlab" | "none"`, and their defaults (today: GitHub issues, PRs on).
- Where the repository/project lives: today's `repository: "owner/name"`; GitLab needs `group/subgroup/project` and, self-hosted, a host. One field per setting, or shared by tracker and forge (they must be the same host anyway)?
- How a self-hosted GitLab host is chosen: config field, `glab`'s own default, or derived from the git remote (see [GitLab facts for tracker and forge parity](42-gitlab-facts.md)).
- Validation at load: disallowed pairs (`github` tracker + `gitlab` forge), missing repository, error messages naming their path.
- Anything [What sandcastle offers for trackers and forges](41-sandcastle-forge-support.md) already defines that the shape should mirror.

## Answer

Grilled with phol, 2026-11-16. The separate `tracker` key was dropped: a remote tracker is always the forge itself, so a second host setting only duplicated `forge` and needed a cross-host rule.

```json
"forge": "github" | "gitlab" | "none",   // default "github"
"repository": "owner/name",              // the forge's project
"issues": "files" | "forge"              // default "forge" when there is a forge, else "files"
```

- **`forge`** defaults to `"github"`, so `{"repository": "owner/name"}` alone keeps today's behaviour (GitHub issues, GitHub PRs). `"none"` replaces today's offline mode: nothing is pushed, work merges locally.
- **A forge always gets a PR/MR.** There is no `pullRequests`/`openPr` switch: remote issues with local merging is dropped.
- **`issues`**: `"files"` (renamed from `"local"`) reads `.sandcastle/specs/` files; `"forge"` reads the forge's issues. Cross-host pairs (GitHub issues + GitLab MRs) can't be written.
- **`repository`** is one field, the path as the host shows it. Required with a forge; rejected with `forge: "none"` ("only used with a forge"), where toddler keeps an internal placeholder to key `.sandcastle/state.json`. Format checked at load: `github` → `owner/name`; `gitlab` → `group/…/project` (two or more parts), URL-encoded by toddler.
- **Host**: no config field. `gh`/`glab` resolve it (`GH_HOST` / `GITLAB_HOST`, then the git remote); docs mention the env vars.
- **Validation at load**, each error naming the config path: `issues: "forge"` with `forge: "none"`; missing or malformed `repository`; `repository` with `forge: "none"`. `openPr`, and the old `issues` values `"github"`/`"local"`, fail with an "obsolete setting" error saying what to write instead (e.g. `issues: "local"` → `"files"` and set `forge`).
- Sandcastle defines nothing to mirror (see [What sandcastle offers for trackers and forges](41-sandcastle-forge-support.md)).
