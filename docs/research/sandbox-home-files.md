# Getting a skills directory into a seatbelt() sandbox's private HOME

Question: how can infant make a directory of files (skill folders, about 100 files) readable by the agent under the sandbox's private `HOME` (`$HOME/.claude/skills`, `$HOME/.codex/skills`, `$HOME/.agents/skills`) or at another readable path? This note covers `seatbelt()` in `@ai-hero/sandcastle` 0.14.0.

Date: 2026-11-04.

## Sources

- Installed package: `infant/node_modules/@ai-hero/sandcastle` (version 0.14.0), in particular `dist/sandboxes/seatbelt.js`, `dist/sandboxes/seatbelt.d.ts`, `dist/index.d.ts` and `dist/chunk-HSXPRZKG.js`.
- Sandcastle checkout: `../sandcastle/src`, including `sandboxes/seatbelt.ts`, `seatbeltSandbox.ts`, `seatbeltProfile.ts`, `identityMounts.ts`, `MountConfig.ts`, `SandboxProvider.ts`, `createSandbox.ts` and `nativeSandboxIo.ts`. Its `package.json` says 0.12.0, with unreleased changesets on top.
- Docs: `../sandcastle/docs/guide/sandbox-providers.md`, section "Native sandboxes".
- An empirical probe run against the installed 0.14.0 on this Mac. The script is outside the repo (`scratchpad/probe/probe.mjs`), and its results are quoted below as **[probe]**.

**Checkout vs installed.** The checkout's `package.json` says 0.12.0, but the installed 0.14.0 dist matches it on everything below. Both have `SANDBOX_HOME = "/home/agent"`, the identity-mount check that throws "sandboxPath must equal hostPath", the readable, writable and protected roots built from mounts, the `(deny file-write* (subpath …))` rule for read-only mounts, `copyFileIn` through `toHostPath`, and the same `CreateSandboxOptions` (`branch`, `baseBranch`, `sandbox`, `cwd`, `hooks`, `copyToWorktree`, `timeouts`). The one difference seen is that the 0.14.0 `Sandbox` handle adds `sandboxId`, which is `undefined` for seatbelt. That doesn't affect anything here.

## How the private HOME works

- Each `createSandbox` call makes a fresh `mkdtemp` dir, `$TMPDIR/sandcastle-seatbelt-XXXX/{home,tmp}`. `HOME` is set to the real path of that `home` dir, which has a random name, for example `/private/var/folders/.../sandcastle-seatbelt-wqOIe5/home` **[probe]**. The dir is removed on `close()` (`seatbeltSandbox.ts` `makePrivateDirs` / `removePrivateDirs`; `seatbelt.ts` `close`).
- `HOME` is writable by the agent (`writableRoots: [..., dirs.home, dirs.tmp]`).
- Sandcastle's logical name for it is `/home/agent`. Seatbelt can't remap paths, so `/home/agent` exists only inside Sandcastle's own copy helpers (`toHostPath`), not on disk inside the sandbox.
- Because the path is random and only exists after `createSandbox` returns, nothing can be set up to land inside it before the sandbox exists.

## Options

### 1. The `mounts` option on `seatbelt()`

```ts
seatbelt({ mounts: [{ hostPath: dir, sandboxPath: dir, readonly: true }] });
```

- **Where the files land:** only at their own host path. `resolveIdentityMounts` throws at construction when the resolved `sandboxPath` differs from `hostPath` (`identityMounts.ts`; the same text is in `dist/chunk-HSXPRZKG.js`). **A mount can't target a path inside the private HOME.** `sandboxPath: "~/.claude/skills"` expands to `/home/agent/.claude/skills`, which fails the check. **[probe]**: "THROWS: seatbelt() mounts appear at their host path, so sandboxPath must equal hostPath".
- **How it is enforced:** a read-only mount is added to `readableRoots` (`file-read* file-map-executable`) and to `protectedPaths`, which get `(deny file-write* (subpath …))` at the end of the profile so nothing earlier can reopen them (`seatbeltProfile.ts` `buildSeatbeltPolicy`). **[probe]**: `touch` and `rm` inside the mount both fail with "Operation not permitted". Reads work.
- **Granularity:** mounts belong to the provider instance, not to a `createSandbox` call. `CreateSandboxOptions` has no `mounts` field (checked in both `createSandbox.ts` and `dist/index.d.ts`). They are captured as `userMounts` in the `seatbelt()` closure and applied to every sandbox that provider creates. To vary mounts per stage, build a new `seatbelt({...})` per stage. That is cheap, because `assertSeatbeltUsable` checks once per process (`seatbelt.ts` docstring). **[probe]**: a second `createSandbox` with its own `seatbelt()` instance could not read the first instance's mount ("Operation not permitted"), so instances really are independent. Today infant builds one provider in `main.ts:131` and stores it on `runner.sandboxProvider`.
- **Host-home paths are fine:** a read-only mount under the host's `~` was readable **[probe]**. The profile only denies container-engine dirs under the host home (`.docker`, `.colima`, …).
- **A path that doesn't exist** is dropped silently when the sandbox is created (`realMount` uses `Effect.option(fs.realPath(...))`). Symlinked host paths are resolved to their real path first.
- **Per-stage cost:** nothing beyond the profile. There is no copying.
- **Gotchas:** the agent sees the host's absolute path, which reveals the host directory layout. Mounting alone doesn't put anything in `$HOME`. Use it together with option 4.

### 2. Copy in with `sandbox.exec` and tar over stdin

```ts
const tgz = execFileSync("tar", ["-czf", "-", "-C", skillsDir, "."]);
await sandbox.exec(
  'mkdir -p "$HOME/.claude/skills" && base64 -d | tar -xzf - -C "$HOME/.claude/skills"',
  { stdin: tgz.toString("base64") },
);
```

- **Where the files land:** anywhere under `$HOME`, at the exact paths each agent CLI looks in. This is the same mechanism infant uses for `auth.json` today (`runner.ts:152`).
- **Writable:** yes. `HOME` is a writable root, so the agent can edit or delete its own copy. **[probe]**: appending to a copied `SKILL.md` succeeded. The copy is gone on `close()`, so edits never reach the host.
- **Per-stage cost:** **[probe]** 100 files (about 10 KB as tgz) took about 160 ms, including host-side `tar`, against about 23 ms for a bare `exec`. Cost grows with total size.
- **Limits:**
  - `stdin` is typed `string` (`SandboxExecOptions.stdin`; `runInSeatbelt` does `proc.stdin.end(opts.stdin ?? "")`). Binary data needs base64 (as above). Passing a `Buffer` might work at runtime, but that is **unverified** and outside the type.
  - The tool doesn't document a size cap. The whole payload is held in memory as one string.
  - `tar` and `base64` come from `/usr/bin`, which is readable through `SYSTEM_READ_ROOTS`.
- **Gotcha:** it needs one extra `exec` per stage before `run()`, and a check of `exitCode` (non-zero is returned, not thrown).

### 3. Sandcastle copy APIs

- **`copyIn` / `copyToSandbox`:** these don't exist on the public API. `copyIn` exists only on `IsolatedSandboxHandle` (Daytona, Vercel and so on), not on bind-mount providers like seatbelt (`SandboxProvider.ts`).
- **`copyFileIn(hostPath, sandboxPath)`:** this exists on seatbelt's `BindMountSandboxHandle`. It copies **one file**, creates parents, and maps `/home/agent/...` to the private home (`seatbelt.ts` `createHandle`, `nativeSandboxIo.ts` `copyCreatingParents`). It is **not reachable from infant**: the public `Sandbox` returned by `createSandbox` exposes only `branch`, `worktreePath`, `sandboxId`, `run`, `interactive`, `exec`, `close` (`dist/index.d.ts`). The bind-mount handle is internal (`SandboxHandleContext.bindMountHandle`). Using it would mean a custom provider wrapping `seatbelt()`, or calling `fs.cp` straight into the private home dir. You can learn that dir's host path by running `echo $HOME` through `exec`, since seatbelt's HOME is a real host dir, but that depends on a seatbelt implementation detail. **Not recommended.**
- **`copyToWorktree: string[]`:** this copies paths from the host **repo root** into the **worktree** when the sandbox is created (`createSandbox.ts`). The files land inside the repo checkout, where they are writable, visible to `git status`, and can be committed by the agent. The source must also be inside the repo. That makes it a poor fit for skills that live outside the repo.
- **`hooks.sandbox.onSandboxReady: { command }[]`:** shell commands run inside the sandbox once it is ready. There is no stdin, so this can't carry file contents, but it can run the `ln -s` from option 4. That is equivalent to one `sandbox.exec`.

### 4. Symlinks in HOME pointing at a read-only mount (option 1 plus a link)

```ts
seatbelt({
  mounts: [{ hostPath: skillsDir, sandboxPath: skillsDir, readonly: true }],
});
// per stage:
await sandbox.exec(
  `mkdir -p "$HOME/.claude" "$HOME/.agents" && ln -s ${q(skillsDir)} "$HOME/.claude/skills" && ln -s ${q(skillsDir)} "$HOME/.agents/skills"`,
);
```

- **Where the files land:** at `$HOME/.claude/skills/...` and so on through the link. The real files stay in the mount.
- **Read-only:** yes. Seatbelt checks the resolved path, so the mount's deny still applies. **[probe]**: reads through the link work, and `find -L` sees all 100 files. Writing through the link fails with "Operation not permitted". A link to a host dir that isn't mounted is unreadable ("Operation not permitted"), so a link can't widen access.
- **The link itself is writable:** the agent can delete the link and put its own dir in its place. **[probe]**: "replaced". This only affects its own private, throwaway HOME, so it isn't an escape.
- **Per-stage cost:** one `exec`, about 20–30 ms, regardless of how many files there are.
- **Gotchas:**
  - **Unverified:** whether Claude Code and Codex discover skills through a symlinked `skills` dir, or through symlinked skill folders inside a real `skills` dir. Some directory scanners skip symlinks or resolve them with realpath. Check this with a real `run()` before relying on it. The fallback is option 2, which needs no symlinks.
  - **Unverified:** the exact skill search paths of each CLI version (`~/.claude/skills` for Claude Code; `$CODEX_HOME/skills`, which is `~/.codex/skills`, and/or `~/.agents/skills` for Codex). I didn't check them against the CLIs' docs here. Note that infant sets `CODEX_HOME: ""` in the provider env (`main.ts:132`). How Codex treats an empty `CODEX_HOME` is also **unverified**.
  - The mount applies to every sandbox from that provider instance, including stages that don't need skills. Use per-stage providers if that matters.

### Not an option: putting files in a default-readable system root

`/Library`, `/opt`, `/usr` and similar paths are readable in every sandbox (`SYSTEM_READ_ROOTS`). Files placed there would be readable without a mount, but they would be readable by every sandbox, and infant would need root or a global install to write them there. It's included here only to rule it out.

## Comparison

| Approach              | Lands in `$HOME`?         | Read-only to agent           | Per-stage cost                | Main risk                             |
| --------------------- | ------------------------- | ---------------------------- | ----------------------------- | ------------------------------------- |
| `mounts` alone        | No, only at the host path | Yes (deny `file-write*`)     | ~0                            | Agent CLIs don't look there           |
| tar over `exec` stdin | Yes                       | No (private copy, discarded) | ~160 ms per 100 files / 10 KB | Size grows with skills; base64 needed |
| `copyFileIn`          | Yes                       | No                           | Per file                      | Not on the public `Sandbox` API       |
| `copyToWorktree`      | No, in the repo worktree  | No                           | Copy per stage                | Agent can commit the files            |
| mount + symlink       | Yes, through the link     | Yes                          | One `exec`, ~25 ms            | CLI symlink discovery unverified      |

## Recommendation

Use **mount + symlink** (option 4). Add a read-only identity mount of the host skills dir to the `seatbelt()` provider. Then, in `runStage`, run one `ln -s` exec next to the existing Codex `auth.json` exec. It keeps the skills read-only, costs one cheap exec, and doesn't scale with file count. If the agent CLIs need a different skill set per stage, build a `seatbelt()` instance per stage rather than one in `main.ts`.

Before adopting it, run one real `run()` per CLI to confirm that Claude Code and Codex list a skill found through the symlink. If either one ignores symlinks, fall back to **tar over stdin** (option 2). It is proven, needs no provider change, and at ~100 small files costs well under 200 ms per stage. Its one drawback is that the agent can edit its own discarded copy.
