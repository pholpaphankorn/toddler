---
title: What each CLI reports when a session hits the provider's own limit
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 9
status: open
---
## Question

When a headless session hits the subscription's own usage limit (five-hour, weekly, or a per-model weekly bucket) before toddler's quota reading shows a stop, what do the CLIs report, so toddler can tell it apart from an ordinary failed stage?

1. **Claude Code** `claude -p --output-format stream-json`: exit code, the final `result` message (`subtype`, `is_error`, any error type), stderr text, and whether a reset time is given. Same for a subagent hitting the limit mid-session.
2. **Codex** `codex exec --json`: exit code, the error event shape (e.g. `usage_limit_reached`, `rate_limits` payloads), stderr text, reset time.
3. How each looks through `@ai-hero/sandcastle` 0.14.0's provider adapters (what toddler actually receives from `sandbox`/agent run).
4. Codex's `ordinaryUsageAllowed` in `account/rateLimits/read`: what it means and when it flips relative to the percentages.

Cite CLI versions and source/docs; mark anything not reproduced live.
