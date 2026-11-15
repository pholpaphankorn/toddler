---
title: What sandcastle offers for trackers and forges
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 3
status: closed
assignee: claude (research subagent)
---
## Question

What does `@ai-hero/sandcastle` 0.14.0 (installed in `node_modules/@ai-hero/sandcastle`; also its upstream repo, docs and changelog, noting anything newer than 0.14.0) already provide that toddler could reuse for:

- Reading issues: from GitHub, GitLab, local files, or any pluggable issue source; filtering by label; blocking/dependencies; parent/child grouping.
- Pushing branches and opening, finding, and merging pull or merge requests, on GitHub and GitLab (self-hosted too).
- Forge auth: does it shell out to `gh`/`glab`, call REST/GraphQL with a token, or leave it to the caller?
- Its extension points: interfaces toddler could implement for a missing tracker or forge.

For each, say what toddler uses today instead (`src/runner.ts`, `src/main.ts`, `src/policy.ts`) and whether swapping is plausible. Mark undocumented behaviour.

## Answer

Full findings: `docs/research/sandcastle-forge-support.md` (sources: `node_modules/@ai-hero/sandcastle` 0.14.0 `dist`, upstream repo docs, issues and changelog; npm `latest` is still 0.14.0; `v1-next` not inspected).

- **Nothing to reuse.** Sandcastle 0.14.0 has no tracker interface, issue type, push, or PR/MR call in its runtime API. Upstream docs say it "does not embed any issue tracker itself".
- **Issue sources exist only as `sandcastle init` scaffold text** (`ISSUE_TRACKER_REGISTRY`: `github-issues` via `gh issue …`, `beads`, `custom`), run by the agent, not by the library. There is no GitLab or local-files tracker; upstream closed GitLab/Jira requests as "use custom". Labels are one fixed `Sandcastle` label.
- **Blocking and parents are not modelled**: prompts tell the agent to skip blocked issues, and the parallel planner has an LLM infer dependencies. GitHub `dependencies/blocked_by` is never read.
- **No push or PRs**: merging is a local `git merge`. The maintainer called push out of scope (upstream #607).
- **Auth is left to the caller**: the scaffold puts `GH_TOKEN` into the sandbox for the agent. Native sandboxes hide the host's `gh` login. There is no REST/GraphQL client.
- **No tracker or forge seams** among the exported extension points (`SandboxProvider`, `AgentProvider`, hooks, prompt args).
- **So toddler owns both seams**, and forge calls stay on the host through the user's `gh`/`glab` login (as today: `publish()` runs `gh pr list`, `git push`, `gh pr create`; `GH_TOKEN`/`GITHUB_TOKEN` are blanked in the sandbox env). Toddler never merges PRs today.
- Side finding: `localIssue()` (`src/policy.ts`) ignores the `parent:` frontmatter the ticket files carry.
