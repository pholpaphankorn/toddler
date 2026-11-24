---
title: Forge and tracker modules: keep, slim, or delegate
labels: [wayfinder:grilling, on-hold]
blocked_by: [60, 61]
parent: 7
status: open
---
## Question

Do toddler's tracker and forge modules ([forge.ts](../../../../src/forge.ts): files/GitHub/GitLab trackers, PR/MR creation, auto-merge, blocker reads) stay as code, shrink, or move to the agent using `gh`/`glab`? Note sandboxes hold no forge token by design and only the host pushes the approved SHA. Use [What Sandcastle already does that toddler duplicates](60-sandcastle-coverage.md) and the rule from [Rule for code, harness or cut](61-code-or-harness-rule.md).
