---
title: logTail and full verify output
labels: [parallel-safe]
blocked_by: []
parent: 8
status: closed
---
When `verify` fails, the output says why, cut and cleaned so it is safe to hand to an agent or store in `state.json`.

1. **One function, `logTail(text)`**, does all cutting and cleaning. Caps are constants, not config:
   - per check: the last 200 lines, at most 16 KB after cleaning, cut on a line and UTF-8 boundary, under a header `[… N earlier lines cut]`;
   - in total: 48 KB. Checks are taken in the given order, each with its tail until the budget runs out; the rest get name + link only, closed by `[N more failing checks: names only]`. Matrix jobs failing the same way are not merged.
2. **Cleaning**: ANSI escapes and control characters (keep `\n`, `\t`); `\r` redraws (keep the text after the last `\r` on each line); the `job\tstep\ttimestamp` prefix `gh run view --log-failed` adds and GitLab's section markers; a fixed list of secret patterns replaced with `[redacted]`: `ghp_`/`gho_`/`ghs_`/`github_pat_`, `glpat-`, `sk-ant-`, `sk-`, `AKIA…`, `xox[bp]-`, PEM `-----BEGIN … PRIVATE KEY-----` blocks, `Authorization: Bearer …`. No entropy heuristics.
3. **Stage `verify`** captures stdout and stderr together and keeps the output on failure as one check named after the command, run through `logTail`. Today the runner throws `Host-required verification failed` and drops it, and only reads stdout.
4. **Fencing helper**: a tail goes in a fence one backtick longer than the longest backtick run inside it.

- [ ] A failing stage `verify` leaves its cleaned stdout+stderr in the job's error / log, not just "verification failed"
- [ ] One table-driven `logTail` test covers: ANSI, `\r` redraws, the `gh` prefix and GitLab section markers, the line cap, the byte cap landing on a multibyte character, each redaction pattern, a SHA that must not be redacted, the 48 KB total across several checks, a fence-breaking backtick run

Decision record: [81](81-ci-log-tails.md).
