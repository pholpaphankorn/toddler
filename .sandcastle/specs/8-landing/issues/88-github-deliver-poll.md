---
title: GitHub deliver and poll
labels: []
blocked_by: [86, 87]
parent: 8
status: closed
---
On GitHub, toddler watches its auto-merge PRs until they land: it merges a moved base itself, sends failing CI back as a merge fix with log tails, and stops to ask phol when only a human can unblock the PR.

1. **`deliver`**: plain push of the exact SHA (no lease, no force), find or open the PR, then (re)enable auto-merge every time, keeping the clean-status fallback from #52 (`gh pr merge --merge` when GitHub refuses auto-merge on a clean PR). A rejected push → `refused(reason)`. Never `landed`; returns `waiting(url)`. With `autoMerge` off it opens the PR and returns `waiting`; landing drops the job (it stays approved, waiting on you).
2. **`poll`** is one `gh` read mapped to the union in this precedence: `none` · `landed` · `closed` · `review-required` (from `reviewDecision`, read apart from mergeability) · `conflict` · `behind` · `ci-failed { checks: name, link, tail? }` · `auto-merge-off` (`OPEN` with no `autoMergeRequest`) · `waiting` (CI pending, or `mergeable: null`). Log tails only for GitHub Actions, via `gh run view --log-failed` through `logTail`; other checks give name + link.
3. **Landing reacts**: `closed` → `request-closed`; `review-required` → needs attention at once; `auto-merge-off` → "auto-merge was turned off on <url>"; `behind`/`conflict` → host merge (#85/#87); `ci-failed` → merge fix with trigger `ci-failed` (only finished, failed CI).
4. **Polling**: landing polls every open PR it holds concurrently, every **`landingPollSeconds`** (new config, default 60, below 10 refused at load, ignored with `forge: none`), via the injected `wait`. Only the host merge + push step is one at a time.
5. **Resume**: a PR merged by hand while toddler was off goes straight to `landed`; an approved job without auto-merge is re-polled each run so a hand merge becomes `landed`.
6. Delete the stopgap `merge()` if it still exists.

- [ ] Table-driven contract rows in `forge.test.ts` with the fake `Command`: one raw-JSON row per `poll` state, plus overlaps (closed + conflict, review-required + ci-failed, behind + ci-failed, conflict + ci-failed, `mergeable: null` → `waiting`); non-Actions checks give a link and no `tail`; tails asserted to have gone through `logTail` with a short fixture
- [ ] `deliver` rows: push refused → `refused`, an open PR reused, `autoMerge` off → `waiting` without enabling, the clean-status fallback
- [ ] Landing tests: `ci-failed` → merge fix with names + tails; each forge needs-attention reason
- [ ] README documents `landingPollSeconds`

Decision records: [74](74-forge-landing-apis.md), [78](78-forge-seam.md), [80](80-landing-tests.md).
