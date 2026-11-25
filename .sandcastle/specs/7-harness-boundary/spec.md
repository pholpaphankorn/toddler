---
title: Harness boundary
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 7`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A decision record that sorts every toddler feature into **keep as code**, **delegate to the agent** (Claude Code / Codex, through its own features or ordinary commands), or **cut**, with the rule that decides, and a yes/no on handing a batch of issues to one orchestrator session that works them with its own subagents. Reshape specs follow from it, one per area, as separate maps.

## Notes

- Started 2026-11-24 from phol's experience that Claude Code already spawns and orchestrates subagents; toddler should not reinvent what the harnesses do.
- **Reset 2026-11-24: nothing is settled.** Charting first recorded four "settled" notes: the five guarantees (queue-driven unattended runs, a Seatbelt sandbox per stage, cross-provider review, quota stops, only verified + approved work leaves the sandbox) stay as code; scheduling batch-vs-per-issue as the core question; Codex as a full equal; token savings as a weak reason. phol dropped all four: every feature, guarantees included, is discussed from empty, one ticket at a time, at phol's pace. They are open questions now, not premises.
- Tracker: these files, same conventions as [spec 4](../4-quota-aware-scheduling/spec.md). Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by`.
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider**, **Role**, **Agent**, **Tracker**, **Forge**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), codebase-design for where seams go.

## Decisions so far

- [Quota stops: keep, delegate, or drop](issues/67-quota-stops.md): kept as code with polling and live cancels; stop conditions kept and open to non-quota reasons later; new: a provider-limit failure counts as a quota stop, stops lift when quota recovers, and the runner sleeps to the next reset instead of exiting; continuation is from the preserved worktree.
- [One provider builds, the other reviews: keep, delegate, or drop](issues/66-cross-provider-review.md): review stage and round loop stay; the reviewer is picked by quota left and may be the same provider, in its own fresh session; no in-session subagent review; Codex stays a full equal for capacity; verdict parsing stays code.
- [A Seatbelt sandbox per stage: keep, delegate, or drop](issues/65-sandbox-per-stage.md): kept as code, one sandbox and fresh worktree per agent; agents run with their own guards off, so it guards against agent mistakes and untrusted issue text; not widened for subagents; API-key stripping and stop-on-cancel stay; `smoke-agents` cut, `smoke-seatbelt` kept.
- [Unattended runs from a queue: keep, delegate, or drop](issues/64-unattended-queue.md): kept as code; phol starts `toddler run` and walks away; approved work lands one at a time through toddler's queue, and a merge fix loop (`maxMergeFixRounds`, default 10) sends conflicts and CI failures back to the agent; a stuck issue blocks only its dependents.
- [One orchestrator session per batch or one session per issue](issues/62-orchestrator-session.md): one session per issue stays; toddler runs up to `maxParallelIssues` at once (`parallel-safe` label kept, several sessions per provider allowed); subagents only inside one issue.
- [Rule for code, harness or cut](issues/61-code-or-harness-rule.md): guards → code; not missed → cut; needs thinking and the agent can do it → agent, with a code check where a wrong result matters; otherwise deterministic → code ([ADR 0001](../../../docs/adr/0001-code-agent-or-cut.md)). Ranking stays, reshaped to split work by quota left.
- [What Sandcastle already does that toddler duplicates](issues/60-sandcastle-coverage.md): 0.14.0 gives sandbox, worktrees and provider adapters only, nothing toddler builds on top; the 1.0 pre-release adds spec orchestration, in-sandbox PRs and a one-round review, but no quota handling and against toddler's host-only-push guarantee.
- [What Codex can orchestrate headless in Seatbelt](issues/59-codex-headless-orchestration.md): subagents are on by default but model-driven, share one checkout (no per-worker branch), can pick their own model, and show only partly in `--json`; toddler cannot drive them, so per-issue fan-out still means one `codex exec` per worker.
- [What Claude Code can orchestrate headless in Seatbelt](issues/58-claude-headless-orchestration.md): parallel subagents with own prompts and fresh context work under `-p`, and stream-json reports each one; but Claude's built-in worktree isolation writes where the sandbox can't, so per-issue branches need toddler (or a hook) to place worktrees; subagents share quota.
- [Inventory of toddler's features](issues/57-feature-inventory.md): 37 features in ~3.6k lines; the guarantee code (sandbox, gates, verify, exact-SHA push) is ~250 lines in `runStage`/`publish` plus ~430 of quota; the biggest no-guarantee blocks are forge/tracker beyond push (~650), ranking, skills/doctor/setup, and scheduling (~280).

## Not yet specified

- Classifying the remaining features with the rule: bundled skills and skill doctor, state/resume, `doctor`/`setup`/`smoke`, role prompts and workflow rules.

## Out of scope

- Implementing the reshape: each area gets its own spec after this map.
- [Spec 5 PM role](../5-pm-role/spec.md) and [spec 6 Provider logins](../6-provider-logins/spec.md): postponed/paused; this map only notes where the reshape changes or obsoletes them.
- Running toddler off macOS.
