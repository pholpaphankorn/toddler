---
title: Tracker and forge seams, behaviour unchanged
labels: []
blocked_by: [38]
parent: 3
status: open
---
Prefactor: move every host call out of the runner behind two interfaces, so GitLab and the new config can be added without touching the loop. Behaviour and config shape stay exactly as today.

1. **`Tracker`** (the glossary word), read-only:
   - `issues()`: the open work issues, sorted by number. GitHub: labelled `issueLabel`, pull requests dropped. Files: every open issue file.
   - `blocked(issue)`: each adapter keeps its own rule (files: `blocked_by` against the open set; GitHub: native dependencies, any open blocker counts). Separate from `issues()` so the runner still skips tried or finished issues before an API call.
   - `comments(issue)`: files returns `[]`.
   - `spec(id)`: declared here, implemented in #56.
2. **One `Issue` shape**: `{ number, title, body, labels: string[] }`. GitHub's `pull_request` field and `{ name }` labels are removed inside the adapter; `blockedBy`/`closed` stay private to the files adapter. Label rules (`blockedLabels`, `parallelLabel`) stay in policy, unchanged.
3. **`Forge`**, one per host, owning its tracker side and a request side ("request" = PR or MR in code; user-facing text still says pull request):
   - `base()` → `{ branch, ref }`. GitHub: the default branch, fetched, `ref` = `<remote>/<branch>`. None: the checked-out branch.
   - `findRequest(branch)` → `{ url, open }` for an open or merged request, else nothing. `candidates()` skips an issue that has one; `publish()` reuses it when open.
   - `openRequest({ branch, sha, base, title, body })` pushes, opens the request and returns its URL. The runner still writes title and body.
   - `doctorChecks(config)` → `[name, action][]` (the `skillDoctorChecks` shape). GitHub: today's checks. None: today's "not used" line.
   - None has no tracker side; for now the runner marks the job `done` and never calls `openRequest`.
4. **Wiring**: the runner gets `tracker` and `forge` and never checks a host name. Until #51 the host is picked from today's `issues`/`openPr`. The only files check left in the loop is the branch prefix (`toddler/local-N`).

Done when the GitHub tracker and forge have their own tests with a fake `gh` recording arguments (as today), the files tracker has tests for open/closed/`blocked_by`, and the runner's workflow tests use in-memory fake `Tracker` and `Forge` objects instead of faking `gh` arguments, with the same behaviours covered.

Decision record: [47](47-tracker-forge-interface.md).
