---
title: <Issue title>
labels: []
blocked_by: []
parent: <spec n>
status: open
---
<!-- toddler issue template (files tracker), shaped like the to-tickets issue template. Delete this comment.
- Save as .sandcastle/specs/<spec n>-<slug>/issues/<n>-<slug>.md. <n> is unique across ALL specs: highest issue number under .sandcastle/specs/ plus one. Write blockers first.
- Blockers go in `blocked_by` (issue numbers), not a "Blocked by" section. toddler sets `status: closed` when the work lands.
- Every open file here is picked up (no `toddler` or ready-for-agent label needed). In `labels`: Add `parallel-safe` if it can run beside other issues. `blocked` or `on-hold` holds it back. Add `adult` when a person, not toddler, should do it: toddler never picks it. -->
## Parent

[<Spec title>](../spec.md)

## What to build

<The end-to-end behaviour this issue makes work, from the user's perspective: one thin vertical slice, demoable on its own, sized for one fresh agent session. Not a layer-by-layer list; no file paths or code snippets.>

## Acceptance criteria

- [ ] <Criterion the reviewer can verify>
- [ ] <Criterion>
