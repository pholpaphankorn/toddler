---
title: Trackers
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Charted as a skeleton only; tickets come in a later session. -->

## Destination

A spec for one tracker setting that says where a project's specs and issues live (local files, GitHub or GitLab), with GitLab at parity with GitHub: issues, labels, blocking, push, merge requests, and self-hosted instances. The spec is ready to break into toddler issues.

## Notes

- **Don't duplicate sandcastle.** The user wants toddler to reuse what `@ai-hero/sandcastle` already offers for issues and PRs. Find that out first; the user wants to discuss the approach once it is known.
- Today: `issues: "github" | "local"` and `openPr` in `src/config.ts`; GitHub reads go through the host `gh` login; local issues are `.sandcastle/specs/<n>-<slug>/issues/*.md`.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Tickets are files with `parent: 3` and carry `on-hold`. Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Tracker**, **Provider**, **Role**).
- Implementation issues from this spec are `blocked_by` [spec 1](../1-skills-in-the-sandbox/spec.md)'s open issues (13–17) where they touch the same code.

## Decisions so far

## Not yet specified

- What sandcastle provides for issue sources, PR creation and forge auth (likely the first research ticket).
- The tracker interface toddler codes against, and how `issues` + `openPr` migrate to it.
- GitLab: auth (`glab` login?), self-hosted host config, how blocking is expressed (issue links may depend on the GitLab tier), MR creation and closing keywords.
- Where "specs" live per tracker (a spec file vs an epic or parent issue), which [PM role](../5-pm-role/spec.md) reads.

## Out of scope

- Trackers other than local, GitHub and GitLab (e.g. Jira, Linear).
