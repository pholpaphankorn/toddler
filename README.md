# Sandcastle workflow

Run from a normal macOS terminal. Seatbelt cannot nest inside the Codex app's own
sandbox. The runner never falls back to unsandboxed execution.

## Install and authenticate

This repository uses the existing local Sandcastle checkout at
`~/Documents/agentic-workflow/sandcastle` (version 0.12.0, inspected at commit
`85e8e6d3ab73ab0892242f01185464da713a7ef6`). `package.json` preserves that file
dependency; the checkout needs its built `dist/` directory and installed dependencies.
On another computer, clone/build Sandcastle at that path before running `npm install`
here, or change the file dependency to the checkout's location.

```sh
npm install
npm run sandcastle:setup
npm run sandcastle:doctor
npm run sandcastle:plan
npm run sandcastle
```

The setup wizard signs in through the native GitHub, Codex, and Claude Code CLIs.
Existing GitHub and Codex logins are retained. No API keys are needed or used.

- **Claude:** `claude auth login` stores subscription OAuth credentials in Claude
  Code's native Keychain entry. No manually generated `setup-token` is necessary.
  Usage queries require `user:profile`, obtained through the native login, or a
  separate live usage reader. The runner reads native credentials for model and
  usage calls; it does not invoke any zsh token function. It does not mount your
  Keychain or home directory into Seatbelt.
- **Codex:** `codex login` uses the ChatGPT subscription. On this computer it is
  already authenticated and both requested models are advertised. The runner copies
  only subscription credentials from `~/.codex/auth.json` into the sandbox's private
  home; it does not copy host settings, history, or API keys. A file-backed ChatGPT
  login is required; a Keychain-only Codex login is not currently supported here.
- **GitHub:** the host `gh` login handles queue reads and PR creation. Pushes use
  `origin` and its usual Git credentials (currently SSH). GitHub tokens are not passed
  to model processes. The account needs issue read access and branch/PR write access.

Optional host settings go in ignored `.sandcastle/.env`; see `.env.example`.
Never paste tokens into a tracked file or a chat. Logs, state, local environment,
and worktrees are ignored by Git.

## Queue and roles

GitHub Issues is enabled on `pholpaphankorn/nvchad-starter`. The setup created the
`Sandcastle`, `parallel-safe`, and `blocked` labels.

1. Add **Sandcastle** to an actionable issue. The coordinator assigns one issue
   per branch, starting with the oldest issue number.
2. Add **parallel-safe** to each of two issues only after establishing that both
   can be implemented independently. Without that declaration work stays sequential.
   Add GitHub blocking dependencies or **blocked** / **on-hold** to defer an issue.
   The coordinator checks open GitHub blockers, including issues outside the queue.
3. Run `npm run sandcastle:plan` to inspect the next assignments without starting agents.
4. Run `npm run sandcastle` to implement, review, and open PRs automatically.

| Provider | Implementation | Review |
| --- | --- | --- |
| Codex | `gpt-6.1-terra` | `gpt-6.1-sol` |
| Claude Code | `claude-sonnet-5-5` | `claude-opus-5-5` |

These are four logical roles, invoked as native CLI sessions. The coordinator runs
at most two issue pipelines concurrently, with one session per provider/role. Each
role can delegate within Seatbelt; subagents share that provider's quota. Model pins
are explicit, with no automatic model substitution. Claude account access to those
pins is verified when its CLI starts a task.

Codex receives a lone issue first. With two independent issues and both providers
available, Codex and Claude implement one each. Review normally goes to the other
provider. If one provider becomes unavailable, unfinished work and review use the
remaining provider's appropriate role. Implementation and review are separate sessions.

Each issue branches from the fetched default branch (`origin/main` here), with its
base SHA recorded in local state. Agents commit locally; the host verifies a clean
worktree and Lua syntax. A structured approving review of the exact resulting SHA
is required before that SHA is pushed to `codex/sandcastle-issue-N` and a PR is opened.
PRs reference the issue for closure on merge. The runner never merges PRs or closes
issues itself. Human changes to a branch after approval cause publication to stop.

After requested changes, implementation and review repeat up to three rounds per
invocation. Failed tasks pause for human inspection while other issues can continue.
Already-open or merged workflow PRs are not assigned again.

## Five-hour reserve and stopping

Each subscription is a shared budget: implementation, review, subagents, and other
usage on that account consume it. Four roles do not provide four separate allowances.

The runner checks remaining quota before each stage and every 15 seconds during
model work. At **5% or less**, all active sessions for that provider are cancelled.
Its unfinished work remains on disk; the other provider can continue. A stopped
provider stays stopped for the rest of that invocation, even if its window resets.
An exhausted weekly window also disables that provider.

The runner exits when both providers are unavailable or no actionable issues remain.
Blocked issues, issues with workflow PRs, and tasks already attempted unsuccessfully
in the current invocation are not repeatedly scheduled. Authentication errors,
unreadable quota, invalid review output, and failed verification also pause work;
these conditions are reported rather than treated as completed issues.

**Limits:** this is a polling guard, not a provider-enforced spending cap. Server
reporting lag and in-flight calls can consume additional quota before cancellation.
An exact guarantee of leaving 5% untouched is not possible. Increase `reservePercent`
in `config.mjs` if more headroom is needed. Seatbelt kills normal process groups;
Sandcastle documents a macOS limitation for processes that deliberately detach.

Codex usage is read through the documented `account/rateLimits/read` app-server API,
selecting a 300-minute window in the configured `codex` bucket. Claude's usage
endpoint is undocumented and can change; unknown, stale, or failed quota readings
disable that provider. A setup-token with inference-only scope cannot query it.

To use another live usage reader, set `CLAUDE_USAGE_COMMAND` or
`CODEX_USAGE_COMMAND` in `.sandcastle/.env` to a trusted host command. Each invocation
must fetch current subscription usage and print only JSON:

```json
{"remainingPercent":42,"resetsAt":1893456000,"observedAt":1893452400000}
```

`resetsAt` is the five-hour window reset in Unix **seconds**; `observedAt` is the
actual measurement time in Unix **milliseconds**, at most 60 seconds old. The numbers
above illustrate the shape, not usable quota data. Include weekly exhaustion as
zero remaining. Never use a static percentage to bypass the reserve. Alternatively,
`CLAUDE_USAGE_TOKEN_COMMAND` can return a profile-scoped OAuth token for the default
  Claude usage reader; model calls continue to use the native Claude login.

## Resume and inspect

Press Ctrl-C to cancel active sessions. Run the command again to continue unfinished
branches. `.sandcastle/state.json` records the stage, base SHA, implementer, review,
PR URL and last error. Dirty worktrees are preserved under `.sandcastle/worktrees/`;
clean worktrees can be removed by Sandcastle while their named branches remain.
Logs are in `.sandcastle/logs/`. Inspect preserved changes before retrying a task.

Only one coordinator may run in this checkout. A crash can leave
`.sandcastle/runner.lock`; check its PID is no longer running before removing it.
To retry a deliberately closed PR, stop the runner and remove only that issue's job
entry from `state.json`, then inspect/reuse its existing branch before restarting.

## Verification

```sh
npm run test:sandcastle
npm run check:lua
node .sandcastle/smoke-seatbelt.mjs
```

The smoke test uses a disposable repository with no model calls or credentials.
It checks private-home input, host Lua access, worktree writes, and denied access
outside the worktree. Tests cover scheduling, review gates, quota cancellation,
fallback, and PR delivery using fake agents. Actual issue implementation still
requires model calls and issue-specific verification; no live issue runs were made
during setup because the labeled queue was empty.

`npm run sandcastle:smoke` explicitly makes four small subscription model calls
in a disposable Seatbelt sandbox to check actual authentication and model access.
Pass `-- claude` or `-- codex` to test only one provider. Claude's own temporary
files are directed to Seatbelt's private temp directory with `CLAUDE_CODE_TMPDIR`.

During setup, all four pinned models returned the expected response with subscription
authentication inside Seatbelt. Both providers' five-hour quota queries also passed.

References: [Sandcastle sandbox providers](https://github.com/mattpocock/sandcastle/blob/main/docs/guide/sandbox-providers.md),
[Codex app-server quota API](https://learn.chatgpt.com/docs/app-server),
[Claude model pins](https://code.claude.com/docs/en/model-config),
[Claude status-line usage fields](https://code.claude.com/docs/en/statusline).
