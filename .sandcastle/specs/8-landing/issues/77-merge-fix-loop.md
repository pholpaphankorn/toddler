---
title: "The merge fix loop: triggers, rounds and what each agent sees"
labels: [wayfinder:grilling, on-hold]
blocked_by: [75, 76]
parent: 8
status: open
---
## Question

Settled: anything blocking a merge that an agent can fix (conflict with the base, failing CI, failing `verify` locally) goes back as implement → review on the same PR, counted by `maxMergeFixRounds` (default 10, own counter from 0); a required human review goes to phol at once; merge fix rounds reuse the implementation prompt with the host's conflict note or CI names + log tails appended as untrusted data, and the reviewer gets one line plus the merge commit ([Unattended runs from a queue](../../7-harness-boundary/issues/64-unattended-queue.md), [Role prompts, workflow rules and prompt assembly](../../7-harness-boundary/issues/73-prompts-rules.md)).

Decide: what exactly counts as one merge fix round (does the review loop inside it count against `maxReviewRounds` too, or only the outer counter); who makes the conflicting merge (the agent runs `git merge` in its sandbox, as `conflicted()` does today, or the host leaves a conflicted merge for it); what the reviewer reviews (the merge commit only, or the full diff again); how a CI failure is noticed while the run does other work (poll interval, which PRs are watched); and how `conflicted()` is retired.
