---
title: Specs on each tracker
labels: []
blocked_by: [54]
parent: 3
status: closed
---
Implement `Tracker.spec(id)` on every tracker so the [PM role](../../5-pm-role/spec.md) can read specs later. Nothing in the run loop calls it: a spec groups issues and never gates picking, and an issue outside any spec is still worked.

1. **What it returns**: `{ id, title, body, issues: { number, title, state }[] }`. No ordering or nesting.
2. **Files**: a spec is its folder (`spec.md` + `issues/`). Issue files' `parent:` stays ignored.
3. **GitHub**: a spec is a parent issue; its **direct** sub-issues are its issues (deeper levels don't count). Read in one GraphQL call. The parent carries no `issueLabel`, so it is never picked as work.
4. **GitLab**: a spec is a plain issue. Its issues are those in the same project with a body line `Spec: #<iid>` naming it. A missing target or a second `Spec:` line in an issue doesn't stop that issue being picked; toddler reports it only when reading the spec.

Done when each adapter has tests for reading a spec, including GitHub ignoring nested sub-issues and GitLab reporting a duplicate `Spec:` line.

Decision records: [45](45-specs-per-tracker.md). GitHub facts: [43](43-github-spec-facts.md).
