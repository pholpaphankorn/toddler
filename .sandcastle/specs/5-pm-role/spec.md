---
title: PM role
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Charted as a skeleton only; tickets come once Roles in config and Trackers settle. -->

## Destination

A spec for a pm role that reads a spec from the project's tracker and turns it into ordered, blocked issues that toddler can work, and for how a user starts it. The spec is ready to break into toddler issues.

## Notes

- **Incomplete (phol, 2026-11-16):** the scope isn't settled. phol will add more functionality (e.g. closing and reprioritising issues), so the Destination will grow. Check with phol before charting tickets or treating the Destination as final.
- Waits on [Roles in config](../2-roles-in-config/spec.md) (pm is a role) and [Trackers](../3-trackers/spec.md) (it reads specs from and writes issues to the tracker).
- Check overlap with spec 1's out-of-scope "async planning mode" and "tracker doc" entries ([spec 1](../1-skills-in-the-sandbox/spec.md)) before charting.
- Today no forge token enters the sandbox (`src/agents.ts` unsets them), so who writes the issues is an open question.
- Tracker: these files, same conventions as [spec 1](../1-skills-in-the-sandbox/spec.md). Tickets are files with `parent: 5` and carry `on-hold`. Claim = `assignee:`; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Role**, **Tracker**, **Skill set**).
- Implementation issues from this spec are `blocked_by` [spec 1](../1-skills-in-the-sandbox/spec.md)'s open issues (13–17) where they touch the same code.

## Decisions so far

## Not yet specified

- How it's started: its own command, or a stage inside `toddler run`.
- Whether pm writes to the tracker itself or returns structured output that the host writes.
- **Revisit (phol, 2026-11-16):** `Tracker` is read-only after [Trackers](../3-trackers/spec.md) (`issues`, `blocked`, `comments`, `spec`). PM may need to close issues and reprioritise them; this spec decides which write operations `Tracker` gains, and how they work on files, GitHub and GitLab. See [Publishing to a GitLab forge](../3-trackers/issues/48-gitlab-merge-requests.md).
- What "organize tasks" means concretely: order, `parallel-safe` labels, `blocked_by`, sizing.
- Whether a human approves the issues before toddler works them.
- Which skills go in its skill set.

## Out of scope
