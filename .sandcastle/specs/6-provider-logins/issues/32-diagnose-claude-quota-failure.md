---
title: Why Claude quota reads fail after the first issue
labels: [wayfinder:task, on-hold]
blocked_by: []
parent: 6
status: open
---
## Question

Reproduce or reconstruct (from `.sandcastle/logs/`, `infant doctor`, the Keychain entry's `expiresAt` vs run timestamps) why the Claude usage read works during a run's first issue and fails on the next. Suspected: the Keychain access token expires and infant never refreshes it ([quota.ts](../../../../src/quota.ts) `nativeClaudeToken`), then `Quotas.disable` keeps Claude stopped for the run. Confirm or refute with evidence; record the failing HTTP status and timings. Also say whether the same cause explains needing `claude auth login` daily. No fix beyond a trivial one.
