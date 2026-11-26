---
title: How landing is tested
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: open
---
## Question

[The Forge seam's new methods and their local-mode equivalents](78-forge-seam.md) fixed the seam: `deliver` and `poll` return small unions, and `NoneForge` does the local landing. How is landing tested?

- A fake `Forge` that returns scripted `deliver`/`poll` results, driving the landing module and the [merge fix loop](77-merge-fix-loop.md) (auto-merge waits, `behind` → host merge, `ci-failed` → merge fix, `moved` retries, needs attention reasons): what it scripts, and what goes on real git in a temp repo instead (host merge, the host-commit chain proof, `NoneForge`'s compare-and-swap).
- Contract tests for the GitHub and GitLab adapters with a fake `Command`, as the forge tests do today: which raw-field combinations each `poll` precedence case must cover.
- What real `smoke` must check against a scratch repo, given the three behaviours [What GitHub and GitLab expose for mergeability, CI logs and auto-merge](74-forge-landing-apis.md) left untried (GitHub keeping auto-merge after a host push, GitLab merge commit clearing `need_rebase`, GitHub linear history), and whether that runs by hand or in CI.
