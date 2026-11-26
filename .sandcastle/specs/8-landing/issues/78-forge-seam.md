---
title: The Forge seam's new methods and their local-mode equivalents
labels: [wayfinder:grilling, on-hold]
blocked_by: [74, 76]
parent: 8
status: closed
assignee: claude
---
## Question

Given what the forges expose ([What GitHub and GitLab expose for mergeability, CI logs and auto-merge](74-forge-landing-apis.md)) and the landing path ([The one landing path: host merge, verify, exact push](76-landing-path.md)): what methods does `Forge` gain for mergeability, CI status + failing log tails, pushing the host's merge, and waiting on auto-merge? What do they return (a small union of "mergeable / behind / conflict / ci-failing / ci-pending / review-required / landed" or raw fields), and what does `NoneForge` do for each? GitLab gets parity, not a subset. Use codebase-design.

## Answer

Settled with phol 2026-11-26.

- **The interface shrinks to four members**: `base(branch?)` (unchanged), `deliver(job)`, `poll(job)`, `doctorChecks(config)` (unchanged). `findRequest`, `openRequest` and `enableAutoMerge` become private steps of `deliver`/`poll`; the `enabled` and `remote` flags go. The landing module keeps the host merge and `verify` (the same for every forge) and hands the forge one finished SHA.
- **`deliver({ branch, sha, base, title, body })`** → `landed | waiting(url) | moved | refused(reason)`. On a forge: plain push of the exact SHA (no lease, no force: host merges and merge fix commits always sit on top, so it fast-forwards), find or open the request, then (re)enable auto-merge every time, because a GitLab push aborts it and on GitHub enabling it again does no harm. A rejected push (someone else pushed to the branch, protected head, linear history, rebase-only project) is `refused` → needs attention. A forge `deliver` never returns `landed`, even when GitHub merges at once: it returns `waiting`, and the next `poll` reports `landed`. With `autoMerge` off it opens the request and returns `waiting`; landing drops the job (it stops at approved).
- **`poll({ branch, sha })`** is one forge read and returns a small union; the adapter maps raw fields (`mergeStateStatus`, `reviewDecision`, `detailed_merge_status`, …) and picks the state, in this precedence:
  `none` (no request: resume → deliver) · `landed` · `closed` (needs attention) · `review-required` (needs attention at once) · `conflict` (merge fix) · `behind` (host merge + verify + deliver, no agent) · `ci-failed { checks: name, link, tail? }` (merge fix) · `auto-merge-off` (needs attention) · `waiting` (CI pending, or mergeability still being computed, e.g. GitHub `mergeable: null`). GitLab gets parity by construction.
- **A cancelled auto-merge is noticed by `poll`** (`OPEN` with no `autoMergeRequest`; `opened` with `merge_when_pipeline_succeeds` false) and makes the issue needs attention: "auto-merge was turned off on <url>". Infant re-enables it only inside its own `deliver`, so it never overrules phol.
- **CI log tails come from inside `poll`**, only when the state is `ci-failed`; that state takes the job out of landing, so the extra reads happen once per trigger. `tail` is absent for CI that isn't GitHub Actions or GitLab jobs. Size and scrubbing stay fog.
- **`NoneForge` does the local landing**: `deliver` is the compare-and-swap `update-ref` (plus `merge --ff-only` when the base is checked out and clean) → `landed`; a lost compare-and-swap → `moved` (landing goes back to the merge step); a base checked out with uncommitted changes, or any git error → `refused`. `poll` is `landed` when `sha` is an ancestor of the base, otherwise `none`. `fastForward`/`fastForwardBase` move out of `runner.ts` into it. Only `NoneForge` returns `landed` from `deliver` or `moved` at all.
- **No new doctor checks**: linear history and rebase-only projects are untested and already end as needs attention with the forge's reason. The existing auto-merge-allowed check stays.
- Passed on: how landing is tested, now that the seam is fixed → [How landing is tested](80-landing-tests.md).
