---
title: What Claude subscription credentials can do
labels: [wayfinder:research, on-hold]
blocked_by: []
parent: 6
status: closed
assignee: claude (research subagent)
---
## Question

For a Claude Pro/Max subscription used by Claude Code (current CLI), with primary sources (docs, CLI source/behaviour, changelogs; mark anything undocumented):

- `claude auth login` OAuth credentials: access-token lifetime, refresh-token lifetime, whether refresh rotates the refresh token (old one invalidated), and which scopes are granted (`user:inference`, `user:profile`, …).
- `claude setup-token`: lifetime, scopes, whether it can call `GET https://api.anthropic.com/api/oauth/usage` (needs `user:profile`?), and whether it can be revoked.
- Can infant sign in **into its own store** headless (no browser on the box, no Keychain): e.g. `CLAUDE_CONFIG_DIR` + file-backed `.credentials.json` on macOS, device-code or paste-the-code flows.
- Can a third party (infant) refresh the access token itself, and is that sanctioned? What does Claude Code inside a sandbox do with `CLAUDE_CODE_OAUTH_TOKEN` when it expires mid-session?
- Is there a revoke/logout that invalidates tokens provider-side?

## Answer

Full findings: `docs/research/claude-login-facts.md` (sources: code.claude.com docs, changelog, local CLI help, strings in Claude Code 2.1.306). Lifetimes observed once on a Team account.

- **`claude auth login`:** scopes `user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload user:plugins`. Access token ~8 h (observed, undocumented); refresh token ~30 days, fixed from login (docs: fixed lifetime, 3-day warning). **Refresh rotates**; reusing a spent refresh token revokes the whole login (docs, troubleshoot page).
- **`claude setup-token`:** 1 year, inference only (`user:inference`), so almost certainly no `/api/oauth/usage` (untested). Fallback quota source: `anthropic-ratelimit-unified-5h-*` / `-7d-*` response headers (undocumented). No documented revoke.
- **Own store, headless:** a separate `CLAUDE_CONFIG_DIR` gives a separate login (docs). Login works without a browser on the box (print URL, paste code on stdin). `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` + `CLAUDE_CODE_OAUTH_SCOPES` can log in from an existing refresh token. On macOS Claude Code always writes a Keychain entry `Claude Code-credentials-<8 hex>` per config dir, falling back to `.credentials.json` only if Keychain refuses: there is no documented "no Keychain" switch on macOS. (Today's `nativeClaudeToken` would not find a per-config-dir entry.)
- **Infant refreshing itself:** possible via the token endpoint but undocumented, and the Legal and compliance page says developers "may not collect, store, or intermediate Claude.ai credentials". It permits signing in to the unmodified `claude` CLI. Refreshing beside Claude Code also risks revocation by rotation. Safer reading: let the `claude` CLI own and refresh the login (`claude auth status` was seen refreshing an expired access token).
- **`CLAUDE_CODE_OAUTH_TOKEN` in a sandbox** is never refreshed; after expiry requests fail `401 OAuth token has expired` / `authentication_failed`. Infant's current use of the host's 8 h token likely explains both the later-in-run quota failure and the daily re-login.
- **Revoke:** `claude auth logout` best-effort revokes the refresh token (`platform.claude.com/v1/oauth/token/revoke`, undocumented) and clears local creds, so `CLAUDE_CONFIG_DIR=<infant dir> claude auth logout` can back `infant logout claude`. Whether live access tokens die at once is unchecked.
