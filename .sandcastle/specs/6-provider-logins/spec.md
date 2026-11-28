---
title: Provider logins
labels: [wayfinder:map, adult]
status: open
---
<!-- Wayfinder map. Tickets are files in issues/ with `parent: 6`. All carry `adult` so `toddler` never tries to implement them. -->

## Destination

A spec for how toddler gets, stores, renews, hands to sandboxes, and revokes its own **provider logins** for Claude Code and Codex: independent of the host's `claude`/`codex` sign-ins, usable headless (no browser, no macOS Keychain required), no manual re-login in normal use, and no credential lost or expired mid-run. Ready to break into toddler issues.

## Notes

- **Paused 2026-11-13** (current auth still works). On resume, re-read the current code ([quota.ts](../../../src/quota.ts), [runner.ts](../../../src/runner.ts), [main.ts](../../../src/main.ts), [agents.ts](../../../src/agents.ts), the former bash setup wizard (deleted in spec 10)) before working any ticket: it is expected to change a lot, so the code facts below and in the tickets may be stale. Re-check them and update the map and open tickets first.
- Domain: toddler on `@ai-hero/sandcastle` 0.14.0. Today [quota.ts](../../../src/quota.ts) `claudeToken` reads the **access token** from Claude Code's Keychain entry (or `.credentials.json`) and never refreshes it; it is used for the usage endpoint and passed to Claude sandboxes as `CLAUDE_CODE_OAUTH_TOKEN` ([runner.ts](../../../src/runner.ts)). `codexAuth` copies `~/.codex/auth.json` tokens (incl. refresh token) into each sandbox's private home. `toddler setup` (then a bash wizard; TypeScript in `main.ts` since spec 10) runs the host `claude auth login` / `codex login`.
- Symptoms that started this: (1) Claude quota reads fail from the second issue of a run; (2) `claude auth login` needed daily; (3) Codex depends on host files, blocking a future remote server.
- **Changed 2026-11-25** by [doctor, setup, init, plan and smoke](../7-harness-boundary/issues/72-cli-modes.md): toddler keeps **local logins** (host CLI sign-ins, set up by `toddler setup`); the standalone provider login comes **alongside** them, not as a replacement. The settled notes "Host CLI logins are never read" and "No migration … replaces the host-reading path" below no longer hold; on resume, decide how a project picks between the two.
- Settled while charting (user's calls):
  - One provider login per provider **per machine**, owned by toddler, shared across projects. Host CLI logins are never read.
  - Headless use is a design constraint; running toddler off macOS is not a deliverable.
  - Security comes from least privilege, private storage, short-lived credentials in sandboxes, and easy revocation, not forced daily logins. Goal: no manual re-login in normal use.
  - A sandbox gets the shortest-lived credential that works (access token, never the refresh token) unless research shows a provider CLI cannot run without it.
  - Mid-run login failure: renew once; if that fails, stop that provider for the run (as today). No pause-for-login.
  - `toddler logout [codex|claude]` is in scope: delete toddler's stored login and revoke provider-side where possible.
  - No migration: the new design replaces the host-reading path; users run `toddler setup` once.
  - The concern-1 bug is diagnosed here and fixed by this spec (a trivial fix may be pulled out).
- Tracker: these files, same conventions as [spec 4](../4-quota-aware-scheduling/spec.md). Claim = `assignee:` frontmatter; resolve = `## Answer` + `status: closed`; blocking = `blocked_by`.
- Vocabulary: [GLOSSARY.md](../../../GLOSSARY.md) (**Provider login**, **Provider**, **Agent**).
- Skills: grilling + domain-modeling (HITL), research (research tickets), codebase-design for where the login code lives.

## Decisions so far

- [What Claude subscription credentials can do](issues/30-claude-login-facts.md): `claude auth login` = 8 h access + ~30 day fixed refresh token that rotates (reuse revokes the login); `setup-token` = 1 year, inference only (no usage endpoint); a toddler `CLAUDE_CONFIG_DIR` gives a separate login, headless via paste-the-code, but macOS always uses a Keychain entry; Anthropic terms bar third parties storing or intermediating Claude.ai tokens, so the `claude` CLI should own refresh; `claude auth logout` revokes best-effort.
- [What Codex subscription credentials can do](issues/31-codex-login-facts.md): refresh rotates the refresh token (reuse is fatal), so only one holder may ever refresh: today's copy-into-every-sandbox breaks the host login; access-token-only runs until expiry; headless sign-in via `codex login --device-auth` into a toddler-owned `CODEX_HOME` (file store); quota reads honour that `CODEX_HOME` and may refresh it; `codex logout` revokes best-effort.

## Not yet specified

- Whether toddler handing a Claude access token to sandboxes (`CLAUDE_CODE_OAUTH_TOKEN`) counts as "intermediating" under Anthropic's terms, and what to do instead (e.g. `setup-token` for agents plus a separate usage source). Sharpens once [How provider logins stay fresh and what a sandbox receives](issues/34-renewal-and-sandbox-handoff.md) is grilled.
- How quota reads use the provider login: Codex's `account/rateLimits/read` runs through the `codex` app-server against some `CODEX_HOME`; Claude's usage endpoint needs a scope the inference credential may lack. Depends on where logins live and how they renew.
- How `toddler doctor` reports login health (expiry, scopes, last renewal) without displaying secrets.
- What happens to the `CLAUDE_USAGE_TOKEN_COMMAND` / `*_USAGE_COMMAND` overrides and the env vars [agents.ts](../../../src/agents.ts) clears, once toddler owns the logins.
- Two toddler runs (different projects, same machine) renewing the same provider login at once.

## Out of scope

- GitHub auth (host `gh`, SSH push): unchanged.
- API keys: still unsupported; subscription logins only.
- Running toddler on Linux / a remote server (Seatbelt is macOS-only); only the login design must not block it.
- Importing existing host `claude`/`codex` logins.
