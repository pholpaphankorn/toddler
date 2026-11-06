# toddler

My personal agent workflow, built on [Sandcastle](https://github.com/mattpocock/sandcastle).
toddler is a CLI: `cd` into a project and run it there. It works the project's labeled
GitHub issues with Codex and Claude Code inside macOS Seatbelt sandboxes, has the
other provider review, and opens PRs.

Run from a normal macOS terminal. Seatbelt cannot nest inside the Codex app's own
sandbox. The runner never falls back to unsandboxed execution.

## Install

toddler uses `@ai-hero/sandcastle` 0.14.0 from npm (pinned exactly). Node >= 22.18
runs the TypeScript directly; there is no build step.

```sh
npm install
npm link        # puts `toddler` on your PATH, pointing at this checkout
```

Keep it linked rather than packed: Node does not strip types from files under
`node_modules`, so a tarball install would not run.

## Use it in a project

```sh
cd ~/some/project
toddler init      # writes .sandcastle/config.json and .sandcastle/.gitignore
# edit .sandcastle/config.json, optionally add .sandcastle/project.md, commit .sandcastle/
toddler setup     # sign in to GitHub, Codex and Claude Code, then run doctor
toddler doctor    # check sandbox, logins, quota and models
toddler plan      # show the next assignments without starting agents
toddler           # run (same as `toddler run`)
toddler smoke [codex|claude]   # 1 tiny model call per role (uses quota)
```

`.sandcastle/config.json` (committed in the project):

| Key | Required | Meaning |
| --- | --- | --- |
| `repository` | yes, unless offline | GitHub `owner/name` whose issues are worked (`init` fills it in). |
| `verify` | no | Shell command run inside the sandbox worktree after each stage; must exit 0. It comes from the host config, so agents cannot weaken it. Empty or missing: no check, and only the review gates the work. |
| `issues` | no | `"github"` (default): labeled GitHub issues. `"local"`: markdown files in `.sandcastle/specs/<spec>/issues/`. |
| `openPr` | no | `true` (default): push the reviewed branch and open a PR. `false`: stop with the approved commit on a local branch; nothing is pushed. |
| anything in `defaults` in `src/config.ts` | no | Overrides, e.g. `reservePercent`, `issueLabel`, `models`. |

Example:

```json
{
  "repository": "owner/name",
  "verify": "npm test"
}
```

### Local issues

With `"issues": "local"`, issues are grouped by spec:

```text
.sandcastle/specs/<spec-number>-<slug>/
  spec.md                  the spec (not worked as an issue)
  issues/<number>-<slug>.md one file per issue
```

Spec and issue numbers are both required; issue numbers must be unique across all
specs. Other files in the spec folder are ignored.
Frontmatter is optional:

```md
---
title: Fix login redirect
labels: [parallel-safe]
blocked_by: [2]
status: open
---
What is wrong and what done looks like.
```

The title falls back to the file name. Set `status: closed` (or delete the file) once
the work is merged; until then it still blocks any issue that lists it in `blocked_by`.
Local issues work on `toddler/local-<number>` branches, and their PRs do not
say `Closes #N`.

With `"issues": "local"` and `"openPr": false` toddler runs offline: no GitHub login,
`repository` or git remote is needed. Jobs branch from the branch you have checked out.
`toddler init` writes this setup when the repository has no GitHub remote. Otherwise
GitHub is still used for the base branch and, with `openPr`, the PR.

`.sandcastle/project.md` (optional) is appended to the implementation and review
prompts as "Project notes": stack, how to check changes, what not to do. The
generic workflow rules stay in toddler's `prompts/prompt.md` and `prompts/review.md`.

The project's `.sandcastle/` also holds the ignored runtime files: `.env`, `state.json`,
`logs/`, `worktrees/` and `runner.lock`. The repo must have the `Sandcastle`,
`parallel-safe` and `blocked` labels (`gh label create <name>`).

## Authentication

The setup wizard signs in through the native GitHub, Codex, and Claude Code CLIs.
Existing GitHub and Codex logins are retained. No API keys are needed or used.

- **Claude:** `claude auth login` stores subscription OAuth credentials in Claude
  Code's native Keychain entry. No manually generated `setup-token` is necessary.
  Usage queries require `user:profile`, obtained through the native login, or a
  separate live usage reader. The runner reads native credentials for model and
  usage calls; it does not invoke any zsh token function. It does not mount your
  Keychain or home directory into Seatbelt.
- **Codex:** `codex login` uses the ChatGPT subscription; `toddler doctor` checks the
  requested models are advertised. The runner copies
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

1. Add **Sandcastle** to an actionable issue. The coordinator assigns one issue
   per branch, starting with the oldest issue number.
2. Add **parallel-safe** to each of two issues only after establishing that both
   can be implemented independently. Without that declaration work stays sequential.
   Add GitHub blocking dependencies or **blocked** / **on-hold** to defer an issue.
   The coordinator checks open GitHub blockers, including issues outside the queue.
3. Run `toddler plan` to inspect the next assignments without starting agents.
4. Run `toddler` to implement, review, and open PRs automatically.

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
worktree and runs the project's `verify` command, if set. A structured approving review of the exact resulting SHA
is required before that SHA is pushed to `toddler/issue-N` and a PR is opened.
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
in `.sandcastle/config.json` if more headroom is needed. Seatbelt kills normal process groups;
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

## Vendored skills

To add a skill or bump a version, edit `vendor/skills.json`. Check which other
skills it refers to and add those too. Run `scripts/vendor-skills.sh` (network
access is needed for the upstream repositories), review the diff, and commit it.
Vendored files are copies of upstream files and should not be edited locally.

## Verification

```sh
npm test
npm run typecheck
npm run smoke:seatbelt
```

The smoke test uses a disposable repository with no model calls or credentials.
It checks private-home input, host tool access, worktree writes, and denied access
outside the worktree. Tests cover scheduling, review gates, quota cancellation,
fallback, and PR delivery using fake agents. Actual issue implementation still
requires model calls and the project's own verification.

`toddler smoke` explicitly makes four small subscription model calls
in a disposable Seatbelt sandbox to check actual authentication and model access.
Pass `claude` or `codex` to test only one provider. Claude's own temporary
files are directed to Seatbelt's private temp directory with `CLAUDE_CODE_TMPDIR`.

References: [Sandcastle sandbox providers](https://github.com/mattpocock/sandcastle/blob/main/docs/guide/sandbox-providers.md),
[Codex app-server quota API](https://learn.chatgpt.com/docs/app-server),
[Claude model pins](https://code.claude.com/docs/en/model-config),
[Claude status-line usage fields](https://code.claude.com/docs/en/statusline).
