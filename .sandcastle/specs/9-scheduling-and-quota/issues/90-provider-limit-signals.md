---
title: What each CLI reports when a session hits the provider's own limit
labels: [wayfinder:research, adult]
blocked_by: []
parent: 9
status: closed
assignee: claude (research subagent)
---
## Question

When a headless session hits the subscription's own usage limit (five-hour, weekly, or a per-model weekly bucket) before toddler's quota reading shows a stop, what do the CLIs report, so toddler can tell it apart from an ordinary failed stage?

1. **Claude Code** `claude -p --output-format stream-json`: exit code, the final `result` message (`subtype`, `is_error`, any error type), stderr text, and whether a reset time is given. Same for a subagent hitting the limit mid-session.
2. **Codex** `codex exec --json`: exit code, the error event shape (e.g. `usage_limit_reached`, `rate_limits` payloads), stderr text, reset time.
3. How each looks through `@ai-hero/sandcastle` 0.14.0's provider adapters (what toddler actually receives from `sandbox`/agent run).
4. Codex's `ordinaryUsageAllowed` in `account/rateLimits/read`: what it means and when it flips relative to the percentages.

Cite CLI versions and source/docs; mark anything not reproduced live.

## Answer

Researched 2026-11-26 from first-party source only (Claude Code 2.1.306 binary, Codex `rust-v0.163.0`, installed sandcastle 0.14.0); nothing reproduced live, no quota exhausted. Full findings: `docs/research/provider-limit-signals.md` on local branch `research/provider-limit-signals` (commit `e97c55d`, not pushed).

1. **Claude**: the refused turn is an assistant message with `error: "rate_limit"` (shared with ordinary throttling); the specific signal is `api_error: "usage_limit_reached"` with `api_error_params.rate_limit_info { rateLimitType (five_hour, seven_day, seven_day_opus, …), resetsAt }` (unix seconds), copied onto the final `result` (`subtype: "success"`, `is_error: true`, human text with local reset time); exit 1. `rate_limit_event` frames (`allowed_warning`, `rejected`, `utilization`, `resetsAt`) can warn earlier. Subagent hitting the limit: same frame with `parent_tool_use_id` (inferred). Unverified: whether the internal fields always appear, stderr, retries.
2. **Codex**: `usage_limit_reached` 429 is not retried; `--json` emits `{"type":"error","message":"You’ve hit your usage limit… Try again at <local time>."}` then `turn.failed`; the code, `resets_at` and rate-limit data are dropped, so the message text is the only signal; exit 1 like any failure. stderr not traced.
3. **Through sandcastle**: its parsers drop `rate_limit_event`, `api_error` and `subtype`; both arrive as an untyped `AgentError` `"<provider> exited with code 1:\n<detail>"` (stderr tail if any, else stream error/result text, so Codex stderr can hide the limit text). Today `runner.ts` treats it as any failure. Without a sandcastle change, the file-logging `onAgentStreamEvent` callback sees every raw stdout line, so toddler can read Claude's typed fields; for Codex only text matching or a quota re-read after the failure.
4. **`ordinaryUsageAllowed`**: Codex's backend `rate_limit.allowed` for the main `codex` bucket, passed through (null if no main bucket); not derived from percentages, and Codex's own clients are told not to infer recovery from percentages or reset times. Covers ordinary included usage only (per-model buckets inferred not to). When it flips is undocumented. `quota.ts` doesn't read it.
