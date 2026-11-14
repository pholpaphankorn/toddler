---
title: Tracker and forge config shape
labels: [wayfinder:grilling, on-hold]
blocked_by: [41, 42]
parent: 3
status: open
---
## Question

What do the tracker and forge settings look like in `.sandcastle/config.json`, replacing `issues` and `openPr` (rejected as obsolete, settled on the map)? Sub-questions:

- Key names and values: e.g. `tracker: "local" | "github" | "gitlab"` and `forge: "github" | "gitlab" | "none"`, and their defaults (today: GitHub issues, PRs on).
- Where the repository/project lives: today's `repository: "owner/name"`; GitLab needs `group/subgroup/project` and, self-hosted, a host. One field per setting, or shared by tracker and forge (they must be the same host anyway)?
- How a self-hosted GitLab host is chosen: config field, `glab`'s own default, or derived from the git remote (see [GitLab facts for tracker and forge parity](42-gitlab-facts.md)).
- Validation at load: disallowed pairs (`github` tracker + `gitlab` forge), missing repository, error messages naming their path.
- Anything [What sandcastle offers for trackers and forges](41-sandcastle-forge-support.md) already defines that the shape should mirror.
