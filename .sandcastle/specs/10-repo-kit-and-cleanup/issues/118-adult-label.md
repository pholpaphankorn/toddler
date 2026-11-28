---
title: adultLabel keeps person-only issues out on every tracker
labels: []
blocked_by: []
parent: 10
status: closed
---
An issue meant for a person, not toddler, carries one label on any tracker and is never picked, whatever its other labels. Settled in [doctor row for spec children missing issueLabel](110-doctor-missing-issue-label.md) and [How spec 10's setup, kit and doctor row are tested](114-testing-spec-10.md).

1. **New config key `adultLabel`**, string, default `adult`. Glossary: **Adult issue**.
2. **Never picked**: on files, an issue with `adultLabel` in `labels`; on GitHub and GitLab, an issue carrying it even with `issueLabel` (like `blockedLabels`).
3. **Relabel in the same change**: wayfinder tickets and maps under `.sandcastle/specs` move `on-hold` → `adult` (frontmatter, map comments, tracker notes) by an agent or throwaway script; no rename code in toddler. This must not land before step 2, or toddler would pick them.

- [ ] Config row: `adultLabel` defaults to `adult`; a non-string fails
- [ ] Picking tests: files `labels: [adult]` never picked; GitHub and GitLab issue with both `Sandcastle` and `adult` never picked
- [ ] `toddler plan` on this repo lists none of the wayfinder tickets after the relabel
- [ ] README config table lists `adultLabel`
