---
title: The Forge seam's new methods and their local-mode equivalents
labels: [wayfinder:grilling, on-hold]
blocked_by: [74, 76]
parent: 8
status: open
---
## Question

Given what the forges expose ([What GitHub and GitLab expose for mergeability, CI logs and auto-merge](74-forge-landing-apis.md)) and the landing path ([The one landing path: host merge, verify, exact push](76-landing-path.md)): what methods does `Forge` gain for mergeability, CI status + failing log tails, pushing the host's merge, and waiting on auto-merge? What do they return (a small union of "mergeable / behind / conflict / ci-failing / ci-pending / review-required / landed" or raw fields), and what does `NoneForge` do for each? GitLab gets parity, not a subset. Use codebase-design.
