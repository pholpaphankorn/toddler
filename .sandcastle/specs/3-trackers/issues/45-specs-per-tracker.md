---
title: Where specs live on each tracker
labels: [wayfinder:grilling, on-hold]
blocked_by: [42, 43]
parent: 3
status: open
---
## Question

On each tracker, what is a **spec** and how does toddler find a spec's issues?

- Local: today's `.sandcastle/specs/<n>-<slug>/spec.md` + `issues/` stays as is?
- GitHub: a parent issue with sub-issues, a labelled issue, a milestone, or an issue type (see [GitHub facts for specs on a GitHub tracker](43-github-spec-facts.md)).
- GitLab: an epic (tier?), a parent issue / work item, or a labelled issue (see [GitLab facts for tracker and forge parity](42-gitlab-facts.md)).
- Does toddler need specs to pick work at all, or only to show/group it? Is an issue outside any spec still worked on a remote tracker (it is not allowed locally)?
- What the spec itself must expose so [PM role](../../5-pm-role/spec.md) can read it later (title, body, its issues), without deciding PM's behaviour here.
