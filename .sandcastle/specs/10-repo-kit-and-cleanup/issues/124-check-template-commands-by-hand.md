---
title: Check the kit's gh and glab commands against real forges
labels: [adult]
blocked_by: [120]
parent: 10
status: open
---
For a person, not toddler (sandboxes hold no forge token): confirm a planning session following the kit's forge templates produces issues toddler picks up. Settled in [How spec 10's setup, kit and doctor row are tested](114-testing-spec-10.md) (step 6). Not added to `smoke:forge`.

1. Run `toddler setup` in a throwaway GitHub repo with `forge: github`, `issues: forge`; create a spec and two issues (one blocking the other) with the `gh api` commands in the rendered templates.
2. Same in a throwaway GitLab project with the `glab` commands.
3. Run `toddler plan` in each and record what it shows.

- [ ] Sub-issue and native blocking wiring works on GitHub; `toddler plan` shows the unblocked issue ready, the other blocked
- [ ] `Spec:` / `Blocked by:` lines work on GitLab with the same `plan` result
- [ ] Any broken command fixed in the templates (or filed as an issue), result noted in `## Answer`
