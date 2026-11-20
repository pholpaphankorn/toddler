---
title: PM role
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Charted as a skeleton only; tickets come once Roles in config and Trackers settle. -->

## Destination

A spec for a pm role that reads a spec from the project's tracker and turns it into ordered, blocked issues that toddler can work, and for how a user starts it. The spec is ready to break into toddler issues.

## Notes

- **Postponed 2026-11-20.** Don't chart tickets or work this map until phol resumes it. On resume, re-read the code (the temporary pm patch in `src/runner.ts` below may have moved) and the state of specs 2 and 3, and update these notes first.
- **Incomplete (phol, 2026-11-16):** the scope isn't settled. phol will add more functionality (e.g. closing and reprioritising issues), so the Destination will grow. Check with phol before charting tickets or treating the Destination as final.
- **Temporary patch standing in for pm (2026-11-20):** so toddler can work specs 2 and 3 unattended, the coordinator does pm-ish jobs in code: sends a branch that conflicts with the moved base back to the implementer before review and before publishing (`conflicted()`), merges each approved PR (`gh pr merge --auto --merge`), closes a local issue's file with a separate `pm: close issue N` commit on that PR, and re-reads issue files from `origin/<base>` each round so merged closes unblock dependents. These are `shortcut:` comments in `src/runner.ts` (`conflicted()`, `merge()`, `closeCommit()`, `issueRef`). When charting this spec, decide which of them pm owns (closing is already under **Revisit** below) and delete the patch.
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
