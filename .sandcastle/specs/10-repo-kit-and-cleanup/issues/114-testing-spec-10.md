---
title: How spec 10's setup, kit and doctor row are tested
labels: [wayfinder:grilling, adult]
blocked_by: []
parent: 10
status: closed
assignee: claude (phol session)
---
## Question

Now that [Planning kit templates and the toddler block](108-planning-kit-templates.md), [setup as a toddler command: kit step, login steps and glab](109-setup-command.md) and [doctor row for spec children missing issueLabel](110-doctor-missing-issue-label.md) are settled, what tests does the spec ask for, and at which seam?

- Kit writer and the `<!-- toddler:start -->`/`end` block: temp git repos, marker edge cases (missing, duplicated, one marker only, no `AGENTS.md`/`CLAUDE.md`), re-render after a label change.
- `setup`'s commit rule: changed-only paths, prior uncommitted edits left out, detached HEAD, other staged changes untouched; login steps with fake `gh`/`glab`/`codex`/`claude` commands.
- The doctor row: GitHub GraphQL and GitLab list fixtures (nested children, closed parent, `adult`/blocked labels, >10 missing, read failure), through the existing injectable `Command`.
- `adultLabel` skipping on files and forge trackers.

## Answer

Resolved with phol 2026-11-28 (grilling).

1. **`setup` is tested as a process.** Each test spawns `main.ts setup` in a temp git repo with a fake `bin/` on `PATH`, like today's `init`/`doctor` tests. Asserted: `setup`'s output lines, `git log`/`git status`, the written files. Cases: first run writes and commits the kit; a second run says `kit: up to date` and makes no commit; a label change (`issueLabel`, `adultLabel: grown-up`) re-renders and commits only the changed templates; a kit file with prior uncommitted edits is written but left out of the commit with its line; other staged changes stay staged and out of the commit; detached HEAD writes without committing; a run whose commit was interrupted is finished by the next run; neither `AGENTS.md` nor `CLAUDE.md` → `AGENTS.md` with the block plus `CLAUDE.md` holding `@AGENTS.md`; both present → both get the block.
2. **Marker edge cases are a pure-function table.** The block-splice function takes file text and returns the new text or an error. Rows: no block → appended; one pair → only the text between the markers is replaced, outside text untouched; start without end, end without start, two pairs → error naming the file. **New rule:** an end marker without a start, and two start/end pairs, stop `setup` like start-without-end does, before anything is written or committed. It never guesses which block is real.
3. **Logins use fake commands.** `gh`/`glab`/`codex`/`claude` are shell scripts that append their arguments to a log and take their status exit code from an env var. Asserted: which steps ran for each `forge` and role providers (`codex: skipped (no role uses it)`, no `glab` step on GitHub), that `login` runs after a failing status check, and that a failed login doesn't stop `setup`. Kit and commit tests use `forge: none` with file issues so doctor stays offline and passes. Login tests assert only the exit code doctor gives with those fakes, not its rows.
4. **The doctor row is called directly.** The row comes from each forge's `doctorChecks(config)` with a fake `Command` returning inline GraphQL pages (GitHub) or `issues` lists plus single-parent `GET`s (GitLab), in `forge.test.ts`/`gitlab.test.ts`. No new `tests/fixtures/`. Cases: nested child, closed parent, `adult`/blocked labels skipped, second page, more than 10 missing → `(+N more)`, all labelled → the OK text, read failure → FAIL with the error. The exact OK/FAIL strings are asserted.
5. **`adultLabel`**: one picking test per tracker. Files: `labels: [adult]` is never picked. GitHub and GitLab: an issue with both `Sandcastle` and `adult` is never picked. Plus a config row for the `adult` default and its string type. The rendered name in the issue template is checked by the kit tests in (1).
6. **Template commands are checked by hand.** The spec's Testing Decisions carry one acceptance step: run each template's `gh api` and `glab` commands once against a throwaway GitHub repo and GitLab project, then run `toddler plan` to see the issues picked up. Not added to `smoke:forge`.
7. **Nothing more decided here.** The skill doctor (one repo test, per ticket 70), the shim removal (deletes its own test rows and old `state.json` fixtures), the reaping tests (settled in [How toddler reaps a stage's leftover processes](113-reap-stage-stragglers.md)) and the `on-hold` → `adult` relabel (a one-off script, no test) each carry their own tests in their implementation issues.
