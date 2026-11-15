# What Codex subscription credentials can do

Research for [ticket 31](../../.sandcastle/specs/6-provider-logins/issues/31-codex-login-facts.md) (spec 6, provider logins). Researched 2026-11-13.

Question: for a ChatGPT-subscription login used by the Codex CLI, what are the token lifetimes and refresh rules in `auth.json`; can Codex run on an access token alone; how to sign in headless into a chosen `CODEX_HOME`; does `account/rateLimits/read` honour a non-default `CODEX_HOME`; and does `codex logout` revoke provider-side?

Method: official docs ([Authentication](https://learn.chatgpt.com/docs/auth), [Maintain Codex account auth in CI/CD](https://learn.chatgpt.com/docs/auth/ci-cd-auth); `developers.openai.com/codex/*` now 308-redirects to `learn.chatgpt.com/docs/*`), the `openai/codex` source at tag `rust-v0.163.0` (commit [`83086188`](https://github.com/openai/codex/tree/83086188ae0614bd882818ff1aa23f3194962012), matching the installed `codex-cli 0.163.0`), and local `codex login --help` / `codex logout --help`. One live probe: `codex app-server` against an **empty** temporary `CODEX_HOME` (no credentials involved). No token was decoded, displayed or sent; only `auth_mode`, `last_refresh` and key names of the local `auth.json` were read. `codex login` / `codex logout` were not run.

Legend: **[doc]** official documentation, **[src]** first-party source at the tag above, **[probe]** observed locally, **[undocumented]** inferred, not stated anywhere official; can change without notice.

Source shorthand: `manager.rs` = [`codex-rs/login/src/auth/manager.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/manager.rs), `revoke.rs` = [`codex-rs/login/src/auth/revoke.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/revoke.rs), `login.rs` = [`codex-rs/cli/src/login.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/cli/src/login.rs).

---

## 1. `auth.json` (`auth_mode: chatgpt`): lifetimes, refresh, rotation

### Shape

- **[src]** `AuthDotJson` ([`storage.rs` L47](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/storage.rs)): `auth_mode`, `OPENAI_API_KEY`, `tokens`, `last_refresh`, plus newer optional fields (`agent_identity`, `personal_access_token`, Bedrock). `TokenData` ([`token_data.rs` L11](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/token_data.rs)): `id_token` (JWT), `access_token` (JWT), `refresh_token` (**required string**, no serde default), `account_id`. File is written with mode `0600` (`storage.rs` ~L225).
- **[probe]** The local host file has exactly `OPENAI_API_KEY, auth_mode, last_refresh, tokens{access_token, account_id, id_token, refresh_token}`, `auth_mode = chatgpt`.

### Lifetimes

- **[undocumented]** No official doc or source constant states the access, ID or refresh token lifetime. The CI/CD doc only says Codex treats the session as stale "after roughly 8 days".
- **[src]** The client reads the access token's lifetime from its JWT `exp` claim (`parse_jwt_expiration`); it does not assume a fixed lifetime.
- **[src]** Refresh-token expiry exists server-side: the refresh endpoint can return `refresh_token_expired` ("your refresh token has expired. Please log out and sign in again", `manager.rs` L206, L1687). Its length is **[undocumented]**.

### When and how the CLI refreshes

- **[doc]** "Codex refreshes tokens automatically during use before they expire" ([auth](https://learn.chatgpt.com/docs/auth)). "if `last_refresh` is older than about 8 days, Codex refreshes the token bundle before the run continues"; it then "writes the new tokens and a new `last_refresh` back to `auth.json`" ([ci-cd-auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth)).
- **[src]** Proactive refresh (`should_refresh_proactively`, `manager.rs` L3001-3023), checked every time `AuthManager::auth()` is called: if the access token JWT has an `exp`, refresh when `exp <= now + 5 min` (`CHATGPT_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES = 5`); only if no `exp` can be parsed does it fall back to `last_refresh` older than 8 days (`TOKEN_REFRESH_INTERVAL = 8`). So in practice the trigger is access-token expiry, not the 8-day rule the docs describe. A failed proactive refresh is only logged; the request continues with the old token.
- **[src]** Reactive refresh on HTTP 401 (`UnauthorizedRecovery`, `manager.rs` L1850-2030, used by `core/src/client.rs` ~L1572): step 1 reloads `auth.json` from storage **if the account id still matches** (if another process wrote fresher tokens, they are picked up and the request retried); step 2 calls the refresh endpoint; if the retry still 401s the error goes to the user.
- **[src]** Refresh call: `POST https://auth.openai.com/oauth/token` with `grant_type=refresh_token`, client id `app_EMoamEEZ73f0CkXaXp7hrann` (`manager.rs` L212, L1627-1678, L1719). The response may carry new `id_token`, `access_token`, `refresh_token`; `persist_tokens` overwrites whichever were returned and sets `last_refresh = now` (L1600-1622). Refreshes in one process are serialised by a semaphore and preceded by a guarded reload (L2845-2879); there is **no cross-process lock** on `auth.json`.

### Does refresh rotate the refresh token?

- **[src]** Yes, in effect. The client persists a returned `refresh_token` over the old one, and the server's error codes include `refresh_token_reused`, surfaced as "your refresh token was already used" (`manager.rs` L207, L1688). A reused refresh token is classified as a **permanent** failure, cached so later attempts fail fast without network (L1799-1801, L2557).
- **[doc]** The CI/CD guide requires "one `auth.json` per runner or per serialized workflow stream", says "Do not share the same file across concurrent jobs or multiple machines", and lists "another machine or concurrent job rotated the token first" as a reason to reseed. That is: **after one copy refreshes, other copies holding the old refresh token stop being able to refresh** (their current access token keeps working until it expires). The docs never state the rotation rule explicitly; the mechanism above is from source.
- **Implication for toddler [inference]:** today's `codexAuth` copies host tokens (including the refresh token) into every sandbox. The first sandbox or quota read that refreshes rotates the family, and every other copy, including the host's, then fails its next refresh with `refresh_token_reused`.

## 2. Running with only an access token

### `auth.json` with no refresh token

- **[src]** `refresh_token` is a required field, so the key must be present; an empty string deserialises. Nothing guards against an empty refresh token before a refresh (only `revoke.rs` L70 checks `is_empty()`).
- **[undocumented, from src]** With `auth_mode: chatgpt` and `refresh_token: ""`, Codex uses the access token until it nears expiry. Within 5 minutes of `exp` each `auth()` call attempts a refresh with an empty token, which the server presumably rejects (→ cached permanent failure, logged, old token still sent). After expiry the backend returns 401; recovery first **reloads `auth.json`** (so an externally written fresh access token for the same account is picked up and the request retried), then tries to refresh, which fails, and the turn errors out with "Your access token could not be refreshed…". A supervisor that rewrites the sandbox's `auth.json` with a new access token before expiry would keep a session alive; this is not a supported or documented mode.

### Env var / `--with-access-token`

- **[doc]** `printenv CODEX_ACCESS_TOKEN | codex login --with-access-token`; "Access tokens are intended for trusted scripts, schedulers, and private CI runners", and in ChatGPT Enterprise "admins can grant the access token permission" ([auth](https://learn.chatgpt.com/docs/auth)). CLI help confirms `--with-access-token` (local `codex login --help`).
- **[src]** These are **not** the ChatGPT OAuth access token from `auth.json`. `CODEX_ACCESS_TOKEN` and `--with-access-token` accept either a **personal access token** (prefix `at-`, validated against `https://auth.openai.com/api/accounts/v1/user-auth-credential/whoami`) or an **Agent Identity JWT** ([`access_token.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/access_token.rs), [`personal_access_token.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/personal_access_token.rs), `manager.rs` L1048-1100, L1538-1560). Personal-access-token auth is never refreshed (`refresh_token` returns early, recovery reports `not_refreshable_auth`, `manager.rs` L2853-2857, L1931-1938). Whether a personal ChatGPT Plus/Pro account can issue such tokens is **[undocumented]**; the docs describe them only as admin-granted in workspaces ([Access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)).
- **[src]** Precedence when loading auth (`load_auth`, `manager.rs` L1489-1597): `CODEX_API_KEY` env (if enabled) → in-memory ephemeral store → `CODEX_ACCESS_TOKEN` env → configured persistent store (`auth.json` / keyring).
- **[src]** The app-server also has `account/login/start` with `type: "chatgptAuthTokens"` (client supplies a ChatGPT access token + account id; Codex stores it in memory with an empty refresh token and, on 401, asks the client via `account/chatgptAuthTokens/refresh`). It is marked "**[UNSTABLE] FOR OPENAI INTERNAL USE ONLY - DO NOT USE**" ([`app-server-protocol/src/protocol/v2/account.rs` L86-103, L271-300](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server-protocol/src/protocol/v2/account.rs)), and it is not reachable from `codex exec`.

## 3. Headless sign-in into a chosen `CODEX_HOME`

- **[doc]** "Enable device code login in your ChatGPT security settings (personal account) or ChatGPT workspace permissions (workspace admin)", then "Run `codex login --device-auth`"; device code auth is labelled beta ([auth](https://learn.chatgpt.com/docs/auth)).
- **[src]** `run_login_with_device_code` (`login.rs` L322-368) loads config, so it honours `CODEX_HOME` and `cli_auth_credentials_store`. It polls `{issuer}/deviceauth/token`, the user enters the code at `…/codex/device`, and it times out after 15 minutes ([`device_code_auth.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/device_code_auth.rs) L68-175). If the server has device code disabled it errors "device code login is not enabled for this Codex server".
- **[src]** `CODEX_HOME` must already exist and be a directory, otherwise Codex errors; it is canonicalised ([`utils/home-dir/src/lib.rs` L5-50](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/utils/home-dir/src/lib.rs)).
- **[src] Important:** every `codex login` (browser or device) first calls `clear_existing_auth_before_login` → `logout_with_revoke` on **that `CODEX_HOME`** (`login.rs` L126-142, L339). Re-logging in revokes the previous login stored there, but leaves logins in other `CODEX_HOME`s alone.
- **Storage options.** **[doc]** `cli_auth_credentials_store`: `file` = `auth.json` under `CODEX_HOME`; `keyring` = OS credential store, fails if unavailable; `auto` = keyring when available, else file; `ephemeral` = in memory for the current process only. **[src]** Default is `file` (`#[default] File`, [`config/src/types.rs` L133-146](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/config/src/types.rs)). The keyring entry is service `"Codex Auth"`, account `cli|<first 16 hex of sha256(canonical CODEX_HOME)>` (`storage.rs` L243-257), so keyring logins are also per-`CODEX_HOME`. **[doc]** The CI/CD guide says to switch to file-backed storage before seeding runners. Pass `-c cli_auth_credentials_store="file"` on the command line or put it in `$CODEX_HOME/config.toml` to pin it.

## 4. `account/rateLimits/read` with a non-default `CODEX_HOME`

- **[src]** `codex app-server` resolves its home with `find_codex_home()` from the `CODEX_HOME` env var ([`app-server/src/lib.rs` L531](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/lib.rs)), and the handler uses that home's `AuthManager` ([`account_processor.rs` L1192-1215](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/app-server/src/request_processors/account_processor.rs)). It needs ChatGPT-backed auth ("chatgpt authentication required to read rate limits" otherwise).
- **[probe]** `CODEX_HOME=<empty temp dir> codex app-server --listen stdio://` answered `account/rateLimits/read` with `-32600 "codex account authentication required to read rate limits"`. So it does **not** fall back to `~/.codex`, and it uses the given home. It also created state files there (`state_5.sqlite`, `logs_2.sqlite`, `installation_id`, `skills/`, …), so the directory must be writable.
- **[src]** The handler gets auth via `auth_with_http_client_factory()` → `auth()`, which runs the **proactive refresh**. A quota read can therefore rotate the refresh token and rewrite `auth.json` in that `CODEX_HOME`. It counts as one more "copy" for the rotation rule in section 1.
- Not tested with a real login in a non-default home (would need a second sign-in).

## 5. `codex logout`: revoke or just delete?

- **[src]** Both. `run_logout` (`login.rs` L514-575) calls `logout_with_revoke` (`manager.rs` L994-1020): it loads the stored auth, best-effort revokes, then deletes the ephemeral and the configured store (file and/or keyring). The app-server `account/logout` does the same (`account_processor.rs` L1047).
- **[src]** Revocation (`revoke.rs`): `POST https://auth.openai.com/oauth/revoke` with `token_type_hint=refresh_token` and the client id, falling back to the access token if there is no refresh token; 10 s timeout. Only for `chatgpt` mode. A failed revoke is only logged (`tracing::warn!`) and the local credentials are deleted anyway.
- **[doc]** The auth page only says `codex logout` will "clear the current credentials"; revocation is not documented for ChatGPT logins.
- **[undocumented]** Whether revoking a refresh token also invalidates already-issued access tokens (or other sessions of the same account) is not stated. Assume sandboxes holding an access token keep working until that token's `exp`.

---

## Summary for the spec

1. Lifetimes are undocumented; Codex reads access-token `exp` and refreshes within 5 min of it (8-day `last_refresh` rule is only a fallback). Refresh rotates the refresh token; a stale copy fails with `refresh_token_reused`. So exactly **one** process family may own a given refresh token.
2. An access-token-only `auth.json` works until `exp`, then fails. Codex re-reads `auth.json` on 401, so an owner that rewrites the file in time could keep a session alive (unsupported). `CODEX_ACCESS_TOKEN` is for personal access tokens / Agent Identity, not ChatGPT OAuth tokens.
3. Headless login: `CODEX_HOME=<dir> codex login --device-auth -c cli_auth_credentials_store="file"` (device code must be enabled in ChatGPT security settings). Re-login revokes that home's previous login.
4. `account/rateLimits/read` honours `CODEX_HOME`, and its read can refresh and rewrite that home's `auth.json`.
5. `codex logout` revokes the refresh token at `auth.openai.com/oauth/revoke` (best effort) and deletes local storage.
