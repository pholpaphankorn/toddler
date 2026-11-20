---
title: autoMerge on GitHub
labels: []
blocked_by: [51]
parent: 3
status: open
---
Let a project hand merging to GitHub once review approves.

1. **`autoMerge: boolean`**, new top-level config key, default `false`, valid with every forge (none's behaviour is #53).
2. **GitHub**: after opening the pull request, toddler turns on native auto-merge (`gh pr merge --auto`, the repo's default method), so the merge waits for required checks and approvals. Applies whether issues are on GitHub or in files. The `Forge` request side gains `enableAutoMerge(request)`.
3. **Refusal**: if GitHub refuses (e.g. auto-merge not enabled on the repo), the pull request stays open, the job stays `pr`, and the error is logged.
4. **`doctor`**: with `autoMerge: true`, FAIL when the repo's `autoMergeAllowed` is false.
5. **`autoMerge: false`**: as today; toddler never merges.

Done when GitHub adapter tests cover enabling auto-merge and the refusal path, the runner tests cover the job staying `pr` on refusal, and doctor tests cover the `autoMergeAllowed` check. README documents `autoMerge`.

Decision records: [48](48-gitlab-merge-requests.md), [49](49-init-doctor-per-forge.md).

## Note (2026-11-20): temporary patch, merge in place

A stopgap already merges every PR after review approval, without the `autoMerge` key: `merge()` in `src/runner.ts` runs `gh pr merge <url> --auto --merge` and logs a refusal (job stays `pr`). This issue replaces it with the opt-in `autoMerge` key and `Forge.enableAutoMerge`, and should delete `merge()`. `--merge` (not the repo default) was chosen so the separate close-issue commit survives; revisit that when [#53](53-automerge-none.md) settles who closes issue files.

## Note (2026-11-20): auto-merge is refused on a clean PR

GitHub will not enable auto-merge on a pull request with nothing left to wait for (`mergeStateStatus: CLEAN`): `gh pr merge --auto` fails with "Pull request is in clean status (enablePullRequestAutoMerge)". This repo's `main` ruleset requires a PR but no approvals and no status checks, so every toddler PR is clean at once. The stopgap `merge()` retries with a plain `gh pr merge <url> --merge` on that error. `enableAutoMerge` must keep that fallback (or merge directly when the PR is already clean), or it will log a refusal for every PR on a repo like this one; cover it in the GitHub adapter tests.
