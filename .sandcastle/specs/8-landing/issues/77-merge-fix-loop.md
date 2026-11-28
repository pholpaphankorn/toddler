---
title: "The merge fix loop: triggers, rounds and what each agent sees"
labels: [wayfinder:grilling, adult]
blocked_by: [75, 76]
parent: 8
status: closed
assignee: claude
---
## Question

Settled: anything blocking a merge that an agent can fix (conflict with the base, failing CI, failing `verify` locally) goes back as implement → review on the same PR, counted by `maxMergeFixRounds` (default 10, own counter from 0); a required human review goes to phol at once; merge fix rounds reuse the implementation prompt with the host's conflict note or CI names + log tails appended as untrusted data, and the reviewer gets one line plus the merge commit ([Unattended runs from a queue](../../7-harness-boundary/issues/64-unattended-queue.md), [Role prompts, workflow rules and prompt assembly](../../7-harness-boundary/issues/73-prompts-rules.md)).

Decide: what exactly counts as one merge fix round (does the review loop inside it count against `maxReviewRounds` too, or only the outer counter); who makes the conflicting merge (the agent runs `git merge` in its sandbox, as `conflicted()` does today, or the host leaves a conflicted merge for it); what the reviewer reviews (the merge commit only, or the full diff again); how a CI failure is noticed while the run does other work (poll interval, which PRs are watched); and how `conflicted()` is retired.

## Answer

Settled with phol 2026-11-26.

- **One merge fix round = one trigger.** Landing reports something an agent can fix (a conflict with the base, failing CI, or `verify` failing after a host merge); the job leaves landing, takes a slot ahead of fresh issues, and runs implement → review until approved. `maxMergeFixRounds` (default 10) goes up by one per trigger. Review rejections inside the round count from 0 against `maxReviewRounds`, reset at the start of each merge fix round: `maxReviewRounds` means rejections per approval. Either cap makes the issue needs attention, the reason naming the cap.
- **The host starts the conflicting merge.** Before the implementer's stage, the host runs `git merge --no-commit <pinned base sha>` in the issue's worktree, so the agent finds the conflict markers and `MERGE_HEAD` already there and only resolves and commits. The SHA is the one landing pinned, so the agent can't merge the wrong base or rebase. On resume, a worktree still holding `MERGE_HEAD` is kept as is. For CI or `verify` triggers there is no merge; the failing names + log tails (or `verify` output) are appended as untrusted data.
- **The reviewer reviews only the delta**: `reviewedSha..HEAD`, merges shown with `--remerge-diff` so only the conflict resolution shows, plus one line saying it is a merge fix round and its trigger. The full diff stays in the sandbox if wanted. On approval `reviewedSha` moves to the new head, so the host-commit chain restarts there ([The one landing path](76-landing-path.md)).
- **CI failures are noticed by polling.** Landing polls every open PR it holds (auto-merge PRs only; others never enter landing), one forge read per PR per poll, every **`landingPollSeconds`** (new config, default 60, below 10 refused at config load, ignored in local mode). Only finished, failed CI triggers a merge fix; pending CI waits.
- **Back into landing at the tail.** A job approved after a merge fix rejoins the landing queue at the back, like any newly approved job. PRs are polled concurrently; only the host merge + push step is one at a time.
- **`conflicted()` is deleted whole**: both call sites (before review, before publish), the `conflictBase` prompt text, and its use of `maxReviewRounds`. The per-issue loop has no conflict check; base conflicts show up only at the head of the landing queue. Accepted cost: a drifting branch is reviewed once before its conflict surfaces, and that merge fix review is only the delta.

Passed on: how much of a CI log or `verify` output to hand over, and scrubbing it, stays fog ("CI log tails as agent input"). Whether a needs-attention job's counters reset on the next run, and the `conflictBase` field's removal, go to [Job states, state.json fields and the run summary](79-job-states.md).
