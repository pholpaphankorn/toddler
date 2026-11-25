---
title: "One provider builds, the other reviews: keep, delegate, or drop"
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

Is cross-provider review worth its cost? Alternatives: same-provider review in a fresh context, review by a subagent inside the building session, human review only, no review. Should Codex remain a full equal to Claude Code at all? Inventory rows 13–15, 34.

phol's leaning (2026-11-25, from [One orchestrator session per batch or one session per issue](62-orchestrator-session.md)): drop cross-provider review and pick providers only by quota left. Not decided yet.

## Answer

Settled with phol 2026-11-25. **The review stage stays; the cross-provider preference goes.** The reviewer is picked by quota left, not by being the other provider.

- **Review stage stays as code** (row 13): implement → review → requested changes, with `maxReviewRounds`. With unattended runs, the reviewer and CI are the only checks before work lands ([Unattended runs from a queue](64-unattended-queue.md)). Human-only review and no review are rejected.
- **Reviewer chosen by quota left** (row 14): the same rule that picks the implementer, decided in [How work is split across providers by quota left](69-provider-split.md). It may be the provider that built the work. The opposite-provider preference in `reviewer()` is dropped. Independence comes from a separate session in its own sandbox and fresh worktree that sees only committed work ([A Seatbelt sandbox per stage](65-sandbox-per-stage.md)), not from a different vendor.
- **No review by a subagent inside the building session**: it would share the builder's context and checkout, and toddler couldn't check its verdict. The builder may still use subagents to check its own work before handing over.
- **Codex stays a full equal** to Claude Code in every role. Its reason is now capacity: a second subscription's quota, which the quota split needs.
- **Review-report parsing stays as code** (row 15): exactly one verdict, no findings on approve. The verdict decides whether work lands, so it gets a code check ([ADR 0001](../../../../docs/adr/0001-code-agent-or-cut.md) rule 3). The verdict format stays a workflow rule.
