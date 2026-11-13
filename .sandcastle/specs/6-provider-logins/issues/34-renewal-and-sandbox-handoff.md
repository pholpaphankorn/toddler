---
title: How provider logins stay fresh and what a sandbox receives
labels: [wayfinder:grilling, on-hold]
blocked_by: [30, 31, 32]
parent: 6
status: open
---
## Question

Who renews each provider login and when (toddler itself vs the provider CLI run against toddler's store; before each stage, on expiry, on a failed call), how renewals are written back safely, and exactly which credential each sandbox gets (per the "shortest-lived credential that works" rule) so a refresh inside a sandbox can never invalidate toddler's copy.
