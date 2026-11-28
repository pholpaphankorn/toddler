---
title: How sandcastle can put files into the sandbox's private home
labels: [wayfinder:research, adult]
blocked_by: []
parent: 1
assignee: claude (research subagent)
status: closed
---
## Question

With the Seatbelt provider in `@ai-hero/sandcastle` 0.14.0, what ways exist to make a directory of files visible under the sandbox's private `HOME` (or another path the agent can read)? Compare read-only `mounts` vs copying in via `sandbox.exec` (as toddler does for Codex `auth.json`) vs anything else: where each lands, read-only or not, cost per stage, and any limits (e.g. mounts inside `HOME`). Source: `../sandcastle/src/sandboxes/seatbelt.ts` and docs.

## Answer

Seatbelt `mounts` appear only at their own host path (a different `sandboxPath` throws), are read-only in practice (writes fail with EPERM), and are set per `seatbelt()` instance, though a new instance per stage is cheap and isolated. The private HOME is a fresh random temp dir per sandbox, so nothing can be placed in it before `createSandbox` returns. There is no public copy-in API for seatbelt. `copyToWorktree` puts files in the repo, where the agent can commit them. Two ways work:
- **Read-only mount + symlink into HOME.** About 25 ms per stage, flat cost, read-only content. The agent can only replace the link in its own throwaway HOME.
- **Tar over `exec` stdin.** About 160 ms for 100 files, base64-encoded, writable copy.

Recommendation: the mount + symlink. Not verified: whether Claude Code and Codex follow a symlinked `skills` dir. Fall back to tar if they don't.

Findings: `docs/research/sandbox-home-files.md`.
