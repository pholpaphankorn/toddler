---
title: Landing
labels: [wayfinder:map, on-hold]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 8`. All carry `on-hold` so `toddler` never tries to implement them. -->

## Destination

A spec, ready to break into toddler issues, for how approved work lands: the run loop's shape and idle states, the one landing path (host merges the base, `verify`, exact push) for local and forge, the merge fix loop, the forge additions for GitHub, GitLab and local mode, and the needs-attention state with the run summary.

## Notes

- First reshape area after [spec 7 Harness boundary](../7-harness-boundary/spec.md). Settled there, not reopened here: [Unattended runs from a queue](../7-harness-boundary/issues/64-unattended-queue.md), [What may leave the sandbox, and who pushes it](../7-harness-boundary/issues/68-what-leaves-the-sandbox.md), [Forge and tracker modules](../7-harness-boundary/issues/63-forge-tracker-modules.md), [State, resume and logs](../7-harness-boundary/issues/71-state-resume.md), and the merge fix part of [Role prompts, workflow rules and prompt assembly](../7-harness-boundary/issues/73-prompts-rules.md). Tickets here decide *how*, not *whether*.
- **This map owns the run loop's shape** (phol, 2026-11-25). "Every provider is stopped → sleep until the next reset" and "a provider is picked at each stage start" are left as slots for spec 9 (Scheduling) to fill; this map does not decide ranking or quota.
- Known bug fixed inside this spec, not separately (phol, 2026-11-25): a failed local fast-forward ends in `done` ([runner.ts](../../../src/runner.ts) `publish` → `fastForward`). Also replaced here: the temporary `conflicted()` patch, which sends base conflicts to the implementer and counts them against `maxReviewRounds`.
- Code today: [runner.ts](../../../src/runner.ts) (`work`, `publish`, `conflicted`, `fastForwardBase`, `run`: batches wait on `Promise.allSettled`, no slots), [forge.ts](../../../src/forge.ts) (`Forge` seam: `base`, `findRequest`, `openRequest`, `enableAutoMerge`, `doctorChecks`; GitHub, GitLab, `NoneForge`). `verify` runs inside the stage's sandbox (`sandbox.exec`), not on the host.
- Tracker: these files, same conventions as spec 7. Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by` (works across specs). Ticket numbers continue from spec 7 (74+).
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Landing**, **Needs attention**, **Forge**, **Tracker**, **Provider**, **Role**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), codebase-design for the forge seam and where the landing watcher lives.

### The other reshape areas (split agreed with phol 2026-11-25)

1. **Landing**: this map.
2. **Scheduling and quota** (spec 9, its own map, after this one): ranker contract with `running`, `balanced`/`most-quota`, provider picked at each stage start, sticky implementer, reviewer re-picked each round, `maxParallelIssues` slots, provider-limit failure as a quota stop, stops lift and the runner sleeps to the next reset; plus `plan`'s preview and `doctor`'s ranking row. From [How work is split across providers by quota left](../7-harness-boundary/issues/69-provider-split.md), [One orchestrator session per batch or one session per issue](../7-harness-boundary/issues/62-orchestrator-session.md), [One provider builds, the other reviews](../7-harness-boundary/issues/66-cross-provider-review.md), [Quota stops](../7-harness-boundary/issues/67-quota-stops.md).
3. **Repo kit and cleanup**: plain implementation issues, no map. `setup`'s planning kit (and `init` back to config only) and the toddler block in `AGENTS.md`/`CLAUDE.md`; `setup`'s `glab` step; the `doctor` row for spec children missing `issueLabel`; skill doctor cut into one repo test; role prompts trimmed and project notes cut. From [doctor, setup, init, plan and smoke](../7-harness-boundary/issues/72-cli-modes.md), [Bundled skills, vendoring and skill doctor](../7-harness-boundary/issues/70-skills.md), [Role prompts, workflow rules and prompt assembly](../7-harness-boundary/issues/73-prompts-rules.md).
- Spec 7 leftovers with no area yet: Codex's `setsid()` shell commands may survive a process-group SIGTERM ([A Seatbelt sandbox per stage](../7-harness-boundary/issues/65-sandbox-per-stage.md)); how subagents inside one issue get branches (same ticket).

### Where the reshape touches paused specs

- [Spec 5 PM role](../5-pm-role/spec.md) (postponed): Landing touches nothing. Repo kit gives planning outside toddler a kit from `setup`; Scheduling would pick a PM role's provider like any other role. The `conflicted()` comment "Remove with spec 5" is now this map's job.
- [Spec 6 Provider logins](../6-provider-logins/spec.md) (paused): Landing touches nothing. Repo kit's `setup` keeps local logins alongside standalone ones (note already added to spec 6 by spec 7).

## Decisions so far

- [What GitHub and GitLab expose for mergeability, CI logs and auto-merge](issues/74-forge-landing-apis.md): all four additions are readable with the host's `gh`/`glab` login, one read per poll; raw CI logs only for GitHub Actions and GitLab jobs (other CI gives a summary or link); a GitLab source push aborts auto-merge, so the host re-enables it; a human review is read separately from mergeability on GitHub; three behaviours still need a real-repo check.
- [The run loop's shape and its idle states](issues/75-run-loop-shape.md): one event loop; per-issue work ends at approved and frees its slot; landing is its own module emitting landed / merge fix / needs attention; merge fixes take a slot ahead of fresh issues; a run ends only when landing is empty; failures stay with their issue; spec 9 fills `pick` and `wakeAt`; on resume the forge or git, not `state.json`, says what landed.

## Not yet specified

- **CI log tails as agent input**: how much of a failing log to hand over, and whether to scrub it (logs can echo secrets). Research: GitHub Actions and GitLab jobs give raw logs (GitLab the whole log, toddler cuts the tail); other CI gives only a summary or link.
- **How landing is tested**: a fake forge for the merge fix loop and auto-merge waits, versus real `smoke` against a scratch repo. Depends on the forge seam's shape.
- **Moving existing `state.json` files**: jobs carrying `lastError`, `conflictBase` or status `pr` from today's runs. Depends on the job states ticket.

## Out of scope

- Ranking, provider picks, `maxParallelIssues` and quota sleeps: spec 9 (Scheduling and quota); this map only leaves the slots.
- Repo kit and prompt trimming: plain issues (area 3 above).
- Reading human review comments on PRs ([Forge and tracker modules](../7-harness-boundary/issues/63-forge-tracker-modules.md)).
- The forge's own merge queue or merge trains: landing is toddler's own queue ([Unattended runs from a queue](../7-harness-boundary/issues/64-unattended-queue.md)).
