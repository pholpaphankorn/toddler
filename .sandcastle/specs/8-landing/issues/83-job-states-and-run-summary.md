---
title: Job states, needs attention and the run summary
labels: [parallel-safe]
blocked_by: []
parent: 8
status: open
---
A run ends by telling phol what landed, what waits on them and what needs attention, and every job's state says which phase it is in and, separately, whether it needs attention.

1. **`status` is the phase only**: `implementation | review | approved | landing | landed`. `done` becomes `landed` (the files tracker's blocker check reads `landed`); `pr` goes. Until landing exists, a job that opened a PR with auto-merge is `landing` with `pr` set; without auto-merge it stays `approved` with `pr`.
2. **Needs attention is a separate field**, `attention?: { reason, detail, log?, at }`. Set means skipped for the rest of the run. It is cleared **when the retry starts** (the job takes a slot or landing re-polls it), not on load. Reasons: `stage-failed | review-cap | merge-fix-cap | review-required | request-closed | auto-merge-off | refused`; `stage-failed` carries the stage's `log` path. Host faults (git broken, `state.json` unwritable, runner lock lost) are never a reason; they end the run.
3. **Counter fields**: `rounds` becomes `reviewRounds`. Add `mergeFixRounds: number` (from 0) and `mergeFix?: { trigger: "conflict" | "ci-failed" | "verify", base?, checks?: { name, link, tail? }[], output? }` (used from #87). Retrying a capped job resets only the counter that hit its cap.
4. **Fields that go**: `lastError` (→ `attention`), `conflictBase` (→ `mergeFix`). Everything else stays.
5. **Old `state.json` translated on load**, written back at the next save, no version field (a missing `mergeFixRounds` marks an old file): `done` → `landed`; `pr` → `landing` (forge with `autoMerge`) or `approved`; `lastError` → `attention { reason: stage-failed, detail }`; `conflictBase` → `mergeFix { trigger: conflict, base }`; `rounds` → `reviewRounds`; `mergeFixRounds` = 0.
6. **Run summary** at the end of every run: the stop reason on one line, then **landed this run**, **waiting on you** (approved with a non-auto-merge PR url, or a local approved branch), **needs attention** (`#n reason: detail (log path)`). Still-blocked issues are not listed. Exit code 1 when anything needs attention.

- [ ] A failed stage marks its issue `attention: stage-failed` with the log path, and the summary lists it
- [ ] Old `state.json` fixtures under `tests/fixtures/state/` (`pr`/`done`, `rounds`, `lastError`, `conflictBase`) each translate as above
- [ ] The run summary's text and exit code are asserted: exit 1 when any issue needs attention, exit 0 when issues are only waiting on you (phol, 2026-11-26: [79](79-job-states.md) holds over [80](80-landing-tests.md))
- [ ] `attention` survives a run that never retries the issue

Decision record: [79](79-job-states.md).
