---
title: Inventory of infant's features
labels: [wayfinder:task, on-hold]
blocked_by: []
parent: 7
status: closed
assignee: claude
---
## Question

List every infant feature (CLI commands, runner stages, sandbox/worktree handling, install/format/verify, trackers, forges, auto-merge, ranking, quota reads and stops, review loop, concurrency, state/resume, skills and skill doctor, prompts and workflow rules, setup/doctor/smoke). For each: owning file and functions under [src/](../../../../src/) or [scripts/](../../../../scripts/), rough line count, tests that cover it, and which guarantee in the map's Notes it supports, if any. Output a table in the answer; no judgement on keep/cut yet.

## Answer

Done 2026-11-24 by reading `src/`, `scripts/`, `prompts/` and `tests/` at `b3a25f4`. Line counts are rough (whole file or function span). Guarantees, from the map's Notes at the time (dropped in the 2026-11-24 reset; the tags show what each row supports today, not that it must stay): **G1** unattended runs from a queue · **G2** every stage in its own Seatbelt sandbox · **G3** one provider builds, the other reviews · **G4** quota stops · **G5** only work that passed `verify` and an approving review leaves the sandbox.

Total: ~3.6k lines in `src/` + `scripts/`; ~3.7k lines of tests, 2k of them in `workflow.test.ts`.

| # | Feature | Owner | ~Lines | Tests | Guarantee |
|---|---|---|---|---|---|
| 1 | CLI entry and modes (`run`, `plan`, `init`, `setup`, `doctor`, `smoke`) | `main.ts` `main` | 150 | none direct | G1 |
| 2 | `init`: detect GitHub/GitLab/none, write config | `main.ts` `init` | 60 | config-forge "init detects…" | none |
| 3 | `setup`: wizard for GitHub auth, Codex and Claude sign-in | `scripts/setup.sh` | 245 (≈160 is generated wizard library) | none | none |
| 4 | `doctor`: ranking, stop modules, forge, skills, logins checks | `main.ts` `doctor`, `forge.ts` `*.doctorChecks`, `skill-doctor.ts` | 90 + 90 + 134 | forge/gitlab doctor tests, skill-doctor, workflow "doctor reports…" ×2 | none |
| 5 | `smoke`: one real model call per role in the sandbox; Seatbelt smoke without models | `scripts/smoke-agents.ts`, `scripts/smoke-seatbelt.ts` | 124 + 90 | none (they are the checks) | G2 |
| 6 | `plan`: dry-run printing quotas and next assignments | `main.ts` plan branch | 35 | none | none |
| 7 | Config: defaults, project config, role overrides, validation | `config.ts` `loadConfig`, `defaults`, `modelsForProvider` | 270 | config-forge, roles-config, workflow "project config overrides…" | supports all |
| 8 | Run preconditions: clean tree, push-remote validation, runner lock, SIGINT/SIGTERM stop | `main.ts` run branch, `forge.ts` `validatePushRemote` | 60 + 25 | push-remote | G1, G5 |
| 9 | Main loop: refresh base + quota, pick batch, run pipelines, stop when nothing left | `runner.ts` `run`, `candidates` | 70 | workflow "no available issue…", "each round refreshes the base", "runner uses tracker and forge seams…" | G1 |
| 10 | Scheduling: ready filter, blocked labels, `parallel-safe` second pipeline | `policy.ts` `ready`, `assignments`, `labels` | 35 | workflow "one issue prefers Codex…", "configured order assigns both parallel issues…" | G1 |
| 11 | Ranking: built-in quota ranker + project ranker module | `policy.ts` `loadRanker`, `makeRanker`, `ranked` | 85 | workflow ranker tests ×5, "quota ranking compares…" | none |
| 12 | Concurrency: one session per provider×role slot, queued | `runner.ts` `stage` | 20 | workflow "same provider/role sessions queue…" | none |
| 13 | Per-issue pipeline: implement → review → changes-requested loop, round limit, provider fallback, pause on error | `runner.ts` `work` | 160 | workflow "implementation -> opposite-provider review…", "changes requested runs a fix…", "quota interruption transfers…", "review selection uses…" | G1, G3 |
| 14 | Cross-provider reviewer choice (same-provider fallback when one is out) | `policy.ts` `reviewer` | 10 | workflow "opposite-provider review…", "single provider reviews itself…" | G3 |
| 15 | Review report parsing: exactly one verdict, no findings on approve | `policy.ts` `reviewReport` | 20 | workflow "review approval requires exactly one valid verdict…" | G3, G5 |
| 16 | Sandbox stage: Seatbelt sandbox + worktree per stage, env scrubbing (no forge/API tokens), read-only skills mount | `runner.ts` `runStage`, `main.ts` seatbelt setup | 40 + 30 | workflow "Sandcastle stage uses the requested model…" | G2 |
| 17 | Sandbox install from lockfile | `runner.ts` `runStage` | 6 | workflow "Sandcastle stage…" | G2 |
| 18 | Agent setup: private home, Codex `auth.json` / Claude OAuth token into sandbox | `agents.ts` `privateHomeAgent`, `runner.ts` `runStage`, `quota.ts` `codexAuth`, `claudeToken` | 35 + 20 + 40 | skills "both private home layouts", smoke | G2 |
| 19 | Agent stop on cancel (no surviving shell commands) | `agents.ts` `stopAgent` | 20 | agent-stop | G2, G4 |
| 20 | Post-stage gates: branch unchanged, tree clean, reviewer made no commits, commits descend from base, non-empty | `runner.ts` `runStage` | 35 | workflow "reviewer commit mutation is rejected…", "malformed review and changed reviewed SHA…" | G5 |
| 21 | Format after implementation, commit result | `runner.ts` `runStage` | 20 | workflow "implementation stages run the formatter…" | none (hygiene) |
| 22 | Host-config `verify` inside sandbox | `runner.ts` `runStage` | 12 | workflow "Sandcastle stage…", "pull request reports verification passed…" | G5 |
| 23 | Base-conflict check, send back to implementer (marked temporary) | `runner.ts` `conflicted` | 25 | workflow "a conflict with the moved base…", "merge-tree failure…" | none |
| 24 | Publish: refuse if branch moved since review, push exact reviewed SHA, open PR/MR with generated body | `runner.ts` `publish`, `forge.ts` `openRequest` (GitHub/GitLab) | 45 + 35 + 25 | workflow "implementation -> … -> push exact SHA -> PR", forge/gitlab open tests | G5 |
| 25 | Auto-merge: GitHub/GitLab enable, offline fast-forward queue | `forge.ts` `enableAutoMerge` ×3, `runner.ts` `fastForward`, `fastForwardBase` | 40 + 50 | workflow "refused auto-merge…", "auto-merge is enabled…", "offline auto-merge…", "concurrent offline approvals…"; forge/gitlab auto-merge tests | none |
| 26 | Files tracker: spec + issue frontmatter, `blocked_by`, open set | `forge.ts` `FilesTracker`, `localIssue` | 130 | forge "files tracker…" ×3, workflow "local issues…" ×2 | none |
| 27 | GitHub tracker + forge: sub-issues, native blockers, comments, base fetch, PR find/open | `forge.ts` `GitHubForge` | 260 | forge.test.ts GitHub tests ×7 | G5 (host-only push) |
| 28 | GitLab tracker + forge: iids, native and body blockers, MR find/open | `forge.ts` `GitLabForge` | 215 | gitlab.test.ts ×7 | G5 (host-only push) |
| 29 | No-forge mode: local branches only | `forge.ts` `NoneForge`, `connect` | 50 | forge "none forge doctor…" | none |
| 30 | Quota reads: Codex RPC rate limits, Claude usage endpoint, validation, staleness, per-model weekly buckets | `quota.ts` `readUsage`, `codexUsage`, `claudeUsage`, `validateUsage`, `weeklyLeft`, `modelMatches`; `process.ts` `codexRpc` | 230 + 60 | workflow "Claude parses limits…", "Codex identifies windows…", "quota validation…", "unknown quota fails closed" | G4 |
| 31 | Quota stops: thresholds, custom stop modules, 60s polling, abort live sessions per provider/model | `quota.ts` `Quotas`, `thresholdCondition`, `loadStopConditions` | 200 | workflow stop tests ×13 (lines 37–869) | G4 |
| 32 | State and resume: `state.json` jobs, sticky implementer, `lastError` pause | `runner.ts` `loadState`, `saveState`, `persist`, `work` | 30 | workflow "resumed implementer remains sticky", "quota interruption transfers…" | G1 |
| 33 | Logs per stage | `runner.ts` `runStage` | 10 | none | none |
| 34 | Prompt assembly: role prompt, rules, project notes, skills, issue + comments, feedback, conflict note | `runner.ts` `prompt`, `context`, `skillInstructions`, `work`; `prompts/*.md` | 40 + 32 prompt lines | workflow "stage prompts assemble…", "role prompt override…", "stage prompts explicitly load…" | G3 (rules forbid push/merge, untrusted issue text) |
| 35 | Bundled skills: index, per-role selection, links into private home | `skills.ts` | 79 | skills.test.ts ×4 | none |
| 36 | Skill vendoring from upstream repos | `scripts/vendor-skills.sh`, `vendor/skills.json` | 59 | vendor-skills | none |
| 37 | Subscription-only env (strip API keys for host calls) | `process.ts` `subscriptionEnv`, `command`, `adapter` | 30 | none direct | G2 |

Facts later tickets lean on:
- The guarantee code is small and concentrated: rows 16–20, 22, 24 (G2/G5) are ~250 lines inside `runStage` and `publish`; G4 is ~430 lines of `quota.ts`.
- The largest blocks with **no** guarantee are the forge/tracker modules beyond push (rows 25–29, ~650 lines), ranking (row 11), skills + doctor + vendoring (rows 4, 35, 36), and setup (row 3).
- Scheduling (rows 9, 10, 12, 13) is ~280 lines and is what [One orchestrator session per batch or one session per issue](62-orchestrator-session.md) decides.
- `conflicted` is already marked a temporary patch to remove with spec 5.
