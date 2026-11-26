---
title: Job states, state.json fields and the run summary
labels: [wayfinder:grilling, on-hold]
blocked_by: [75, 77]
parent: 8
status: closed
assignee: claude
---
## Question

Settled in [State, resume and logs](../../7-harness-boundary/issues/71-state-resume.md): needs attention becomes an explicit job status with a reason (failed stage, review round cap, merge fix cap, human review required), skipped for the rest of the run and retried by the next `toddler run`; the reason includes the failing stage's log path; the end-of-run summary lists each one; the merge fix counter and "waiting on auto-merge" live in `state.json`.

Decide the shapes: the `Job.status` values after the reshape (today `implementation | review | approved | pr | done`) and how a needs-attention job remembers where to resume; the new fields and which old ones go (`lastError`, `conflictBase`, the in-memory `attempted` set); and what the run summary prints.

## Answer

Settled with phol 2026-11-26.

- **`status` is the phase only**: `implementation | review | approved | landing | landed`. `done` becomes `landed` (the files tracker's blocker check reads `landed`); `pr` goes. Waiting on auto-merge is `landing` with `pr` set. A request without auto-merge, or a local run without `autoMerge`, stays `approved` (with `pr` when there is one); the next run's landing polls it, so a PR merged by hand becomes `landed`. A merge fix round runs as `implementation`/`review` with `mergeFix` set.
- **Needs attention is a separate field**, `attention?: { reason, detail, log?, at }`; set means needs attention, skipped for the rest of the run. The next `toddler run` retries it: `attention` is cleared **when the retry starts** (the job takes a slot, or landing re-polls it), not on load, so an issue that never gets retried keeps its old reason in `state.json` and the summary. An unfixed problem costs at most one more attempt per run: forge reasons re-flag on the first poll with no agent run, `stage-failed` costs one stage, a cap costs one more cap cycle.
- **Reasons**: `stage-failed | review-cap | merge-fix-cap | review-required | request-closed | auto-merge-off | refused`, each with a `detail` line (the forge's refusal, "auto-merge was turned off on <url>", …) and, for `stage-failed`, the stage's `log` path. Host faults (git broken, `state.json` unwritable, runner lock lost) are never a reason; they end the run.
- **Merge fix fields**: `mergeFixRounds: number` (from 0) and `mergeFix?: { trigger: "conflict" | "ci-failed" | "verify", base?: sha, checks?: { name, link, tail? }[], output?: string }`, the current round's trigger, cleared on approval. `base` is landing's pinned SHA, so a resume without `MERGE_HEAD` redoes `git merge --no-commit` on it. `rounds` becomes `reviewRounds`, reset to 0 at the start of each merge fix round.
- **Retrying a capped job** resets only the counter that hit its cap (`reviewRounds` or `mergeFixRounds`); the others keep their history.
- **Fields that go**: `lastError` (→ `attention`), `conflictBase` (→ `mergeFix`), the in-memory `attempted` set (→ job state). Everything else stays: `verification`, `feedback`, `report`, `reviewer` (PR body only), `reviewedSha`, `implementationSha`, `baseSha`.
- **Run summary**, printed at the end of every run: the stop reason on one line ("no provider has quota", "nothing ready", …), then **landed this run**, **waiting on you** (approved with a non-auto-merge PR url, or a local approved branch), **needs attention** (`#n reason: detail (log path)`). Still-blocked issues are not listed. Exit code 1 when any issue needs attention.
- **Old `state.json` files are translated on load** and written back at the next save; no version field (a missing `mergeFixRounds` marks an old file): `done` → `landed`; `pr` → `landing` (forge with `autoMerge`) or `approved` (without); `lastError` → `attention { reason: stage-failed, detail }`; `conflictBase` → `mergeFix { trigger: conflict, base }`; `rounds` → `reviewRounds`; `mergeFixRounds` starts at 0. This settles the map's fog "Moving existing `state.json` files".
