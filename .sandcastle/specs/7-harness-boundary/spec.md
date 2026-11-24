---
title: Harness boundary
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 7`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A decision record that sorts every toddler feature into **keep as code**, **delegate to the provider's harness** (Claude Code / Codex), or **cut**, with the rule that decides, and a yes/no on handing a batch of issues to one orchestrator session that works them with its own subagents. Reshape specs follow from it, one per area, as separate maps.

## Notes

- Started 2026-11-24 from phol's experience that Claude Code already spawns and orchestrates subagents; toddler should not reinvent what the harnesses do.
- Settled while charting:
  - **Guarantees stay as code, outside the agent**: unattended runs from a queue; every stage in its own Seatbelt sandbox; one provider builds, the other reviews; quota stops; only work that passed `verify` and an approving review leaves the sandbox. Everything else (scheduling, concurrency, forge/tracker modules, ranking, skills, doctor, state) is on the table.
  - **Scheduling is the open core question**: today the runner assigns one issue per session (`parallel-safe` label, two pipelines). Candidate: one provider session takes a batch of ready issues and parallelises with its own subagents, one branch per issue; toddler gates each branch; cross-review is a second phase by the other provider.
  - **Codex is a full equal**: a feature counts as delegated only if both Claude Code and Codex can do it unattended; otherwise it stays code, or is delegated per provider.
  - Token savings alone is a weak reason to keep code; enforcing what the agent can't be trusted to enforce on itself is a strong one.
- Tracker: these files, same conventions as [spec 4](../4-quota-aware-scheduling/spec.md). Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by`.
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Forge**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), codebase-design for where seams go.

## Decisions so far

## Not yet specified

- How cross-review and requested-changes rounds work under the scheduling answer (per-issue loop vs batch phases; how a review's changes route back to one issue's branch).
- A cheap prototype of an orchestrator session (prompt + one real batch) to react to.
- Classifying the remaining features once the rule exists: ranking, bundled skills and skill doctor, state/resume, `doctor`/`setup`/`smoke`, role prompts and workflow rules.
- What a quota stop means when one session holds a whole batch.

## Out of scope

- Implementing the reshape: each area gets its own spec after this map.
- [Spec 5 PM role](../5-pm-role/spec.md) and [spec 6 Provider logins](../6-provider-logins/spec.md): postponed/paused; this map only notes where the reshape changes or obsoletes them.
- Running toddler off macOS.
