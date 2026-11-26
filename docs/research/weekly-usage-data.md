# What weekly usage each provider reports

Research for [ticket 18](../../.sandcastle/specs/4-quota-aware-scheduling/issues/18-weekly-usage-data.md) (spec 4, quota-aware scheduling). Researched 2026-11-06.

Question: what weekly quota data can infant read from the sources it already uses ([src/quota.ts](../../src/quota.ts)): Codex app-server `account/rateLimits/read` and Claude's `GET https://api.anthropic.com/api/oauth/usage`? Which window/key is weekly, is it always present, are there per-model weekly buckets, reset units, staleness.

Method: official docs, the open-source Codex repo (`openai/codex` at commit `ddd1812a51f4aded35c3ec5446672474d5cb546b`, 2026-11-06), and the shipped Claude Code 2.1.306 binary (Claude Code is not open source; strings in the bundled JS were read locally, nothing was executed against the live endpoint). No live usage endpoint was called.

Legend: **[doc]** official documentation, **[src]** first-party source code, **[undocumented]** inferred from shipped client code or not stated anywhere official; can change without notice.

---

## Codex: `account/rateLimits/read`

### Response shape

- **[doc]** [App-server docs](https://learn.chatgpt.com/docs/app-server) (formerly developers.openai.com/codex/app-server): `rateLimits` is "the backward-compatible single-bucket view"; `rateLimitsByLimitId` (when present) is the multi-bucket view keyed by metered `limit_id` (for example `codex`). Each bucket has `limitId`, `limitName`, `primary`, `secondary`. `usedPercent` is current usage in the window, `windowDurationMins` is the window length, `resetsAt` is a Unix timestamp **in seconds**. The docs' example has a `codex` and a `codex_other` bucket and `"secondary": null`. The docs do **not** say which of `primary`/`secondary` is five-hour or weekly.
- **[src]** `GetAccountRateLimitsResponse` ([account.rs ~L361](https://github.com/openai/codex/blob/ddd1812a51f4aded35c3ec5446672474d5cb546b/codex-rs/app-server-protocol/src/protocol/v2/account.rs)) also carries `ordinaryUsageAllowed: bool | null` ("Backend permission for ordinary included usage ... Null means unavailable; clients must not infer recovery from percentages or reset times"), `rateLimitResetCredits`, `accountId`, `rateLimitUpsell`.
- **[src]** `RateLimitSnapshot` (same file ~L718): `limitId?`, `limitName?`, `normalModelSlug?` ("Normal model whose display name and reasoning options describe this quota alias"), `primary?`, `secondary?`, `credits?`, `individualLimit?`, `spendControlReached?`, `planType?`, `rateLimitReachedType?`. Every field is optional/nullable.
- **[src]** `RateLimitWindow` (~L806): `usedPercent: i32` (rounded from the backend's float), `windowDurationMins: number | null`, `resetsAt: number | null`. Note `resetsAt` **can be null** in the protocol type; infant's `CodexWindow` type assumes a number.

### Where the windows come from

- **[src]** The app-server handles each `account/rateLimits/read` with a fresh backend HTTP call (`client.get_rate_limits_with_reset_credits()`), no app-server-side cache ([account_processor.rs ~L1180-1275](https://github.com/openai/codex/blob/ddd1812a51f4aded35c3ec5446672474d5cb546b/codex-rs/app-server/src/request_processors/account_processor.rs)). It errors if the backend returned no snapshots, keys the map by `limit_id` (defaulting to `"codex"`), and sets `rateLimits` to the `codex` bucket or else the first one.
- **[src]** The backend payload has one main `rate_limit` (`primary_window`, `secondary_window`) mapped to `limit_id: "codex"`, plus `additional_rate_limits[]`, each mapped to `limit_id = metered_feature`, `limit_name`, and (newer path) `normal_model_slug` ([backend-client/src/client.rs ~L735-800](https://github.com/openai/codex/blob/ddd1812a51f4aded35c3ec5446672474d5cb546b/codex-rs/backend-client/src/client.rs), `rate_limit_resets.rs ~L34-60`). So **per-model buckets exist as extra `limitId`s** (docs example: `codex_other`), each with its own primary/secondary windows. The set of `metered_feature` values is backend-owned and **[undocumented]**.
- **[src]** `windowDurationMins = ceil(limit_window_seconds / 60)`, `null` if the backend sends `<= 0` (`window_minutes_from_seconds`, client.rs ~L938). `resetsAt` is the backend `reset_at` (Unix seconds).

### Which window is weekly

- **[src]** Codex's own TUI classifies a window **only by `windowDurationMins`, with ±5% tolerance**: 300 ≈ "5h", 1440 ≈ "daily", **10080 ≈ "weekly"**, 43200 ≈ "monthly" (`get_limits_duration` / `is_approximate_window`, [tui/src/chatwidget/rate_limits.rs ~L103-145](https://github.com/openai/codex/blob/ddd1812a51f4aded35c3ec5446672474d5cb546b/codex-rs/tui/src/chatwidget/rate_limits.rs)).
- **[src]** Weekly is **not** pinned to `secondary`. The TUI's `weekly_status_window` searches primary then secondary for the weekly label and only falls back to `secondary`; its five-hour picker explicitly handles "primary is weekly" ([status_surfaces.rs ~L1151-1240](https://github.com/openai/codex/blob/ddd1812a51f4aded35c3ec5446672474d5cb546b/codex-rs/tui/src/chatwidget/status_surfaces.rs)). A test fixture has `"primary": {"usedPercent": 48, "windowDurationMins": 10080}` (`tui/src/app/tests/luna_reserve_recovery_tests.rs` L16).
- **[doc]** [Codex pricing](https://learn.chatgpt.com/docs/pricing): "Pro plans currently have no five-hour limit"; "Weekly limits may also apply"; Enterprise/Edu with flexible pricing "have no fixed rate limits". So for a Pro account the `codex` bucket can carry **only a weekly window** (likely as `primary`), and some accounts carry neither.

### Staleness

- **[src]** Each read is a live backend fetch at call time, so the reading is as fresh as the backend's own accounting (backend lag **[undocumented]**).
- **[doc]** `account/rateLimits/updated` is a push notification "emitted whenever a user's ChatGPT rate limits change"; **[src]** it is sparse, clients "should merge available values into the most recent `account/rateLimits/read` response or refetch".
- **[src]** Codex's own status view treats a snapshot older than **15 minutes** as stale (`RATE_LIMIT_STALE_THRESHOLD_MINUTES`, `tui/src/status/rate_limits.rs` L66). infant's own limit (60 s) is much stricter.

---

## Claude: `GET /api/oauth/usage`

The endpoint itself is **[undocumented]** (infant's README already says so). Everything about its body below comes from how Claude Code 2.1.306 parses it, except where marked [doc].

### Top-level keys

- **[undocumented]** Claude Code's response schema (zod, `passthrough`, so unknown keys are tolerated) lists: `five_hour`, `seven_day`, `seven_day_oauth_apps`, `seven_day_opus`, `seven_day_sonnet`, `cinder_cove`, `wattle_ember` (a dollar-denominated meter with `limit_dollars`, `used_dollars`, `periods[]`), `extra_usage` (`is_enabled`, `monthly_limit`, `used_credits`, `utilization`, `currency`, `disabled_reason`), and **`limits[]`**. Every window key is `nullish` (absent or null allowed). Each window is `{ utilization: number | null, resets_at: string | null }`.
- **Units [undocumented]:** `utilization` is percent used (0-100; Claude Code passes it through unchanged as `utilization` next to `limits[].percent`, which it describes as "Share of the window used, 0-100"). `resets_at` is an **ISO 8601 string** (Claude Code converts it with `new Date(...)`; it also accepts a number of Unix seconds in some paths). Both can be **null**. infant currently does `Date.parse(resets_at)` and compares `utilization >= 100`, which silently treats a null utilization as "not exhausted".

### The `limits[]` array (newer, server-driven)

- **[undocumented]** Each row: `kind`, `group`, `percent` (0-100), `resets_at` (ISO 8601 or null), `severity` (`normal`/`warning`/`critical`), `is_active`, `scope.model.display_name` or `scope.surface.display_name`. Claude Code's own descriptions: `kind` is "The server's meter kind, e.g. 'session', 'weekly_all' or 'weekly_scoped'. Classify a row on this, never on a label"; `group` is e.g. `session` or `weekly`; rows are "the usage endpoint's limits[] ... which meters apply, their scope, labels, severity and order are the server's ... a new meter needs no client release. Empty when the server reported no meters; null when the body carried no rows at all (a server that predates them)."
- **[undocumented]** Per-model weekly windows are `kind: "weekly_scoped"` rows with `scope.model.display_name` (Claude Code filters them by a server-flag allowlist, default `["Fable","Fable 5","Fable 5.1"]`, and renders "Current week (Fable)"). These are **not** `seven_day_*` keys.
- **[doc]** [Using Claude Code with your Pro or Max plan](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan): Pro and Max have a five-hour session cap and a weekly cap; **Ultra has only a weekly cap**; Max and Ultra have "a separate weekly limit for Fable"; limits are "shared across Claude and Claude Code". This is the documented counterpart of the `weekly_scoped` row.

### What each `seven_day*` key means

- `seven_day` **[undocumented, but mirrors the documented statusline field]**: the account's all-models weekly window. This is "weekly left" for the provider. Equivalent `limits[]` row: `kind: "weekly_all"`.
- `seven_day_opus`, `seven_day_sonnet` **[undocumented]**: legacy model-family weekly windows. Claude Code treats both as real blocking limits (`blocked_opus`, `blocked_sonnet`) and names them to the user. Whether they are still populated for current plans is unknown; expect null.
- `seven_day_oauth_apps` **[undocumented]**: a weekly meter Claude Code parses but never names to the user and never treats as blocking (`nt()` returns null, `jn()` skips it), same as the header-only claims `seven_day_cowork`, `seven_day_omelette`. Probably usage through third-party OAuth apps. infant's current `key.startsWith("seven_day")` scan would disable Claude if this meter hits 100% even when Claude Code itself would still run.
- `seven_day_overage_included` is not a body key; it is a rate-limit header claim that Claude Code maps to the per-model (Fable) weekly row.

### Reset times

- Weekly `resets_at` is an ISO 8601 timestamp of the next reset **[undocumented]**. The weekly reset anchor (rolling from first use vs fixed weekday) is **not documented**; the help article only says to "wait until your usage limits reset".

### Staleness

- **[undocumented]** Claude Code caches the usage body in-process for **60 s** (`rt=60000`) and accepts a cached copy up to **1 h** old (`un=3600000`) for some displays; it also merges fresher values from the `anthropic-ratelimit-unified-*` response headers (`-5h-utilization`, `-7d-utilization`, `-5h-reset`, `-7d-reset`, `-representative-claim`) when a newer observation exists. Server-side freshness of `/api/oauth/usage` is unknown. infant fetches fresh each time, so client caching does not apply to it.

### A documented alternative (for ticket 19)

- **[doc]** [Status line docs](https://code.claude.com/docs/en/statusline): the statusline JSON has `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage` (0-100) and `.resets_at` (**Unix epoch seconds**). It "appears only for claude.ai Pro, Max, and Ultra subscribers", "only after the first API response in the session", "Each window (`five_hour`, `seven_day`, `spend_limit`) may be independently absent", and "Claude Code drops a window once its `resets_at` time passes". This is the only officially documented weekly figure for Claude, but it lives inside a running Claude Code session, not a pollable endpoint. Claude Code's internal schema also lists `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps` and `model_scoped[]` there, which the public docs do not.

---

## Implications for infant

1. **Weekly-only plans break today's reader.** Codex Pro ("no five-hour limit") and Claude Ultra ("only a weekly cap") can return no five-hour window, and `codexUsage`/`claudeUsage` then throw, which disables the provider. A missing five-hour window should mean "no five-hour constraint", not "unverifiable".
2. **Codex weekly = the window with `windowDurationMins` ≈ 10080 (±5%), in either `primary` or `secondary`.** Match five-hour the same way (≈300) instead of `=== 300`.
3. **Codex per-model buckets** are extra `rateLimitsByLimitId` entries (non-`codex` `limitId`, with `limitName`/`normalModelSlug`), each with its own windows. Which one applies depends on the model infant runs; `codexLimitId` config already selects one.
4. **Claude weekly left = `100 - seven_day.utilization`** (or the `limits[]` row with `kind: "weekly_all"`). Per-model weekly (Fable) is a `limits[]` `kind: "weekly_scoped"` row, not a `seven_day_*` key, so today's exhaustion check misses it.
5. **Don't count every `seven_day*` key.** `seven_day_oauth_apps` is not something Claude Code itself blocks on.
6. **Units differ:** Codex `resetsAt` Unix seconds (nullable), Claude `resets_at` ISO 8601 string (nullable), statusline `resets_at` Unix seconds. Both `utilization`/`usedPercent` are 0-100; Codex's is an integer.
7. **Null handling:** Claude `utilization` and both providers' reset times can be null.
8. Codex exposes `ordinaryUsageAllowed`, a backend yes/no that its own comment says to trust over percentages.

## Sources

- Codex app-server docs: https://learn.chatgpt.com/docs/app-server
- Codex pricing and limits: https://learn.chatgpt.com/docs/pricing
- openai/codex @ `ddd1812a51f4aded35c3ec5446672474d5cb546b`: `codex-rs/app-server-protocol/src/protocol/v2/account.rs`, `codex-rs/app-server/src/request_processors/account_processor.rs`, `codex-rs/backend-client/src/client.rs`, `codex-rs/backend-client/src/client/rate_limit_resets.rs`, `codex-rs/tui/src/chatwidget/rate_limits.rs`, `codex-rs/tui/src/chatwidget/status_surfaces.rs`, `codex-rs/tui/src/status/rate_limits.rs`, `codex-rs/tui/src/app/tests/luna_reserve_recovery_tests.rs`
- Claude Code status line docs: https://code.claude.com/docs/en/statusline
- Claude help center, Pro/Max plan with Claude Code: https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- Claude Code 2.1.306 shipped bundle (`~/.local/share/claude/versions/2.1.306`), read with `strings`; minified, identifiers like `ln`, `mHt`, `nt`, `jn`, `rt`, `un` are as shipped and will change between versions.
