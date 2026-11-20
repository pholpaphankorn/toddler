# Open-source projects that overlap with toddler

Researched 2026-11-20.

Question: which open-source projects already do what toddler does (or most of it), and how do they compare feature by feature? Is toddler worth continuing to build?

Method: each project's own repo (README, and spec/docs files where the README was thin), read with `gh api repos/<owner>/<repo>` and `.../readme` on 2026-11-20. "Last push" is the repo's `pushed_at`; it is a liveness signal, not a release date. Candidates came from the brief plus `gh search repos` for Claude/Codex orchestrators, cross-review loops, Ralph loops, and usage-limit tools. Claims rest only on what the README/docs say; **[unverified]** marks things the docs don't settle. Source code was not audited.

The 8 toddler features used as columns:

1. **Issues**: picks labeled GitHub issues (or local markdown issues), honours blocking.
2. **Sandbox**: OS sandbox (Seatbelt), fresh worktree per stage, no unsandboxed fallback.
3. **X-review**: the other provider (Codex vs Claude) reviews, implement/review rounds.
4. **Verify**: host-owned `verify` (and `install`) command the agent can't weaken.
5. **PR**: push and open a PR, or leave a local branch / run offline.
6. **Subs**: Claude Pro/Max and ChatGPT subscription logins, no API keys.
7. **Quota**: reads weekly / 5-hour quota, ranks providers by it, stops and resumes.
8. **Skills/parallel**: vendored per-role skills; parallel-safe issues run concurrently.

---

## Short answer

**No project does the toddler job end to end.** The pieces all exist, but in different tools:

- **Closest overall: [Ralphy](https://github.com/michaelshimeles/ralphy)** (MIT, last push 2026-02-05). Headless CLI that takes tasks from GitHub issues (label filter) or markdown/YAML/JSON, runs Claude Code or Codex (and others) in parallel worktrees, runs test/lint, opens PRs, and retries later on rate-limit errors. **Gap:** no OS sandbox (its "sandbox mode" is a copy/symlink dir), no GitHub blocking (only YAML `parallel_group`), no review stage at all, test/lint are config the agent repo owns (and `--no-tests` exists), no quota reading or provider ranking. Quiet for 9 months.
- **Closest in design: [OpenAI Symphony](https://github.com/openai/symphony)** (Apache-2.0, last push 2026-09-15). A spec plus Elixir reference daemon: polls a tracker (Linear, GitHub Issues, Jira), honours `blocked_by`, per-issue workspace, Codex app-server with its sandbox, bounded concurrency, retries, tracker tokens kept out of the agent. **Gap:** Codex only (no Claude, so no cross-provider review), "engineering preview", records Codex rate-limit snapshots but does not schedule on them, review is a human handoff state.
- **Closest for cross-review: [ai-pr-loop](https://github.com/jshentu-nv/ai-pr-loop)** (no license, last push 2026-11-06). Codex reviews, Claude fixes, iterates to approval, on GitHub PRs or GitLab MRs, using logged-in CLIs. **Gap:** starts from an existing PR; no issue picking, sandbox, verify gate, or quota.
- **Closest for quota: [CodexBar](https://github.com/steipete/CodexBar)** (MIT, 2026-11-14) and [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) (MIT, 2026-07-05) read session/weekly windows; none of them schedules agent work across providers.

The big GUI orchestrators ([Orchestrator.inc agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator), [Paradev](https://github.com/ParadevAI/Paradev), [Vibe Kanban](https://github.com/BloopAI/vibe-kanban)) are interactive desktop apps with worktrees and PRs, not an AFK headless runner with a sandbox and a hard verify gate.

**What is unique to toddler** (not found anywhere): quota-ranked provider choice across Claude and Codex subscriptions with stop/resume; deterministic Codex-vs-Claude review rounds inside an issue-to-PR runner; an OS sandbox with no unsandboxed fallback combined with a host-owned verify command. Whether that combination is worth maintaining is the real decision; no existing project replaces it today.

---

## Comparison

Legend: **yes**, **partial**, **no**, **?** = docs don't say.

| Project | 1 Issues | 2 Sandbox | 3 X-review | 4 Verify | 5 PR | 6 Subs | 7 Quota | 8 Skills/parallel | License | Last push | Runs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **toddler** | yes: GitHub label + local md, `blocked_by` | yes: Seatbelt, fresh worktree/stage | yes | yes | yes, or local/offline | yes | yes | yes | (private) | - | local macOS |
| [sandcastle](https://github.com/mattpocock/sandcastle) | partial: scaffold prompts; blocking inferred by LLM | yes: Seatbelt/bwrap/Docker/cloud | partial: review templates, not cross-provider | no (hooks only) | no: local merge only | ? (uses CLIs) | no | partial: parallel-planner template | MIT | 2026-11-18 | local or cloud |
| [Ralphy](https://github.com/michaelshimeles/ralphy) | partial: GitHub label, md/yaml; no blocking | no: worktree or copy dir | no | partial: test/lint/build from repo config, skippable | yes: `--create-pr`, or merge/keep branch | ? (wraps CLIs; auth not stated) | partial: defers on rate-limit errors | partial: `--parallel`, rules not skills | MIT (README) | 2026-02-05 | local |
| [Symphony](https://github.com/openai/symphony) | yes: Linear/GitHub/Jira, `blocked_by` | partial: Codex sandbox in per-issue dir | no: Codex only | partial: workspace hooks | yes: via skills (`push`, `land`) | ? (Codex login) | partial: logs rate-limit snapshot | yes: concurrency + repo skills | Apache-2.0 | 2026-09-15 | local daemon |
| [agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator) | partial: planner agent splits work | no: worktrees | partial: optional reviewer agent | partial: routes CI failures back | yes | ? | no | yes: many workers | Apache-2.0 | 2026-11-20 | desktop + cloud |
| [Paradev](https://github.com/ParadevAI/Paradev) (ex-Superset) | partial: Linear/Slack start (some Pro) | no ("do not sandbox processes") | no | partial: setup scripts | yes | yes: "your own subscriptions" | no | yes: worktree per task | MIT | 2026-11-20 | desktop (+ paid cloud) |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | partial: own kanban issues | ? (worktrees) | no (human diff review) | no | yes | ? | no | yes | Apache-2.0 | 2026-11-15 | local web app |
| [ralph-orchestrator](https://github.com/mikeyobrien/ralph-orchestrator) | no: prompt/PDD | no | partial: `review` hat, same backend | yes: "backpressure" gates (tests, lint, typecheck) | ? | ? | no | partial | MIT | 2026-11-13 | local |
| [snarktank/ralph](https://github.com/snarktank/ralph) | partial: PRD JSON | no | no | partial: typecheck/tests in prompt | no | ? | no | no | MIT | 2026-02-02 | local |
| [ai-pr-loop](https://github.com/jshentu-nv/ai-pr-loop) | no: existing PR/MR | no | yes: Codex reviews, Claude fixes | no | yes: pushes to PR, or `--local` | yes: logged-in CLIs | no | partial: ships skill | none | 2026-11-06 | local |
| [codex-review-loop](https://github.com/andrew-barnett/codex-review-loop) | no | no | yes: Codex reviews, Claude fixes until `VERDICT: CLEAN` | no | yes, then auto-merge | yes (logins) | no | partial: skills | none | 2026-09-04 | local |
| [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | no | no | partial: Codex reviews from inside Claude Code | no | no | yes (Codex login) | no | no | Apache-2.0 | 2026-07-08 | local |
| [Gas Town](https://github.com/gastownhall/gastown) | partial: beads issues/convoys | partial: optional Docker container | no | partial: formula steps | ? | ? | partial: concurrency cap vs rate limits | yes: many agents | MIT | 2026-11-14 | local |
| [ccpm](https://github.com/automazeio/ccpm) | yes: GitHub issues, `depends_on`/`parallel` | no: shared worktree | no | no | partial | n/a (skill) | no | yes: skill, parallel streams | MIT | 2026-11-04 | inside agent |
| [claude-code-action](https://github.com/anthropics/claude-code-action) | partial: triggered per issue/PR | GitHub runner | no: Claude only | CI | yes | yes: `claude_code_oauth_token` | no | no | MIT | 2026-11-19 | GitHub Actions |
| [codex-action](https://github.com/openai/codex-action) | partial: per workflow event | Codex sandbox on runner | no | CI | partial | no: API key required | no | no | Apache-2.0 | 2026-11-18 | GitHub Actions |
| [OpenHands](https://github.com/OpenHands/OpenHands) (Agent Canvas) | ? (automations) | partial: optional Docker per conversation | no | no | ? | ? | no | yes | MIT | 2026-11-20 | local/self-host/cloud |
| [SWE-agent](https://github.com/SWE-agent/SWE-agent) | partial: one issue at a time | Docker | no | no | partial | no: LM API | no | no | MIT | 2026-11-16 | local |
| [terragon-oss](https://github.com/terragon-labs/terragon-oss) | partial: automations on new issues | yes: cloud containers | no | ? | yes | yes: Claude/ChatGPT subs | no | yes | Apache-2.0 | 2026-02-10 (dead) | cloud (self-host) |
| Session managers: [claude-squad](https://github.com/smtg-ai/claude-squad), [ccmanager](https://github.com/kbwo/ccmanager), [Nimbalyst](https://github.com/nimbalyst/nimbalyst), [sculptor](https://github.com/imbue-ai/sculptor), [container-use](https://github.com/dagger/container-use) | no | worktrees; container-use and sculptor (experimental) use containers | no | no | partial | mixed | no | parallel sessions only | AGPL-3.0 / MIT / MIT / MIT / Apache-2.0 | 2026-10 to 11 | local |
| Task stores: [Task Master](https://github.com/eyaltoledano/claude-task-master), [Backlog.md](https://github.com/MrLesk/Backlog.md) | task files with deps (Task Master) | no | no | no | no | n/a | no | no | MIT+Commons Clause / MIT | 2026-04-28 / 2026-11-20 | inside agent |
| Quota tools: [ccusage](https://github.com/ccusage/ccusage), [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor), [CodexBar](https://github.com/steipete/CodexBar), [claude-auto-resume](https://github.com/terryso/claude-auto-resume) | no | no | no | no | no | n/a | partial: read windows / wait for reset; no scheduling | no | NOASSERTION / MIT / MIT / MIT | 2026-05 to 11 | local |

Dropped as not comparable: [Sweep](https://github.com/sweepai/sweep) (now a JetBrains plugin; README says so), [Aider](https://github.com/Aider-AI/aider) and [Plandex](https://github.com/plandex-ai/plandex) (interactive single-agent tools; Plandex Cloud "winding down" per its README), [Claude Code Agent Farm](https://github.com/Dicklesworthstone/claude_code_agent_farm) (tmux sweeps of 20+ Claude sessions; license is "MIT + OpenAI/Anthropic Rider"), [Crystal](https://github.com/stravu/crystal) (renamed Nimbalyst). The old standalone [openhands-resolver](https://github.com/All-Hands-AI/openhands-resolver) is archived (last push 2024-11-18); where its issue-to-PR flow lives now in OpenHands is **[unverified]**.

---

## Per project

**[mattpocock/sandcastle](https://github.com/mattpocock/sandcastle)**: MIT, last push 2026-11-18. toddler's base. Library: `sandcastle.run()`, native sandboxes (Seatbelt on macOS, Bubblewrap on Linux), Docker/Podman, cloud providers (Daytona, E2B, Fly, Modal, Vercel), branch strategies, agent providers for Claude Code, Codex, Pi, Copilot, Cursor, OpenCode ([agent-providers.md](https://github.com/mattpocock/sandcastle/blob/main/docs/guide/agent-providers.md)). `init` scaffolds templates `simple-loop`, `parallel-planner`, `parallel-planner-with-review`, `sequential-reviewer` (installed 0.14.0 `dist/templates/`). It never pushes or opens PRs and has no tracker API or quota logic (see [sandcastle-forge-support.md](sandcastle-forge-support.md)). Everything in toddler's columns 1, 3, 4, 5, 6, 7 is toddler's own code.

**[michaelshimeles/ralphy](https://github.com/michaelshimeles/ralphy)**: README says MIT (no LICENSE file in the repo root; GitHub reports no license), last push 2026-02-05. npm `ralphy-cli` or a bash script. Engines: Claude Code (default), Codex, OpenCode, Cursor, Qwen, Droid, Copilot, Gemini. Task sources: `PRD.md`, a folder of md, YAML/JSON (with `parallel_group`), `--github owner/repo --github-label`. `--parallel` gives each agent a worktree and branch; `--create-pr`/`--draft-pr` or auto-merge with AI conflict resolution. `commands.test/lint/build` in `.ralphy/config.yaml`; `--no-tests`, `--fast` skip them. "Retryable rate-limit or quota errors are detected and deferred for later retry." `--sandbox` copies sources and symlinks deps; not process isolation.

**[openai/symphony](https://github.com/openai/symphony)**: Apache-2.0, last push 2026-09-15, "low-key engineering preview". [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md) defines a poll/dispatch daemon: tracker adapter, per-issue workspace with hooks, `max_concurrent_agents`, retry queue with backoff, `blocked_by` as best-effort tracker metadata, and a `codex_rate_limits` snapshot for observability. [elixir/README.md](https://github.com/openai/symphony/blob/main/elixir/README.md): adapters for Linear, GitHub Issues, Jira; launches `codex app-server`; defaults `thread_sandbox: workspace-write`; tracker tokens stay host-side and are stripped from the Codex child (the same choice toddler made with `GH_TOKEN`). Codex only.

**[OrchestratorInc/agent-orchestrator](https://github.com/OrchestratorInc/agent-orchestrator)**: Apache-2.0, last push 2026-11-20 (GitHub redirects ComposioHQ/agent-orchestrator here). Desktop app plus mobile; a main agent plans and starts workers per worktree; CI failures, review comments and conflicts go back to the owning worker; "a reviewer agent can read every PR"; many agent CLIs; optional cloud workers. Collects telemetry. No sandbox or quota mentioned.

**[ParadevAI/Paradev](https://github.com/ParadevAI/Paradev)**: MIT, last push 2026-11-20 (formerly Superset). Desktop app, worktree per task, PR pane, setup/teardown scripts, Linear/Slack triggers and scheduled automations (Pro plan). States plainly that worktrees "do not sandbox processes". "You bring your own agent subscriptions and API keys."

**[BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)**: Apache-2.0, last push 2026-11-15. Kanban issues, workspaces per task, inline diff comments to the agent, PR creation, 10+ agents. Human is the reviewer.

**[mikeyobrien/ralph-orchestrator](https://github.com/mikeyobrien/ralph-orchestrator)**: MIT, last push 2026-11-13. "Hat"-based Ralph loop with backends incl. Claude Code and Codex; "backpressure" gates reject work failing tests/lint/typecheck; a `review` hat; Telegram human-in-the-loop. No issue tracker or PR flow in README.

**[snarktank/ralph](https://github.com/snarktank/ralph)**: MIT, last push 2026-02-02. Reference Ralph loop over a PRD JSON; quality checks are prompt instructions.

**[jshentu-nv/ai-pr-loop](https://github.com/jshentu-nv/ai-pr-loop)**: no license (not legally reusable), last push 2026-11-06. Codex reviews, Claude fixes or pushes back, until Codex approves or only NITs remain; GitHub PRs and GitLab MRs; `--local` mode lands one commit; driven by an `ai-pr-review` skill for Claude Code and Codex; uses logged-in `codex`/`claude`. README notes it runs Codex with `--dangerously-bypass-approvals-and-sandbox` for the gh/git steps.

**[andrew-barnett/codex-review-loop](https://github.com/andrew-barnett/codex-review-loop)**: no license, last push 2026-09-04. Skills + driver doc: Codex `review-pr`, Claude `resolve-review`, loop to `VERDICT: CLEAN`, then auto-merge. Depends on [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0, 2026-07-08: "Use Codex from Claude Code to review code or delegate tasks").

**[gastownhall/gastown](https://github.com/gastownhall/gastown)**: MIT, last push 2026-11-14 (moved from steveyegge). Multi-agent workspace manager over [beads](https://github.com/gastownhall/beads) issues; worktree-backed agents; presets for claude, codex and others; optional Docker container; a "Scheduler" that caps dispatch concurrency to avoid rate-limit exhaustion (not quota-aware).

**[automazeio/ccpm](https://github.com/automazeio/ccpm)**: MIT, last push 2026-11-04. Agent skill: PRD to epic to GitHub issues with `depends_on`, `parallel`, `conflicts_with`; parallel agents "in the same worktree". Runs inside the agent harness, no sandbox or gate.

**[anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)**: MIT, last push 2026-11-19. Claude on issues/PRs in GitHub Actions; accepts `claude_code_oauth_token` as an alternative to `anthropic_api_key` ([action.yml](https://github.com/anthropics/claude-code-action/blob/main/action.yml)). **[openai/codex-action](https://github.com/openai/codex-action)**: Apache-2.0, last push 2026-11-18; requires an API key (`OPENAI_API_KEY`/Azure). Codex cloud itself is a hosted product, not open source. Pairing the two actions on PR events gives cross-provider review in CI, but needs an OpenAI API key and runs on GitHub's runners.

**[OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)**: MIT, last push 2026-11-20. Now "Agent Canvas": self-hosted control centre for OpenHands, Claude Code, Codex and ACP agents, optional Docker per conversation, automations. Issue-to-PR resolver status **[unverified]** (see Dropped).

**[SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent)**: MIT, last push 2026-11-16. Fixes one GitHub issue with an LM API; README recommends [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) going forward. Research tool.

**[terragon-labs/terragon-oss](https://github.com/terragon-labs/terragon-oss)**: Apache-2.0, last push 2026-02-10. "Open-source snapshot of Terragon at the time of shutdown" (2026-01-16), as-is. Had the most toddler-like feature list of any hosted tool: Claude Code and Codex, isolated sandbox containers, auto branches/PRs, "BYO Subscription", automations on new issues. Self-hosting needs Postgres, Redis, a sandbox provider and a tunnel.

**Session managers**: [claude-squad](https://github.com/smtg-ai/claude-squad) (AGPL-3.0, 2026-11-13; tmux + worktrees; Codex via `OPENAI_API_KEY` per README), [ccmanager](https://github.com/kbwo/ccmanager) (MIT, 2026-10-27; worktrees, devcontainer integration), [Nimbalyst](https://github.com/nimbalyst/nimbalyst) (MIT, 2026-11-18; desktop, Codex + Claude side by side, worktrees), [sculptor](https://github.com/imbue-ai/sculptor) (MIT, 2026-11-20; experimental container backend), [container-use](https://github.com/dagger/container-use) (Apache-2.0, 2026-11-14; MCP server giving each agent a container + branch). All interactive; none picks issues or gates work.

**Task stores**: [Task Master](https://github.com/eyaltoledano/claude-task-master) (MIT with Commons Clause, not OSI open source; 2026-04-28; task dependencies via MCP) and [Backlog.md](https://github.com/MrLesk/Backlog.md) (MIT, 2026-11-20; markdown tasks in git with spec/plan/code review checkpoints). Alternatives to toddler's local `.sandcastle/specs/` issues, not runners.

**Quota tools**: [ccusage](https://github.com/ccusage/ccusage) (license NOASSERTION, 2026-11-20) reports token usage from local logs for Claude Code, Codex and others, incl. Claude `blocks` (5-hour windows); it is cost/usage history, not remaining quota. [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) (MIT, 2026-07-05) captures Claude Code's official statusline `rate_limits`, has an opt-in "experimental Anthropic OAuth usage API", and exports JSON state. [CodexBar](https://github.com/steipete/CodexBar) (MIT, 2026-11-14) is a macOS menu bar app plus CLI showing session/weekly windows and reset times for Codex, Claude and many others. [claude-auto-resume](https://github.com/terryso/claude-auto-resume) (MIT, 2026-05-09) waits for Claude's usage-limit reset and resumes. None picks between providers.

---

## What only toddler does, and what it could borrow

Only toddler (of everything found):

1. **Quota-ranked provider choice** across Claude and Codex subscriptions (weekly, then 5-hour), with stop-when-low and a resumable state file. Others either show quota (CodexBar, Usage-Monitor) or react to rate-limit errors (Ralphy, claude-auto-resume).
2. **Deterministic cross-provider review rounds inside an issue-to-PR runner.** Cross-review exists only as standalone PR loops (ai-pr-loop, codex-review-loop) or plugins.
3. **Hard safety posture**: OS sandbox with no fallback, plus a host-owned `verify` the agent cannot weaken, plus forge credentials kept out of the sandbox. Symphony matches the last point and has a Codex sandbox; nobody else has all three.
4. **Real GitHub blocking** (dependencies API) and local `blocked_by`, matched only by Symphony (best-effort) and ccpm (`depends_on`, but run by the agent).

Could borrow or replace:

- **Symphony's SPEC.md** as a design reference for the poll/claim/retry/reconcile loop, workspace hooks and tracker adapters (Linear, Jira); it is the most carefully specified runner found, Apache-2.0.
- **Quota reading**: CodexBar's CLI and Claude-Code-Usage-Monitor's JSON export (`--once --output json`, `--write-state`) read the same windows toddler reads; worth checking whether calling one of them (or copying its approach) is less code than toddler's own reader. Not verified that either exposes model-specific weekly quota.
- **Review prompts/skills**: ai-pr-loop's convergence rule (stop on approval or NIT-only findings) and codex-review-loop's mechanical `VERDICT: CLEAN` could tighten toddler's review stop condition. ai-pr-loop has no license, so ideas only.
- **Ralphy** is the drop-in replacement candidate if the sandbox, cross-review and quota features turn out not to matter; it already does issue label to parallel worktrees to PR with Claude or Codex.
- **Backlog.md** could replace toddler's local markdown issue format if a richer local tracker is wanted.
