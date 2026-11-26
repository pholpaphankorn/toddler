---
title: pick and the new ranker contract
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 9
status: open
---
## Question

[How work is split across providers by quota left](../../7-harness-boundary/issues/69-provider-split.md) settled the ranker input `{ candidates: [{ provider, model, reading, running }] }`, the `balanced` and `most-quota` modules, a sticky implementer and a reviewer re-picked each round. Decide how `pick(role, job) → provider | none` does it:

- Migration: today's contract passes `role` and `issue`, and configs may say `"quota"` or `"order"`. Error, translate, or keep extra fields?
- `running` when two slots are filled at once: does the second pick see the first's session?
- When the ranker is called: with one candidate, with none; whether `pick` returns none for one role while another role could still start (per-model stops), and how the loop treats that.
- Sticky implementer across merge fix rounds and resumed jobs (state field?), and what "has quota" means for stickiness.
- Where `maxParallelIssues` and `parallel-safe` are read (the scheduler seam), and what replaces `assignments()` / `reviewer()`.
- Whether the built-in modules ship as files loaded through the same loader as a project's module.
