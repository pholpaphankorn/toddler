---
title: Publishing to a GitLab forge
labels: [wayfinder:grilling, on-hold]
blocked_by: [44]
parent: 3
status: open
---
## Question

What does toddler's publish step (`publish()` in `src/runner.ts`: `gh pr list`, `git push`, `gh pr create`) do on a GitLab forge, and on `none`? Facts: [GitLab facts for tracker and forge parity](42-gitlab-facts.md).

- Finding an existing MR for an issue's branch (`source_branch` + `state=opened`), and what counts as "already has a PR".
- MR title/body and the closing reference: `Closes #N` closes only on merge to the default branch, the same gap GitHub has today when `baseBranch` isn't the default. Accept it, warn, or have toddler close issues itself?
- With a `local` tracker and a GitHub or GitLab forge, what does the PR/MR reference, since there is no remote issue to close?
- Toddler never merges PRs today: does that stay true for MRs, and what does `none` do (today's offline local merge)?
