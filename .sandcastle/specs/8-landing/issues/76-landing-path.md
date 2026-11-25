---
title: "The one landing path: host merge, verify, exact push"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: open
---
## Question

[What may leave the sandbox, and who pushes it](../../7-harness-boundary/issues/68-what-leaves-the-sandbox.md) settled: when the base moved, the host merges it into the reviewed branch (never rebases); a clean merge that passes `verify` lands without re-review; same rule locally and on forges.

Decide the mechanics:
- When the host checks whether the base moved (before opening the PR, when the forge reports "behind", right before the local fast-forward) and against which ref.
- Where the post-merge `verify` runs: `verify` runs project code and today only runs inside a stage sandbox (`sandbox.exec`), so does the host spin up a sandbox with no agent for it?
- The merge commit itself (author, message) and the widened publish check: reviewed SHA is an ancestor of the pushed commit and the only commit on top is the host's own conflict-free merge. How is "conflict-free, host-made" proven at push time?
- The local path end to end: merge, `verify`, fast-forward, the files-tracker `status: closed` commit; and what a failed fast-forward becomes (today it ends in `done`: a bug).
