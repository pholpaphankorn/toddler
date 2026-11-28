---
title: What Codex subscription credentials can do
labels: [wayfinder:research, adult]
blocked_by: []
parent: 6
status: closed
assignee: claude (research subagent)
---
## Question

For a ChatGPT subscription used by the Codex CLI (current version), with primary sources (docs, `openai/codex` source; mark anything undocumented):

- `auth.json` (`auth_mode: chatgpt`): access/ID/refresh token lifetimes; when and how the CLI refreshes (`last_refresh`), and whether refresh **rotates** the refresh token so other copies stop working.
- Can Codex run with only an access token (no refresh token) in `auth.json`, or via an env var? What does it do when that token expires mid-session?
- Headless sign-in into a chosen `CODEX_HOME`: `codex login --device-auth` (or equivalent), and the `cli_auth_credentials_store` / Keychain vs file options.
- Does `codex app-server` `account/rateLimits/read` work with a non-default `CODEX_HOME`?
- `codex logout`: does it revoke provider-side or only delete the file?

## Answer

Full findings: `docs/research/codex-login-facts.md` (sources: learn.chatgpt.com auth docs, `openai/codex` at `rust-v0.163.0`, matching the installed CLI).

- **Lifetimes undocumented.** Codex reads the access token's own `exp`; refresh-token lifetime is not stated anywhere.
- **Refresh** happens within 5 min of access-token expiry (8-day `last_refresh` rule only as fallback), plus once after a 401 (re-read `auth.json` first, then `auth.openai.com/oauth/token`). Result written back to `auth.json`; no cross-process lock.
- **Refresh rotates the refresh token**; a reused one fails with `refresh_token_reused` (permanent). So today's `codexAuth`, copying the refresh token into every sandbox, breaks every other copy (host included) after the first refresh. Docs require one `auth.json` per runner.
- **Access-token-only** (empty `refresh_token`) runs until expiry, then the turn errors (source, not docs). After a 401 Codex re-reads `auth.json`, so a writer refreshing that file could keep a session alive (unsupported). `CODEX_ACCESS_TOKEN` / `--with-access-token` take `at-` PATs or Agent Identity tokens (Enterprise-granted; personal plans undocumented), not ChatGPT tokens. App-server `chatgptAuthTokens` is internal-only.
- **Headless sign-in:** `CODEX_HOME=<dir> codex login --device-auth -c cli_auth_credentials_store="file"` (device code is beta, must be enabled in ChatGPT security settings, 15-min code; `CODEX_HOME` must exist; login revokes the previous login in that home). Stores: `file` (default), `keyring`, `auto`, `ephemeral`; keyring is per `CODEX_HOME`.
- **`account/rateLimits/read`** uses the given `CODEX_HOME` with no fallback to `~/.codex` (tested with an empty home); needs a writable home and may itself refresh and rewrite `auth.json`.
- **`codex logout`** best-effort revokes at `auth.openai.com/oauth/revoke` (10 s timeout, warning only on failure), then deletes file/keyring entries. Whether revocation kills already-issued access tokens is undocumented.
