# What sandcastle offers for trackers and forges

Research for [ticket 41](../../.sandcastle/specs/3-trackers/issues/41-sandcastle-forge-support.md) (spec 3, trackers). Researched 2026-11-14.

Question: what does `@ai-hero/sandcastle` 0.14.0 provide that infant could reuse for reading issues (GitHub, GitLab, local; labels, blocking, parent/child), for pushing branches and opening, finding and merging PRs/MRs, for forge auth, and as extension points? What does infant do instead today?

Method: the installed package (`node_modules/@ai-hero/sandcastle`, version 0.14.0: `dist/*.d.ts`, `dist/main.js` (the CLI), `dist/templates/*`, README), and the upstream repo [`mattpocock/sandcastle`](https://github.com/mattpocock/sandcastle) at `main` commit `0ed674e5195b200d34bc4128eec33409f2952dcf` (2026-11-13): `CHANGELOG.md`, pending `.changeset/*.md`, `docs/guide/init.md`, `docs/agents/adding-an-issue-tracker.md`, and issues #511, #521, #607. npm `dist-tags`: `latest` is 0.14.0; `v1-next` is `1.0.0-v1-next.20261110151212` (not inspected; GitHub code search covers `main` only).

Legend: **[doc]** upstream docs/changelog, **[src]** shipped or upstream code, **[undocumented]** behaviour only visible in code, can change without notice.

---

## Short answer

Sandcastle has **no tracker or forge runtime API**. The library (`run`, `createSandbox`, `createWorktree`, sandbox and agent providers) only creates worktrees/branches, runs agents, and merges commits back **locally**. Issue tracking exists only as **scaffold text** that `sandcastle init` writes into prompts and Dockerfiles, which the _agent_ executes as shell commands. It never pushes, and it never opens, finds or merges a PR/MR. There is nothing to swap in for infant's `gh` calls; the standing "reuse sandcastle" rule does not reach this area.

## 1. Reading issues

- **[src]** `dist/index.d.ts` exports nothing issue-related: no `Issue` type, no tracker interface, no label/blocking/parent fields. The only exports are run/sandbox/worktree/agent/session/output APIs (see the export list at the end of `index.d.ts`).
- **[src][doc]** The tracker lives in the CLI, `dist/main.js` `ISSUE_TRACKER_REGISTRY` (~L18611), mirrored upstream in `src/InitService.ts`. Three entries, each just three shell strings plus a Dockerfile snippet and `.env.example` text:
  - `github-issues`: `LIST_TASKS_COMMAND` = `gh issue list --state open --label Sandcastle --limit 100 --json number,title,body,labels,comments --jq ...`; `VIEW_TASK_COMMAND` = `gh issue view <ID>`; `CLOSE_TASK_COMMAND` = `gh issue close <ID> --comment "Completed by Sandcastle"`. Installs `gh` from cli.github.com in the image.
  - `beads`: `bd ready --json` / `bd show <ID>` / `bd close <ID>`; mounts host `.beads/` (0.13.0 changelog b6cb2bb, 2472e66).
  - `custom`: a list command that exits 1 until the user's coding agent edits the scaffold per `.sandcastle/SETUP_ISSUE_TRACKER.md`.
- **[doc]** `docs/agents/adding-an-issue-tracker.md`: "Sandcastle does not embed any issue tracker itself. An issue-tracker entry is a scaffold template ... The generated project then runs those commands itself — Sandcastle is not in the loop at runtime."
- **GitLab: none.** **[doc]** Issue #511 "Please add GitLab Issue Support" and #521 "Jira/Gitlab Integration" were both closed with "Works under 'custom' mode" / "Added 'custom' mode which handles this." No `glab` string in the package; GitHub code search for `gitlab` on `main` hits only the contributor doc above.
- **Local files: none** (beads is the only local tracker, and it is a third-party CLI with its own DB).
- **Labels:** a single fixed label `Sandcastle` baked into the GitHub list command (init's `--create-label` runs `gh label create`, per `docs/guide/init.md` and the pending `windows-gh-label-stderr` changeset). No API-level label filter.
- **Blocking:** **[src]** not modelled. The `simple-loop` prompt tells the agent "Pick the highest-priority open issue that is not blocked by another open issue"; the `parallel-planner` plan prompt has an LLM _infer_ a dependency graph from issue text. GitHub's native `dependencies/blocked_by` is never read. Beads' `bd ready` filters blocked work on its own side.
- **Parent/child:** **[src]** not modelled; prompts say "If it has a parent PRD, pull that in too" and leave it to the agent.
- **What infant does instead:** `Runner.issues()` / `candidates()` in [src/runner.ts](../../src/runner.ts) (~L178-240): local mode parses `.sandcastle/specs/*/issues/*.md` frontmatter via `localIssue()` in [src/policy.ts](../../src/policy.ts) (~L185-221: `title`, `labels`, `blocked_by`, `status`; **`parent` is not parsed**); GitHub mode calls `gh api repos/<repo>/issues?state=open&labels=<issueLabel>` and per-issue `.../dependencies/blocked_by`, and `context()` fetches comments. `ready()` in policy.ts drops `blockedLabels`. All deterministic host-side code, which sandcastle has no equivalent for. **Swap: not plausible.** At most, copy the `gh issue list --json ...` shape.

## 2. Push, PR/MR open/find/merge

- **[src]** No push anywhere in the package (no `"push"` argument in any `dist/*.js`). Host git only does `fetch origin <branch>` + `merge --ff-only` when reusing an existing worktree (`fastForwardFromOrigin`, `dist/chunk-G2R53CVZ.js` ~L637-685) **[undocumented]** beyond the 0.13.0 security note (79664a7) that mentions the `git fetch origin` on reuse.
- **[src][doc]** Branch strategies are `head`, `merge-to-head` (temp branch merged back into the host's HEAD locally) and `branch` (named branch left in place) (`SandboxProvider-*.d.ts` ~L227-248; `docs/guide/branch-strategies.md`). "Merge" in sandcastle always means a local `git merge`; the `parallel-planner` templates run an agent with `merge-prompt.md` ("Run `git merge <branch> --no-edit`").
- **[doc]** Issue #607 ("merger closes issues on GitHub without pushing to origin"): maintainer called pushing out of scope, "trivial to just append a git push in userland". A commenter notes the sandbox needs `gh auth setup-git` in a hook because `GH_TOKEN` alone does not configure git's credential helper.
- **[doc]** Newer than 0.14.0: pending changeset `github-issues-env-example.md` only changes the scaffolded `.env.example` to list token permissions "an agent needs to push branches and open pull requests" (Contents, Pull requests) plus `GH_HOST`/`GH_ENTERPRISE_TOKEN` for GitHub Enterprise. This is documentation for agent-driven `gh` use, not a sandcastle feature. Nothing for GitLab MRs or self-hosted GitLab.
- **What infant does instead:** `Runner.publish()` in [src/runner.ts](../../src/runner.ts) (~L586-648): `gh pr list --head <branch> --state open` to find an existing PR, `git push <remote> <reviewedSha>:refs/heads/<branch>`, `gh pr create --base --head --title --body-file`; `candidates()` skips issues with a non-closed PR (`gh pr list --state all`). Infant never merges PRs. **Swap: nothing to swap to.** The only reusable bit is that infant already uses sandcastle's `branch` strategy via `createSandbox({ branch, baseBranch })` and does push/PR itself on the host, which is the split sandcastle expects.

## 3. Forge auth

- **[src][doc]** Sandcastle leaves auth to the caller and to the CLI the agent runs. For `github-issues` the scaffold writes `GH_TOKEN=` into `.env.example` (fine-grained PAT, Issues read/write + Metadata read); `.sandcastle/.env` keys are injected into the sandbox env. Native sandboxes (`seatbelt`, `bwrap`) hide the host's `gh` login, so init tells the user to set `GH_TOKEN` (`dist/main.js` `envNotes` ~L18705; `docs/guide/init.md`; 0.13.0 changelog 2472e66). No REST/GraphQL client, no token handling in the library. `--create-label` is the only host-side `gh` call, and it is in `init`, not at runtime.
- **What infant does instead:** all forge calls run on the host via `gh` with the user's own `gh` login (`Runner.gh()`; `infant setup` checks `gh repo view ... viewerPermission` for WRITE in [src/main.ts](../../src/main.ts) ~L106-122; `init` reads `gh repo view --json nameWithOwner`). Infant deliberately blanks `GH_TOKEN`/`GITHUB_TOKEN` in the seatbelt env (main.ts ~L274-296) so agents get no forge credentials. This is the opposite of sandcastle's scaffold model (token in sandbox, agent drives `gh`) and is the safer choice; keep it. A GitLab forge would follow the same pattern with `glab` on the host.

## 4. Extension points

- **Library:** `SandboxProvider` (`createBindMountSandboxProvider`, `createIsolatedSandboxProvider`), `AgentProvider`, hooks (`onSandboxReady` etc.), prompt args `{{KEY}}`, and `` !`command` `` shell expansions in prompt files (run inside the sandbox; [docs/guide/prompts.md](https://github.com/mattpocock/sandcastle/blob/main/docs/guide/prompts.md)). **[src]** None of these is a tracker or forge seam.
- **CLI:** the `IssueTrackerEntry` registry (`name`, `label`, `templateArgs: { LIST_TASKS_COMMAND, VIEW_TASK_COMMAND, CLOSE_TASK_COMMAND, ISSUE_TRACKER_TOOLS }`, `envExample`, `sandboxOptions`) in upstream `src/InitService.ts`. It is internal to `sandcastle init` and not exported, so third parties extend it only by a PR upstream (`docs/agents/adding-an-issue-tracker.md` requires an official first-party CLI with env-var auth) or by the `custom` scaffold.
- **What infant does instead:** `config.issues === "local"` switches between `localIssues()` and `gh` in `Runner`; `offline(config)` in `src/config.ts` gates GitHub checks. There is no tracker/forge interface yet, so the tracker (local/github/gitlab) and forge (github/gitlab/none) settings need infant's own seam, likely around `issues()`/`candidates()`/`context()` and `publish()`.

## Recommendation for the trackers spec

1. Build tracker and forge seams in infant; sandcastle offers nothing to reuse here beyond what infant already uses (sandboxes, agents, named-branch worktrees).
2. Keep forge calls on the host with the user's CLI login (`gh`, later `glab`), and keep forge tokens out of the sandbox env.
3. Do not copy sandcastle's model of the agent closing issues or inferring blockers; infant's deterministic blocker check (GitHub dependencies API, local `blocked_by`) is stronger. Parent/child is unmodelled in both; local `parent:` frontmatter exists in ticket files but `localIssue()` ignores it.
4. Recheck on the 1.0 release (`v1-next` tag) in case a tracker API lands; nothing in `main`, open changesets or issues points that way as of 2026-11-13.
