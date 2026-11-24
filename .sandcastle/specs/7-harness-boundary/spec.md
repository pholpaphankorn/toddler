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
- **Reset 2026-11-24: nothing is settled.** Charting first recorded four "settled" notes: the five guarantees (queue-driven unattended runs, a Seatbelt sandbox per stage, cross-provider review, quota stops, only verified + approved work leaves the sandbox) stay as code; scheduling batch-vs-per-issue as the core question; Codex as a full equal; token savings as a weak reason. phol dropped all four: every feature, guarantees included, is discussed from empty, one ticket at a time, at phol's pace. They are open questions now, not premises.
- Tracker: these files, same conventions as [spec 4](../4-quota-aware-scheduling/spec.md). Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by`.
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Forge**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), codebase-design for where seams go.

## Decisions so far

- [What Sandcastle already does that toddler duplicates](issues/60-sandcastle-coverage.md): 0.14.0 gives sandbox, worktrees and provider adapters only, nothing toddler builds on top; the 1.0 pre-release adds spec orchestration, in-sandbox PRs and a one-round review, but no quota handling and against toddler's host-only-push guarantee.
- [What Codex can orchestrate headless in Seatbelt](issues/59-codex-headless-orchestration.md): subagents are on by default but model-driven, share one checkout (no per-worker branch), can pick their own model, and show only partly in `--json`; toddler cannot drive them, so per-issue fan-out still means one `codex exec` per worker.
- [What Claude Code can orchestrate headless in Seatbelt](issues/58-claude-headless-orchestration.md): parallel subagents with own prompts and fresh context work under `-p`, and stream-json reports each one; but Claude's built-in worktree isolation writes where the sandbox can't, so per-issue branches need toddler (or a hook) to place worktrees; subagents share quota.
- [Inventory of toddler's features](issues/57-feature-inventory.md): 37 features in ~3.6k lines; the guarantee code (sandbox, gates, verify, exact-SHA push) is ~250 lines in `runStage`/`publish` plus ~430 of quota; the biggest no-guarantee blocks are forge/tracker beyond push (~650), ranking, skills/doctor/setup, and scheduling (~280).

## Not yet specified

- How cross-review and requested-changes rounds work under the scheduling answer (per-issue loop vs batch phases; how a review's changes route back to one issue's branch).
- A cheap prototype of an orchestrator session (prompt + one real batch) to react to.
- Classifying the remaining features once the rule exists: ranking, bundled skills and skill doctor, state/resume, `doctor`/`setup`/`smoke`, role prompts and workflow rules.
- What a quota stop means when one session holds a whole batch.

## Out of scope

- Implementing the reshape: each area gets its own spec after this map.
- [Spec 5 PM role](../5-pm-role/spec.md) and [spec 6 Provider logins](../6-provider-logins/spec.md): postponed/paused; this map only notes where the reshape changes or obsoletes them.
- Running toddler off macOS.
