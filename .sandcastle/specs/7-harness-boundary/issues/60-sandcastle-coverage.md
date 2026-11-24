---
title: What Sandcastle already does that toddler duplicates
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude (research subagent)
---
## Question

For `@ai-hero/sandcastle` 0.14.0 (pinned) and its latest release: which of toddler's features it already provides or plans (sandbox, worktrees, agent providers, parallel runs, issue sources, PR creation, review loops, orchestration). Start from [sandcastle-forge-support.md](../../../../docs/research/sandcastle-forge-support.md). Cite source and docs.

## Answer

Full findings: `docs/research/sandcastle-coverage.md` on local branch `research/sandcastle-coverage` (sources: installed 0.14.0 `dist/`, upstream `release/v1` source and docs, npm).

- **0.14.0 (latest stable) duplicates nothing above `createSandbox` / `sandbox.run`.** It provides the Seatbelt sandbox, worktrees (`createSandbox({branch, baseBranch})`, already used by toddler) and `claudeCode()` / `codex()` agent providers. Parallel runs exist only as `Promise.allSettled` in a template. No issue sources, PR creation, review loop, orchestration or quota handling.
- **1.0 pre-release (`v1-next`, branch `release/v1`) overlaps much more**, but differs from toddler's guarantees: `implementSpec` orchestrates a whole spec (`maxConcurrent` 3, JSON state, detach/reattach) into one integration branch and one PR; the agent runs `gh pr create` **inside** the sandbox with a GitHub token; `review` returns `ReviewResult {verdict, comments}` but only one fix round; GitHub only; v1 rejects custom agent providers (would break toddler's `privateHomeAgent`).
- **Quota: not provided in either line**, by upstream design (ADR 0005: raw token counts, no percentages). Nothing replaces `src/quota.ts`.
- **Host-side verify: not provided**; v1 lets the agent run checks.
- Recommendation from the research: stay on 0.14.0; track v1 but don't plan around it while pre-release; reusable ideas later: `ReviewResult`, `feedback` input, `Chooser`, detach/reattach.
