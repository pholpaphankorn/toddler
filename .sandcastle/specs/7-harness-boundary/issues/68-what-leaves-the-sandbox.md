---
title: "What may leave the sandbox, and who pushes it"
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Today only work that passed host-config `verify` and an approving review leaves, and only the host pushes the exact reviewed SHA. Should that stay, loosen (agent pushes with a forge token, agent runs its own checks, PR opened from inside like Sandcastle 1.0), or go? Inventory rows 20, 22, 24, 27, 28; [What Sandcastle already does that toddler duplicates](60-sandcastle-coverage.md).

From [Unattended runs from a queue](64-unattended-queue.md): a local landing after the base moved is the reviewed commit plus a clean base merge that passed `verify` without re-review, not the exact reviewed SHA. Decide whether that is allowed. The merge fix loop has the host fetch CI logs because sandboxes hold no forge token; revisit if they get one.

## Answer

Settled with phol 2026-11-25. **What leaves the sandbox stays guarded by code, and only the host pushes.**

- **Gate**: work leaves only after the host-config `verify` passed **and** a review approved it. Checks an agent runs on its own while working never gate anything; `verify` comes from host config, which the agent cannot edit. Rule 1 of [ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md): a guard stays code.
- **Host only**: sandboxes never hold a forge token. Only the host pushes, opens the PR/MR and enables auto-merge, and only to the configured push remote (`validatePushRemote` stays, row 8). The host keeps fetching failing CI names and log tails for the merge fix loop and hands them to the agent as text. Not Sandcastle 1.0's in-sandbox `gh pr create`.
- **Base moved: merge, never rebase.** The host merges the base into the reviewed branch, so the reviewed SHA stays a parent of what lands and nothing is force-pushed. New check for the reshape: the reviewed SHA is an ancestor of the pushed commit, and the only commit on top is the host's own conflict-free merge.
  - **Clean merge and `verify` passes**: lands without re-review; the host's merge adds no agent-written code.
  - **Conflict or `verify` fails**: goes to the merge fix loop from [Unattended runs from a queue](64-unattended-queue.md) (implement → review, counted against `maxMergeFixRounds`). Anything an agent writes is reviewed.
- **Same rule locally and on forges.** This replaces "on a forge nothing is done": when the forge's branch protection requires an up-to-date branch, the host does the same merge, runs `verify` and pushes to the PR branch; conflicts go to the merge fix loop. One landing path.
- Inventory rows 20, 22, 24 stay as code, with the publish refusal widened from "branch unchanged since review" to "reviewed SHA plus at most a clean host merge"; rows 27, 28 keep host-only push (the rest of the forge modules: [Forge and tracker modules](63-forge-tracker-modules.md)).

Passed on: the forge must let the host merge the base into a PR branch and push it, and detect a "branch must be up to date" block; that goes to [Forge and tracker modules](63-forge-tracker-modules.md).
