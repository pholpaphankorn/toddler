---
title: Forge and tracker modules: keep, slim, or delegate
labels: [wayfinder:grilling, on-hold]
blocked_by: [60, 61, 68]
parent: 7
status: closed
assignee: claude
---
## Question

Do toddler's tracker and forge modules ([forge.ts](../../../../src/forge.ts): files/GitHub/GitLab trackers, PR/MR creation, auto-merge, blocker reads) stay as code, shrink, or move to the agent using `gh`/`glab`? Today sandboxes hold no forge token and only the host pushes the approved SHA; whether that stays is decided in [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md). Use [What Sandcastle already does that toddler duplicates](60-sandcastle-coverage.md) and the rule from [Rule for code, harness or cut](61-code-or-harness-rule.md).

From [Unattended runs from a queue](64-unattended-queue.md): the forge must now read PR mergeability and CI status (with failing log tails) for the merge fix loop, and toddler runs its own one-at-a-time merge queue on forges.

From [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md): stays host-only push, no forge token in sandboxes. The host must also merge the base into a PR branch and push it when the forge requires an up-to-date branch, so the forge module detects that block.

## Answer

Settled with phol 2026-11-25. **The tracker and forge modules stay as code. Nothing goes to the agent, nothing is cut, and the forge grows the features landing needs.**

- **Writes** (push, open PR/MR, enable auto-merge, merge the base into a PR branch, fetch CI logs) stay host code. Already settled in [What may leave the sandbox, and who pushes it](68-what-leaves-the-sandbox.md): no forge token in sandboxes, so no agent `gh`/`glab`. Sandcastle 1.0's in-sandbox PR flow is not adopted ([What Sandcastle already does that toddler duplicates](60-sandcastle-coverage.md)).
- **Tracker reads stay code** (open issues, blockers, comments, specs). They feed scheduling, which is never delegated, and they are deterministic (rule 4 of [ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md)).
- **All trackers and forges stay** (rule 2: phol would miss them):
  - GitHub (row 27).
  - GitLab (row 28): phol will use it.
  - Files tracker (row 26) and `NoneForge` local mode (row 29): phol's own maps run on files, and local landing is a first-class path.
- **Tracker and forge stay chosen separately**, so local issue files can still open GitHub or GitLab PRs.
- **New on the Forge seam, as host code, for every forge including GitLab:**
  1. Read mergeability, including a "branch must be up to date" block.
  2. Read CI status, plus failing check names and log tails.
  3. Push the host's clean base merge to the PR branch.
  4. Wait for an auto-merge to land, for the one-at-a-time landing queue.

  In local mode these are the host's merge, `verify` and the fast-forward. The agent sees CI failures only as text in its prompt. Nothing else is added (for example, no reading human review comments on the PR).
- Auto-merge (row 25) stays as code, now driven by toddler's own landing queue ([Unattended runs from a queue](64-unattended-queue.md)).

Passed on to the reshape spec: GitLab equivalents for the four new features (MR `detailed_merge_status`, pipeline jobs and their logs, merge-when-pipeline-succeeds) need researching there. GitLab native blockers need Premium, so body blockers stay as the fallback. Forge `doctorChecks` are classified with `doctor`/`setup`/`smoke`, which is still in this map's Not yet specified.
