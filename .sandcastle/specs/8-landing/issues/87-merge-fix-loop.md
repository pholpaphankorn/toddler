---
title: Merge fix loop
labels: []
blocked_by: [85]
parent: 8
status: open
---
A conflict with the base or a failing post-merge `verify` goes back to the agents as a merge fix round instead of stopping, and the reviewer only reviews what changed.

1. **One trigger = one round**. Landing emits "needs a merge fix" with a trigger (`conflict` | `verify`; `ci-failed` arrives with #88). The job leaves landing, sets `mergeFix`, takes a slot **ahead of fresh issues**, and runs implement → review until approved. `mergeFixRounds` (cap `maxMergeFixRounds`, default 10, new config) goes up by one per trigger. `reviewRounds` resets to 0 at the start of each round. Either cap → needs attention `merge-fix-cap` / `review-cap`.
2. **Host starts the conflicting merge**: before the implementer's stage, `git merge --no-commit <mergeFix.base>` (the SHA landing pinned) in the issue's worktree, so the agent only resolves and commits. On resume a worktree still holding `MERGE_HEAD` is kept; without it, the merge is redone on `mergeFix.base`.
3. **Implementer prompt** reuses the implementation prompt with the host's conflict note, or the failing check names + tails / `verify` output, appended as untrusted data: per check a heading (name + link), then its tail in the dynamic-length fence from #82. The untrusted-data line in `prompts/rules.md` adds "CI logs and `verify` output".
4. **Reviewer sees only the delta**: `reviewedSha..HEAD`, merges shown with `--remerge-diff`, plus one line naming the round and its trigger. On approval `reviewedSha` moves to the new head and `mergeFix` clears.
5. **Back into landing at the tail**, like any newly approved job.
6. **`conflicted()` is deleted whole**: both call sites, the `conflictBase` prompt text, its use of `maxReviewRounds`, and the "Remove with spec 5" comment. The per-issue loop has no conflict check.

- [ ] Fake forge tests: `behind` → conflict → merge fix with `MERGE_HEAD` on the pinned SHA; `behind` → `verify` fails → merge fix with the output; both caps → needs attention; `maxReviewRounds` resets per merge fix round; a fixed job rejoins landing at the back; merge fixes take a slot ahead of fresh issues
- [ ] A test asserts the reviewer prompt holds the remerge-diff delta, not the full diff
- [ ] README documents `maxMergeFixRounds`

Decision records: [77](77-merge-fix-loop.md), [79](79-job-states.md), [81](81-ci-log-tails.md).
