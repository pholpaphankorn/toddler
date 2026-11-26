---
title: Tracker and forge interface
labels: [wayfinder:grilling, on-hold]
blocked_by: [41, 44, 45, 46]
parent: 3
assignee: phol (with claude)
status: closed
---
## Question

What interface do `src/runner.ts` and `src/policy.ts` code against so the five valid setups from [Tracker and forge config shape](44-tracker-forge-config.md) plug in without per-host branches in the loop? Those setups are GitHub or GitLab with their own issues, GitHub or GitLab with issue files, and none with issue files. Today the GitHub calls (`gh api` for labelled issues, dependencies, PR creation) and the local file reader sit directly in `runner.ts`.

- One host module, the **forge** (GitHub, GitLab or none), built from `forge`. A GitHub or GitLab forge owns both its issues and its pull/merge requests. `issues: "files"` swaps only the issues side for the files reader. There is no separate tracker host: a remote tracker is always the forge.
- Issues side: list workable issues with labels and blockers, read a spec and its issues, comments for context. Infant doesn't close or comment today.
- Requests side: base branch, find an existing PR/MR for an issue's branch, push and open one.
- Infant writes all of these: sandcastle offers none (see [What sandcastle offers for trackers and forges](41-sandcastle-forge-support.md)). Today local issues ignore `parent:`; the interface should say whether it starts reading it.
- Seams for tests: how the GitHub and GitLab implementations are tested without a network (today `gh` is injected as `command`).

## Answer

Grilled with phol, 2026-11-16. The ticket was charted before [Tracker and forge config shape](44-tracker-forge-config.md) dropped the `tracker` key, so its Question was rewritten to the one-host framing first.

- **One host module, the forge**, built from `forge`: GitHub, GitLab or none. A GitHub or GitLab forge owns both its tracker side and its request side. The runner gets `tracker` and `forge` and never checks a host name:

  ```ts
  const forge = connect(config.forge)              // github | gitlab | none
  const tracker = config.issues === "files" ? files : forge.tracker
  ```

  None has no tracker side, which is why `issues: "forge"` with `forge: "none"` is rejected at load. Two independent tracker/forge interfaces were rejected because they invite the cross-host pairs ruled out of scope. The only `issues === "files"` check left in the loop is the branch prefix (`infant/local-N`).
- **`Tracker`** (the glossary word, used as the type name). Adapters: files, GitHub, GitLab. Read-only, with no close or comment operations:
  - `issues()`: the open work issues, sorted by number. Forge: the ones labelled `issueLabel`. Files: every open issue.
  - `blocked(issue): Promise<boolean>`: each adapter keeps its own rule (files: `blocked_by` against the open set; GitHub: native dependencies; GitLab: [native links + `Blocked by:` line](46-gitlab-blocking-labels.md)). It is separate from `issues()` so the runner still skips tried or finished issues before an API call.
  - `comments(issue): Promise<string[]>`: files returns `[]`.
  - `spec(id)`: the fields from [Where specs live on each tracker](45-specs-per-tracker.md). It is built and tested in this spec's issues even though nothing calls it until [PM role](../../5-pm-role/spec.md). On files, a spec stays the folder; `parent:` stays ignored.
- **One `Issue` shape**: `{ number, title, body, labels: string[] }`. On GitLab, `number` is the iid. GitHub's `pull_request` field and `{ name }` labels are removed inside the adapter; `blockedBy`/`closed` are private to the files adapter.
- **Label rules** (`blockedLabels`, `parallelLabel`) stay in `policy.ts`, unchanged.
- **`Forge` request side** ("request" is the code's word for a PR or MR; anything the user reads still says PR or MR):
  - `base()` returns `{ branch, ref }`. GitHub and GitLab: the default branch, fetched, with `ref` = `<remote>/<branch>`. None: the checked-out branch.
  - `findRequest(branch)` returns `{ url, open }` for an open or merged PR/MR; none returns nothing. `candidates()` skips any issue that has one; `publish()` reuses it when it is open.
  - `openRequest({ branch, sha, base, title, body })` pushes, opens the PR/MR and returns its URL. The runner still writes the title and body. For none, the runner marks the job `done` and never calls it; what none should really do is left to [Publishing to a GitLab forge](48-gitlab-merge-requests.md).
- **Test seams**: the GitHub and GitLab forges each take a `Command` (fake `gh`/`glab` recording arguments, as today) and get their own adapter tests. The runner's workflow tests switch to in-memory fake `Tracker` and `Forge` objects instead of faking `gh` arguments.
