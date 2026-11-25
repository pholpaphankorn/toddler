---
title: The run loop's shape and its idle states
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: open
---
## Question

Today `Runner.run` starts a batch, waits for every issue in it (`Promise.allSettled`), then picks again; `work` runs one issue from implementation to publish. The reshape needs: issues start as soon as a slot frees; approved work waits in a one-at-a-time landing queue; the run waits on a pending auto-merge when an open issue depends on it; and (spec 9) the run sleeps until the next quota reset when every provider is stopped ([Unattended runs from a queue](../../7-harness-boundary/issues/64-unattended-queue.md)).

What is the loop's shape? Where does the landing watcher live: its own module beside the per-issue loop, or a stage of it (passed on by spec 7)? What states can the run be in (working, waiting on a merge, sleeping, done), what ends it, and which seams does spec 9 fill in? Use codebase-design.
