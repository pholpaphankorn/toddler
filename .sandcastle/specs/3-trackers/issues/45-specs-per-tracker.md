---
title: Where specs live on each tracker
labels: [wayfinder:grilling, adult]
blocked_by: [42, 43]
parent: 3
status: closed
assignee: phol (with claude)
---
## Question

On each tracker, what is a **spec** and how does toddler find a spec's issues?

- Local: today's `.sandcastle/specs/<n>-<slug>/spec.md` + `issues/` stays as is?
- GitHub: a parent issue with sub-issues, a labelled issue, a milestone, or an issue type (see [GitHub facts for specs on a GitHub tracker](43-github-spec-facts.md)).
- GitLab: an epic (tier?), a parent issue / work item, or a labelled issue (see [GitLab facts for tracker and forge parity](42-gitlab-facts.md)).
- Does toddler need specs to pick work at all, or only to show/group it? Is an issue outside any spec still worked on a remote tracker (it is not allowed locally)?
- What the spec itself must expose so [PM role](../../5-pm-role/spec.md) can read it later (title, body, its issues), without deciding PM's behaviour here.

## Answer

Grilled with phol, 2026-11-16.

- **A spec groups issues and holds text; it never decides what is picked.** Work is still picked per issue (label, state, blocking), as today, where toddler never reads `spec.md`. On a forge, an issue outside any spec is still worked; local issue files still need a spec folder (the path requires it).
- **Files**: unchanged: `.sandcastle/specs/<n>-<slug>/spec.md` + `issues/`.
- **GitHub**: a spec is a parent issue; its **direct** sub-issues are its issues (deeper levels don't count). No spec label or issue type; the parent carries no `issueLabel`, so it is never picked as work.
- **GitLab**: a spec is a plain issue, no label (Free has no issue-to-issue parent/child; epics are Premium+). Each of its issues has one body line `Spec: #<iid>` naming an issue in the same project; cross-project references aren't supported. A missing target or a second `Spec:` line doesn't stop the issue being picked; toddler reports it only when reading the spec.
- **What a spec exposes** (for [PM role](../../5-pm-role/spec.md) later): id, title, body, and its issues (number, title, state). No ordering or nesting.
- Glossary: **Spec** added.
