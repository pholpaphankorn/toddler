# What Claude subscription credentials can do

Research for [ticket 30](../../.sandcastle/specs/6-provider-logins/issues/30-claude-login-facts.md) (spec 6, provider logins). Researched 2026-11-13.

Question: for a Claude subscription login used by Claude Code, what are the lifetimes, rotation and scopes of `claude auth login` and `claude setup-token` credentials; can toddler sign in headless into its own store; can toddler refresh tokens itself (and is that allowed); what does a sandboxed Claude Code do when `CLAUDE_CODE_OAUTH_TOKEN` expires; and can tokens be revoked provider-side?

Method: official Claude Code docs (fetched 2026-11-13), the Claude Code changelog, `--help` of the installed CLI, and the shipped Claude Code **2.1.306** binary (not open source; strings in the bundled JS were read locally). The local login's Keychain entry was read only for the non-secret fields `expiresAt`, `refreshTokenExpiresAt`, `scopes`; no token value was printed, logged or sent anywhere. `claude auth login`, `logout` and `setup-token` were **not** run. One side effect: running `claude auth status --json` on the host refreshed its expired access token (see A2), a normal Claude Code operation.

Legend: **[doc]** official documentation, **[changelog]** official changelog, **[cli]** observed CLI behaviour, **[src]** read from the shipped 2.1.306 bundle, **[undocumented]** not stated anywhere official; can change without notice. Note: the account checked locally is a **Team** subscription (`subscriptionType: team`), not Pro/Max; the code paths are the same "claude.ai" login.

Docs used:

- Authentication: <https://code.claude.com/docs/en/authentication>
- Env vars: <https://code.claude.com/docs/en/env-vars>
- Errors: <https://code.claude.com/docs/en/errors>
- Troubleshoot login: <https://code.claude.com/docs/en/troubleshoot-install#login-and-authentication>
- CLI reference: <https://code.claude.com/docs/en/cli-reference>
- Legal and compliance: <https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use>
- Agent SDK overview: <https://code.claude.com/docs/en/agent-sdk/overview>
- Changelog: <https://code.claude.com/docs/en/changelog>

---

## 1. `claude auth login` credentials

### Endpoints and client

- **[src]** OAuth 2 authorization-code + PKCE (S256). Authorize: `https://claude.com/cai/oauth/authorize` (claude.ai) or `https://platform.claude.com/oauth/authorize` (Console). Token: `https://platform.claude.com/v1/oauth/token`. Public client id `9d1c250a-e61b-44d9-88ed-5944d1962f5e`; redirect either `http://localhost:<port>/callback` or the manual `https://platform.claude.com/oauth/code/callback` (shows a code to paste). **[undocumented]**

### Scopes

- **[doc]** `CLAUDE_CODE_OAUTH_SCOPES` example: `"user:profile user:inference user:sessions:claude_code"` ([env-vars](https://code.claude.com/docs/en/env-vars)).
- **[src]** A claude.ai login requests `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload` plus `user:plugins` (prod config sets `PLUGINS_SCOPE_REGISTERED: true`). A refresh requests the same list minus `org:create_api_key`.
- **[cli]** The local stored login's `scopes`: `user:file_upload user:inference user:mcp_servers user:plugins user:profile user:sessions:claude_code` (no `org:create_api_key`).

### Access-token lifetime

- **[doc]** No number is given. Docs only say Claude Code "refreshes" the login automatically and shows `Login expired` once refresh fails ([errors#login-expired](https://code.claude.com/docs/en/errors#login-expired)).
- **[cli] [undocumented]** **8 hours** observed: after a refresh at 09:26 local, `expiresAt` was 17:26 the same day. The server decides this (`expires_in` in the token response); the client stores `expiresAt = now + expires_in`.

### Refresh-token lifetime

- **[doc]** A login has a finite lifetime: "When the login you created with `/login` is within three days of expiring, Claude Code shows a warning … `Your login expires in 3 days · run /login to renew`" ([authentication#renew-an-expiring-login](https://code.claude.com/docs/en/authentication#renew-an-expiring-login)). **[changelog]** 2.1.318: "Fixed the sign-in failure when a stored claude.ai login reaches its time limit".
- **[src]** The token response may carry `refresh_token_expires_in`; Claude Code stores it as `refreshTokenExpiresAt`, falling back to **30 days** (`2592000000` ms) when absent. A refresh that returns no new value keeps the old `refreshTokenExpiresAt`.
- **[cli] [undocumented]** Locally, `refreshTokenExpiresAt` stayed at the same instant (2026-12-12) across a refresh, so the refresh-token lifetime looks like **about 30 days from sign-in, not sliding**. In practice: plan on a **re-login about every 30 days**, with a 3-day warning. Only one refresh was observed; confirm across a few refreshes.

### Does refresh rotate the refresh token?

- **[doc]** Yes, with reuse detection: "Before v2.1.211, waking the machine from sleep could cause two sessions to renew with the same token, which revoked the saved login and prompted every open session to log in again" ([troubleshoot-install#not-logged-in-or-token-expired](https://code.claude.com/docs/en/troubleshoot-install#not-logged-in-or-token-expired)). Parallel sessions "coordinate its renewal so that only one process refreshes the token at a time".
- **[src]** Refresh posts `grant_type=refresh_token` and stores the returned `refresh_token` (keeping the old one only if none comes back). The `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` failure message says the token "was used for this attempt and cannot be used again; issue a new one". So refresh tokens are **single-use**, and **reusing an old one revokes the whole login**. **[undocumented]** beyond the doc sentence above.

## 2. `claude setup-token`

- **[doc] Lifetime: one year.** "generate a one-year OAuth token with `claude setup-token`". It is printed, not saved; use it as `CLAUDE_CODE_OAUTH_TOKEN` ([authentication#generate-a-long-lived-token](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token)). **[src]** It sends `expires_in=31536000` with the code exchange.
- **[doc] Scope: inference only.** "It can only make model requests, so it can't establish Remote Control sessions or fetch claude.ai connectors." **[src]** The authorize request asks for `user:inference` only (`inferenceOnly: true`). **[cli]** `claude setup-token --help` has no options.
- **Can it call `GET /api/oauth/usage`? Probably not.** **[src] [undocumented]** Claude Code calls `/api/oauth/usage` and `/api/oauth/profile` only when the credential's scopes include `user:profile`, and treats a 403 `permission_error` without `user:profile` as expected. So the endpoint needs `user:profile`, which a setup-token lacks. Not tested live. **[changelog]** 2.1.323 "Fixed `/usage` hiding limit bars for setup tokens and `CLAUDE_CODE_OAUTH_TOKEN`: it keeps the session and weekly bars and says why the rest are missing". **[src] [undocumented]** For tokens like this, Claude Code reads 5h and weekly usage from the `anthropic-ratelimit-unified-5h-utilization`, `-7d-utilization`, `-5h-reset` and `-7d-reset` **response headers on inference calls**, not from the usage endpoint.
- **Revocation: no documented way.** **[cli]** No CLI command lists or revokes setup-tokens. A setup-token has no refresh token, so `logout`'s revoke (§5) does not touch it. Anthropic closed GitHub requests for a revoke command ([#57400](https://github.com/anthropics/claude-code/issues/57400) "not planned", [#48373](https://github.com/anthropics/claude-code/issues/48373) duplicate). A third-party guide says these tokens appear on claude.ai under Settings → Claude Code and can be revoked there. **[undocumented]**, unverified. **[doc]** The errors page does say a `CLAUDE_CODE_OAUTH_TOKEN` gets `OAuth token revoked` "when that token expires or is revoked", so server-side revocation exists in some form.

## 3. Can toddler sign in into its own store, headless?

- **[doc] Its own config dir: yes.** `CLAUDE_CONFIG_DIR` gives a separate login: "Each directory has its own settings, session history, and claude.ai login" ([authentication#log-in-with-multiple-accounts](https://code.claude.com/docs/en/authentication#log-in-with-multiple-accounts)).
- **[doc] No browser on the box: yes, by pasting a code.** `claude auth login` prints a URL. Open it on any device, sign in, and the page shows a code. Paste that code into `claude auth login`, "which reads the pasted code from standard input" ([troubleshoot-install#oauth-login-fails-in-wsl2-ssh-or-containers](https://code.claude.com/docs/en/troubleshoot-install#oauth-login-fails-in-wsl2-ssh-or-containers); **[changelog]** 2.1.126). **[src]** No device-code grant is used for claude.ai.
- **[doc] Without any browser step: only if you already hold a refresh token.** With `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` + `CLAUDE_CODE_OAUTH_SCOPES` set, "`claude auth login` exchanges this token directly instead of opening a browser … Useful for provisioning authentication in automated environments" ([env-vars](https://code.claude.com/docs/en/env-vars)). The token is single-use (§1).
- **No Keychain on macOS: not controllable.** **[doc]** On macOS credentials go to the Keychain. Only "when the Keychain rejects the write, such as when it's locked in an SSH session" does Claude Code fall back to `<config dir>/.credentials.json` (mode 0600). With `CLAUDE_CONFIG_DIR` set, the Keychain entry is "keyed to that directory" ([authentication#credential-management](https://code.claude.com/docs/en/authentication#credential-management)). **[src]** The entry is named `Claude Code-credentials-<first 8 hex of sha256(config dir)>`, so toddler's current `nativeClaudeToken` (which reads only `Claude Code-credentials`) would not find it. No documented setting forces file storage on macOS. **[undocumented]** `CLAUDE_SECURESTORAGE_CONFIG_DIR` is an internal override for which dir the storage key uses, not a "use a file" switch.
- **Third option:** `claude setup-token` (browser or paste-code once a year), then toddler stores the printed token itself. This is inference-only (§2).

## 4. Can toddler refresh the access token itself? Is that allowed?

- **Technically: yes.** **[src] [undocumented]** POST `https://platform.claude.com/v1/oauth/token` with `{grant_type:"refresh_token", refresh_token, client_id, scope}` (JSON). But rotation (§1) means only **one** holder of a login may refresh. If toddler refreshes a login that a Claude Code process also refreshes, one side ends up reusing a spent token and **the whole login is revoked**. A login toddler refreshes itself must never be refreshed by a Claude Code process, and the reverse.
- **Allowed: no, as written.** **[doc]** Legal and compliance: OAuth "is designed to support ordinary use of Claude Code and other native Anthropic applications". Also: "developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow". The same page allows "an end user … signing in to the unmodified Claude Code binary with their own Claude subscription" ([legal-and-compliance#authentication-and-credential-use](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)). The Agent SDK page: "Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products". toddler is the subscriber's own tool on their own machine, but calling the token endpoint and storing refresh tokens itself is what the text names. **The safe reading: let the unmodified `claude` binary own and refresh the login** (in a toddler-owned `CLAUDE_CONFIG_DIR`). toddler only reads the current access token from it. This is a judgment call for the user, not legal advice.
- **[cli] [undocumented]** Running `claude auth status --json` with an expired access token **refreshed it** (expired `expiresAt` → now + 8h). That gives a way to renew through the official binary without a model request. Seen once on 2.1.306.

### What sandboxed Claude Code does when `CLAUDE_CODE_OAUTH_TOKEN` expires

- **[doc]** "Unless you run `/login`, Claude Code uses the token you set for the whole session. To replace an expired token, generate a new one and restart" ([env-vars](https://code.claude.com/docs/en/env-vars)). After a 401 it "keeps sending the value you set … rather than switching to a stored login's token" (since 2.1.225). Errors: `-p`/SDK print `Failed to authenticate. API Error: 401 OAuth token has expired ...` or `Failed to authenticate: OAuth token revoked …`, structured code `authentication_failed` ([errors#oauth-token-revoked-or-expired](https://code.claude.com/docs/en/errors#oauth-token-revoked-or-expired)).
- **[src]** For a local env token the refresh strategy is `"none"`. A 401 waits `CLAUDE_CODE_OAUTH_401_WAIT_MS` for a rotated token (default 0 outside Anthropic's own remote runner) and then fails. **There is no refresh and no recovery mid-session.** The env token cannot be swapped into a running process. The "rotation" path reads `/home/claude/.claude/remote/.oauth_token`, which exists only in Anthropic's own remote runner. **[undocumented]**
- **Consequence for toddler:** today's sandboxes get the host's **8-hour access token** and never refresh it. Any sandbox (or quota read) after that token's `expiresAt` fails until something refreshes the host login. That fits both symptoms: quota reads fail later in a run, and a re-login "needed daily". Either give each sandbox an access token with enough life left for the run (renewing between issues), or use a setup-token (1 year, inference-only).

## 5. Provider-side revoke / logout

- **[doc]** `/logout` (and `claude auth logout`) signs out and "removes all stored credentials, including the plaintext file's contents, saved MCP server logins, and plugin sensitive values" ([troubleshoot-install](https://code.claude.com/docs/en/troubleshoot-install#not-logged-in-or-token-expired)). For a Console keyless sign-in, `/logout` "removes and revokes the credential" ([authentication#sign-in-without-an-api-key](https://code.claude.com/docs/en/authentication#sign-in-without-an-api-key)). The errors page: "A revoked token means you signed out everywhere or an admin removed access."
- **[src] [undocumented]** On first-party logout Claude Code POSTs `https://platform.claude.com/v1/oauth/token/revoke` with `{token: <refresh token>, token_type_hint: "refresh_token", client_id}` for the stored `claudeAiOauth` (and design/cloud-sessions logins). It is best effort: on failure it logs "OAuth token revoke failed … continuing with local logout". Revoking the refresh token ends the login; whether the current access token stops before its 8h expiry is **not verified**.
- So `CLAUDE_CONFIG_DIR=<toddler dir> claude auth logout` gives toddler a provider-side revoke of its own login through the official binary. **setup-tokens have no documented revoke** (§2).

---

## Implications for toddler (for the spec, not decisions)

1. Keep the login inside the unmodified `claude` binary: `CLAUDE_CONFIG_DIR=<toddler-private dir>` + `claude auth login` (paste-code works headless). This matches the legal text and avoids rotation races, provided toddler never refreshes with the refresh token itself.
2. On macOS that login lands in a **per-dir Keychain entry** unless the Keychain refuses the write. A "no Keychain" requirement can't be met through a documented switch; read the entry by its hashed name, or fall back to `<dir>/.credentials.json`.
3. Renewal: run `claude auth status` (observed to refresh) or any `claude` call under that config dir before handing out an access token. Serialize it (Claude Code has its own refresh lock across processes on one config dir). Expect a full re-login about every 30 days, warned 3 days ahead.
4. Sandboxes: pass the access token only (8h). Make sure it has enough life left for the issue. Claude Code will not refresh it and fails with `authentication_failed`. That is the "renew once, else stop provider" signal.
5. Quota: `/api/oauth/usage` needs `user:profile`, which a full login has and a setup-token lacks. The rate-limit response headers are a scope-free fallback **[undocumented]**.
6. `toddler logout claude`: `CLAUDE_CONFIG_DIR=<dir> claude auth logout` revokes provider-side (best effort), then delete the dir.
