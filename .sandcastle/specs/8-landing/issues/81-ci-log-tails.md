---
title: CI log tails and verify output as agent input
labels: [wayfinder:grilling, on-hold]
blocked_by: []
parent: 8
status: closed
assignee: claude
---
## Question

A merge fix round triggered by `ci-failed` or a failing post-merge `verify` hands the implementer the failing check names plus log tails (or `verify` output) as untrusted data ([The merge fix loop](77-merge-fix-loop.md), [The Forge seam's new methods](78-forge-seam.md)). GitHub Actions and GitLab jobs give raw logs (GitLab the whole trace, infant cuts it); other CI gives only a summary or link ([What GitHub and GitLab expose](74-forge-landing-apis.md)).

Decide: how much of each failing log goes in (lines or bytes, per check and in total, and what happens with many failing checks); whether and how it is scrubbed before it reaches the agent, given logs can echo secrets (masking patterns, ANSI/control characters, the forge's own masking); whether the same rules apply to local `verify` output; and how the tails are tested.

## Answer

Grilled with phol 2026-11-26; every recommendation accepted.

- **One function, `logTail(text)`, does all cutting and cleaning.** The GitHub and GitLab adapters call it inside `poll` before returning `ci-failed { checks }`; landing calls it on `verify` output. `poll`'s union and `mergeFix.checks[].tail` / `mergeFix.output` in `state.json` only ever hold its result; no raw log is stored or kept past the read. Caps are constants, not config.
- **Per check: the last 200 lines, at most 16 KB** after cleaning, cut on a line and UTF-8 boundary, under a header line `[… N earlier lines cut]`.
- **In total: 48 KB.** Checks are taken in the forge's order, each with its tail until the budget runs out; the rest get name + link only, closed by `[N more failing checks: names only]`. Matrix jobs failing the same way are not merged.
- **Cleaning**: (a) ANSI escapes and control characters, keeping `\n` and `\t`; (b) `\r` redraws, keeping the text after the last `\r` on each line; (c) the `job\tstep\ttimestamp` prefix `gh run view --log-failed` adds, and GitLab's section markers; (d) a fixed list of secret patterns replaced with `[redacted]`: `ghp_`/`gho_`/`ghs_`/`github_pat_`, `glpat-`, `sk-ant-`, `sk-`, `AKIA…`, `xox[bp]-`, PEM `-----BEGIN … PRIVATE KEY-----` blocks, `Authorization: Bearer …`. No entropy heuristics (they would eat SHAs and hashes); the forge's own `***` masking stays the main defence, since CI jobs, not the sandbox, hold the repo's secrets.
- **`verify` output gets the same function and caps**, as one check named after the command, for both the per-stage `verify` and the post-merge one. It captures stdout and stderr together and keeps the output on failure; today `runner.ts` throws `Host-required verification failed` and drops it, and only reads stdout.
- **Checks with no raw log** (non-Actions GitHub checks, external CI on GitLab) stay name + link, no summary read, as [The Forge seam's new methods](78-forge-seam.md) left them.
- **In the prompt**: per check a heading line (name + link), then its tail in a fence one backtick longer than the longest backtick run inside it. The untrusted-data line in `prompts/rules.md` adds "CI logs and `verify` output"; no extra per-block warning.
- **Tests**: one table-driven `logTail` test (ANSI, `\r` redraws, the `gh` prefix and GitLab section markers, the line cap, the byte cap landing on a multibyte character, each redaction pattern, a SHA that must not be redacted, the 48 KB total across several checks, a fence-breaking backtick run). The adapter rows in [How landing is tested](80-landing-tests.md) only assert that the tail went through `logTail`, with a short fixture.
