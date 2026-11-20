# toddler

My personal agent workflow, built on [Sandcastle](https://github.com/mattpocock/sandcastle).
toddler is a CLI: `cd` into a project and run it there. It works the project's labeled
GitHub issues with Codex and Claude Code inside macOS Seatbelt sandboxes, has the
other provider review, and opens PRs.

Run from a normal macOS terminal. Seatbelt cannot nest inside the Codex app's own
sandbox. The runner never falls back to unsandboxed execution.

## Why "toddler"?

Picture a toddler at the beach building a sandcastle:

- **It stays in the sandbox.** Each agent works in its own fresh worktree inside a
  Seatbelt sandbox. It can make as much mess as it likes in there; the rest of your
  machine stays clean.
- **It brings its own bucket and spade.** Each role gets a small set of vendored
  skills to build with.
- **Another kid checks the castle.** One provider builds, the other reviews, and the
  `verify` command has to pass before anything leaves the sandbox.
- **It shows you the castle.** Finished work comes back as a PR (or a local branch)
  for a grown-up to accept.
- **It naps when it's tired.** When quota runs low, toddler stops and picks up where
  it left off next time.

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

| Key                                       | Required     | Meaning                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forge`                                   | no           | `github` (default), `gitlab`, or `none` (nothing is pushed).                                                                                                                                                                                                                                                                                          |
| `repository`                              | with a forge | Forge repository `owner/name` (`init` fills it in).                                                                                                                                                                                                                                                                                                   |
| `verify`                                  | no           | Shell command run inside the sandbox worktree after each stage; must exit 0. It comes from the host config, so agents cannot weaken it. Empty or missing: no check, and only the review gates the work.                                                                                                                                               |
| `providers`                               | no           | Non-empty list of enabled providers (`codex`, `claude`); defaults to both. Duplicate and unknown names are errors. Unlisted providers are not used.                                                                                                                                                                                                   |
| `ranking`                                 | no           | `quota` (default) ranks by model-specific weekly quota, then five-hour quota, then a random tie-break; percentages are rounded down. `order` prefers providers in the listed order. A project-relative module path selects a custom ranker. Review prefers the other enabled provider, and an available implementer remains assigned on later rounds. |
| `install`                                 | no           | Shell command run in each new sandbox worktree before the agent starts, e.g. `npm ci`; must exit 0. Every stage starts from a fresh worktree with only committed files, so dependencies (including ones an earlier stage added to the lockfile) must be installed here. Empty or missing: nothing is installed.                                       |
| `format`                                  | no           | Shell command run in the sandbox worktree after each implementation stage, e.g. `npm run format`; must exit 0. Whatever it changes is committed as `style: run project formatter` before `verify` and review, so formatting never depends on the agent remembering. Never run for review. Empty or missing: not run.                                  |
| `GH_HOST` environment variable            | no           | Selects the GitHub host used by the GitHub CLI.                                                                                                                                                                                                                                                                                                       |
| `GITLAB_HOST` environment variable        | no           | Selects the GitLab host used by `glab`; otherwise `glab` uses the git remote.                                                                                                                                                                                                                                                                         |
| `issues`                                  | no           | `"forge"` (default with a forge): labeled forge issues. `"files"` (default with none): markdown files in `.sandcastle/specs/<spec>/issues/`.                                                                                                                                                                                                          |
| `roles`                                   | no           | Per-role settings: `roles.<role>.skills` replaces the vendored skill list (`[]` disables skills), and `roles.<role>.models.<provider>` overrides a provider's model. Omitted roles, fields, and providers keep their defaults.                                                                                                                        |
| anything in `defaults` in `src/config.ts` | no           | Overrides, e.g. `stopAt`, `issueLabel`, `roles`.                                                                                                                                                                                                                                                                                                      |

Example:

```json
{
  "repository": "owner/name",
  "install": "npm ci",
  "verify": "npm test"
}
```

### Custom ranking

Set `"ranking": ".sandcastle/ranking.ts"` to load a project module. For example:

```ts
export default function rank({ candidates }) {
  return candidates.map(({ provider }) => provider).reverse();
}
```

The synchronous function receives `{ role, issue, candidates }`; each available
candidate has `provider`, `model`, and `reading`. It must return every candidate's
provider exactly once, best first. It is called only when at least two candidates
are available. Loading or ranking errors stop the run, and `toddler doctor`
checks the module.

### Local issues

With `"issues": "files"`, issues are grouped by spec:

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

With `"forge": "none"`, toddler runs offline and nothing is pushed. With a GitHub forge, file issues still open pull requests.

For GitLab, set `"forge": "gitlab"` and `"repository": "group/subgroup/project"` (nested groups are supported), and sign in with `glab`. GitLab issues can declare same-project blockers on lines such as `Blocked by: #12, #15`; lines can repeat. Native GitLab blocking links also count. File issues open merge requests without a closing reference.

Set `"autoMerge": true` to ask GitHub to merge approved pull requests after required checks and approvals pass. Toddler uses the repository default merge method when enabled. GitHub must allow auto-merge on the repository; `toddler doctor` checks this setting. If GitHub refuses, the pull request remains open and the error is logged. The default is `false`, so toddler leaves merging to you. With `forge: "none"`, this setting currently has no effect.

`.sandcastle/project.md` (optional) is appended to the implementation and review
prompts as "Project notes": stack, how to check changes, what not to do.
Set `roles.<role>.prompt` to a non-empty Markdown file path relative to the
project root (for example, `".sandcastle/prompts/review.md"`) to replace that
role's instructions. Unset roles use the bundled prompts. To customize one,
copy [implementation.md](prompts/implementation.md) or [review.md](prompts/review.md)
and edit it. Workflow rules and project notes are still appended.
Shared workflow rules live in `prompts/rules.md`, with role-specific rules in
`prompts/rules/implementation.md` and `prompts/rules/review.md`.

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

| Provider    | Implementation      | Review            |
| ----------- | ------------------- | ----------------- |
| Codex       | `gpt-6.1-terra`     | `gpt-6.1-sol`     |
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
PRs reference the issue for closure on merge. Human changes to a branch after approval cause publication to stop.

After requested changes, implementation and review repeat up to ten rounds per
invocation. Failed tasks pause for human inspection while other issues can continue.
Already-open or merged workflow PRs are not assigned again.

## Quota thresholds and stopping

Each subscription is a shared budget: implementation, review, subagents, and other
usage on that account consume it. Four roles do not provide four separate allowances.

The runner checks remaining quota before each stage and every 15 seconds during
model work. By default, at **5% five-hour** or **10% all-models weekly** remaining,
all active sessions for that provider are cancelled. A per-model weekly bucket at
or below **10%** stops only that provider and model, cancelling only sessions on
that model. Unfinished work remains on disk, and other available models can continue.
Stops last for the rest of the invocation, even if a window resets. `toddler plan`
lists per-model stops under `unavailableModels`.

The runner exits when no provider has any usable model or no actionable issues remain.
Blocked issues, issues with workflow PRs, and tasks already attempted unsuccessfully
in the current invocation are not repeatedly scheduled. Authentication errors,
unreadable quota, invalid review output, and failed verification also pause work;
these conditions are reported rather than treated as completed issues.

**Limits:** this is a polling guard, not a provider-enforced spending cap. Server
reporting lag and in-flight calls can consume additional quota before cancellation.
An exact guarantee of leaving quota untouched is not possible. Configure percent-left stop thresholds in `.sandcastle/config.json` if more headroom is needed:

```json
{ "stopAt": { "claude": { "weekly": 20 }, "codex": { "fiveHour": 10 } } }
```

Each provider and window is optional; defaults are 5% for five-hour and 10% for weekly. Values must be between 0 and 100; 0 disables that threshold. A missing window does not trigger a stop. Seatbelt kills normal process groups;
Sandcastle documents a macOS limitation for processes that deliberately detach.

Projects can add synchronous stop conditions with project-relative module paths:

```json
{ "stopConditions": [".sandcastle/stop.ts"] }
```

```ts
// .sandcastle/stop.ts
export default ({ provider, reading, models }) =>
  provider === "codex" && reading.weekly?.remainingPercent < 30
    ? [{ model: models[0], reason: "Keep weekly quota for other work" }]
    : [];
```

Each default export receives the provider, its valid quota reading, and the distinct models its roles use. Return an array of stops: omit `model` to stop the provider, or name a model from `models` to stop only that model. The built-in thresholds run first, followed by project conditions in config order on every refresh. The first reason for each stop is kept. Invalid results or errors are fatal and identify the module; `toddler doctor` checks that modules load.

Codex usage is read through the documented `account/rateLimits/read` app-server API,
selecting five-hour and weekly windows in the `codex` bucket. Claude's usage
endpoint is undocumented and can change; unknown, stale, or failed quota readings
disable that provider. A setup-token with inference-only scope cannot query it.

To use another live usage reader, set `CLAUDE_USAGE_COMMAND` or
`CODEX_USAGE_COMMAND` in `.sandcastle/.env` to a trusted host command. Each invocation
must fetch current subscription usage and print only JSON:

```json
{
  "observedAt": 1893452400000,
  "fiveHour": { "remainingPercent": 42, "resetsAt": 1893456000 },
  "weekly": { "remainingPercent": 75, "resetsAt": null },
  "weeklyByModel": {
    "model-label": { "remainingPercent": 60, "resetsAt": null }
  }
}
```

`resetsAt` is Unix **seconds** or null; `observedAt` is the actual measurement time in Unix **milliseconds**, at most 60 seconds old. Use null for an absent five-hour or weekly window and an empty object for no per-model buckets. Percentages must be finite and between 0 and 100. The example illustrates the shape, not usable quota data. Never use a static percentage to bypass the stop thresholds. Alternatively,
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
