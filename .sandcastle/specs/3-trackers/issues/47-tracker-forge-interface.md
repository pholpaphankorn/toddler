---
title: Tracker and forge interface
labels: [wayfinder:grilling, on-hold]
blocked_by: [41, 44, 45, 46]
parent: 3
status: open
---
## Question

What interface do `src/runner.ts` and `src/policy.ts` code against so files, GitHub and GitLab trackers, and GitHub, GitLab and none forges, plug in without per-host branches in the loop? Today the GitHub calls (`gh api` for labeled issues, dependencies, PR creation) and the local file reader sit directly in `runner.ts`.

- Tracker operations: list workable issues with labels and blockers, read a spec and its issues, close or comment (if toddler does that today).
- Forge operations: push a branch, open a PR/MR with closing reference, find an existing one for an issue, merge (or local merge for `none`).
- Toddler writes all of these: sandcastle offers none (see [What sandcastle offers for trackers and forges](41-sandcastle-forge-support.md)). Today local issues ignore `parent:`; the interface should say whether it starts reading it.
- Seams for tests: how the GitHub and GitLab implementations are tested without a network (today `gh` is injected as `command`).
