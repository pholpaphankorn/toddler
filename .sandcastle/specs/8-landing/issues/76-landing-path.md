---
title: "The one landing path: host merge, verify, exact push"
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 8
status: closed
assignee: claude
---
## Question

[What may leave the sandbox, and who pushes it](../../7-harness-boundary/issues/68-what-leaves-the-sandbox.md) settled: when the base moved, the host merges it into the reviewed branch (never rebases); a clean merge that passes `verify` lands without re-review; same rule locally and on forges.

Decide the mechanics:
- When the host checks whether the base moved (before opening the PR, when the forge reports "behind", right before the local fast-forward) and against which ref.
- Where the post-merge `verify` runs: `verify` runs project code and today only runs inside a stage sandbox (`sandbox.exec`), so does the host spin up a sandbox with no agent for it?
- The merge commit itself (author, message) and the widened publish check: reviewed SHA is an ancestor of the pushed commit and the only commit on top is the host's own conflict-free merge. How is "conflict-free, host-made" proven at push time?
- The local path end to end: merge, `verify`, fast-forward, the files-tracker `status: closed` commit; and what a failed fast-forward becomes (today it ends in `done`: a bug).

## Answer

Settled with phol 2026-11-26.

- **When the base is checked.** When a job reaches the head of the landing queue, the host fetches and merges the base into the branch if the base is not already its ancestor: before the PR opens, or before the local fast-forward. After the PR is open, it merges again only when a poll reports behind (`BEHIND`, `need_rebase`) or a conflict. It never merges on every poll: that adds commits for nothing, and on GitLab each push cancels auto-merge. Ref: `<remote>/<base>` after a fetch on a forge, `refs/heads/<base>` locally.
- **Where the post-merge `verify` runs.** The host merges in a throwaway host worktree, then runs `config.verify` in a sandbox with **no agent** (same `Sandbox`, `exec`, `close`; no provider). The command is trusted, but what it runs (scripts, tests) is agent-written repo code, so it never runs on the host next to phol's forge login and keys. The sandbox also matches the environment the stage's `verify` passed in. No formatter on host merges: its changes would be unreviewed code. A conflicting merge, or one that fails `verify`, goes to the merge fix loop.
- **Host commits and the publish proof.** The host may add two kinds of commit, and both are proven by **recomputing the tree and comparing**, never by trusting trailers or authors. Walking first-parent from the commit about to be pushed (or fast-forwarded) down to `reviewedSha`, the chain must be:
  1. at most one **close commit** directly on `reviewedSha`: the host takes that issue file as it is in `reviewedSha`, sets `status: closed` itself, builds the expected tree, and the commit's tree must match exactly;
  2. then zero or more **host merges**: exactly two parents, the second an ancestor of the base, tree identical to `git merge-tree --write-tree <p1> <p2>` (clean, nothing hand-edited). Chains are allowed (the base moved twice).

  Anything else on the chain refuses the publish. Author is the host's git identity; message `Merge <base> into toddler/issue-N` or `Close local issue N`. A merge fix round sets `reviewedSha` to the new reviewed head, so the chain restarts there.
- **The files-tracker close commit.** Added by the host right after approval, only when that issue's file in `reviewedSha` is not already `closed`. After a merge fix round the new `reviewedSha` already contains it (the implementer built on it), so it isn't added twice; if an agent reverted it, the host adds it again. It lands in the same range as the work, so a files-tracked issue on a forge closes when its PR merges, like `Closes #N`. Forge-tracked issues get none.
- **Local path end to end.** Close commit if needed → merge base into the branch in a host worktree if needed → `verify` in the agentless sandbox → compare-and-swap `update-ref` of the base (plus `merge --ff-only` when the base is checked out and clean) → job is **landed**, and only then do its dependents become ready.
  - The compare-and-swap loses because the base moved meanwhile: go back to the merge step. No cap; each retry means other work landed.
  - The base is checked out in phol's worktree **with uncommitted changes**: needs attention ("base checked out with uncommitted changes"), instead of moving the ref under the dirty checkout as today.
  - Any other git error: needs attention with the error. Never `done`.
  - Local runs without `autoMerge` stop at approved and do not unblock dependents (today they reach `done` without landing: the bug noted on the map).
- **The forge refuses the push or the merge commit** (protected head branch, base requires linear history, a GitLab rebase-only project that won't take a merge commit): needs attention with the forge's reason, never a rebase. After a successful push to a GitLab MR the host re-enables auto-merge. How a cancelled auto-merge is noticed belongs to [The Forge seam's new methods and their local-mode equivalents](78-forge-seam.md).
