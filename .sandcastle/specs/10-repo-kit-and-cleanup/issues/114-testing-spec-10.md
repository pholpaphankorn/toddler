---
title: How spec 10's setup, kit and doctor row are tested
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 10
status: open
---
## Question

Now that [Planning kit templates and the toddler block](108-planning-kit-templates.md), [setup as a toddler command: kit step, login steps and glab](109-setup-command.md) and [doctor row for spec children missing issueLabel](110-doctor-missing-issue-label.md) are settled, what tests does the spec ask for, and at which seam?

- Kit writer and the `<!-- toddler:start -->`/`end` block: temp git repos, marker edge cases (missing, duplicated, one marker only, no `AGENTS.md`/`CLAUDE.md`), re-render after a label change.
- `setup`'s commit rule: changed-only paths, prior uncommitted edits left out, detached HEAD, other staged changes untouched; login steps with fake `gh`/`glab`/`codex`/`claude` commands.
- The doctor row: GitHub GraphQL and GitLab list fixtures (nested children, closed parent, `adult`/blocked labels, >10 missing, read failure), through the existing injectable `Command`.
- `adultLabel` skipping on files and forge trackers.
