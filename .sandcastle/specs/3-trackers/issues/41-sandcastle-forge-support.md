---
title: What sandcastle offers for trackers and forges
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 3
status: open
---
## Question

What does `@ai-hero/sandcastle` 0.14.0 (installed in `node_modules/@ai-hero/sandcastle`; also its upstream repo, docs and changelog, noting anything newer than 0.14.0) already provide that toddler could reuse for:

- Reading issues: from GitHub, GitLab, local files, or any pluggable issue source; filtering by label; blocking/dependencies; parent/child grouping.
- Pushing branches and opening, finding, and merging pull or merge requests, on GitHub and GitLab (self-hosted too).
- Forge auth: does it shell out to `gh`/`glab`, call REST/GraphQL with a token, or leave it to the caller?
- Its extension points: interfaces toddler could implement for a missing tracker or forge.

For each, say what toddler uses today instead (`src/runner.ts`, `src/main.ts`, `src/policy.ts`) and whether swapping is plausible. Mark undocumented behaviour.
