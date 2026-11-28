---
title: doctor row for spec children missing issueLabel
labels: []
blocked_by: [118]
parent: 10
status: closed
---
On a forge tracker, `doctor` fails when an open spec's open children lack `issueLabel`, since toddler would never pick them and nothing else says so. Settled in [doctor row for spec children missing issueLabel](110-doctor-missing-issue-label.md) and [How spec 10's setup, kit and doctor row are tested](114-testing-spec-10.md) (step 4).

1. **Spec child** = an open issue whose spec is open. GitHub: an issue with a `parent` (any nesting) whose parent is open. GitLab: an issue with a `Spec: #N` line naming an open issue.
2. **Skipped**: children carrying `adultLabel` or any `blockedLabels` label.
3. **Row** in each forge's `doctorChecks`, beside "Issue label", only when `issues === "forge"`, through the existing `check` (FAIL, no WARN). OK: `Spec children: N open, all labelled Sandcastle`. FAIL: `Spec children: 3 missing Sandcastle: #41, #42, #57`, at most 10 numbers then `(+N more)`. A read failure FAILs the row with the error.
4. **Reads**: GitHub one paginated GraphQL `repository.issues(states: OPEN, first: 100)` with `number`, `labels`, `parent { number state }`, filtered in code. GitLab paginated `issues?state=opened&per_page=100`, `Spec:` lines parsed as `spec()` does, one `GET` per distinct parent to check it is open.
5. README's doctor section lists the row.

- [ ] `forge.test.ts` / `gitlab.test.ts` through `doctorChecks(config)` with a fake `Command` returning inline pages (no new fixtures): nested child, closed parent, `adult`/blocked labels skipped, second page, more than 10 missing → `(+N more)`, all labelled → exact OK text, read failure → FAIL with the error
