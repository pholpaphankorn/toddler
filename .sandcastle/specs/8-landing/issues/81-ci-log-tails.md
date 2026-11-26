---
title: CI log tails and verify output as agent input
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: open
---
## Question

A merge fix round triggered by `ci-failed` or a failing post-merge `verify` hands the implementer the failing check names plus log tails (or `verify` output) as untrusted data ([The merge fix loop](77-merge-fix-loop.md), [The Forge seam's new methods](78-forge-seam.md)). GitHub Actions and GitLab jobs give raw logs (GitLab the whole trace, toddler cuts it); other CI gives only a summary or link ([What GitHub and GitLab expose](74-forge-landing-apis.md)).

Decide: how much of each failing log goes in (lines or bytes, per check and in total, and what happens with many failing checks); whether and how it is scrubbed before it reaches the agent, given logs can echo secrets (masking patterns, ANSI/control characters, the forge's own masking); whether the same rules apply to local `verify` output; and how the tails are tested.
