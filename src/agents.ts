import type { AgentProvider, Sandbox } from "@ai-hero/sandcastle";
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import type { Provider } from "./config.ts";

const execFileAsync = promisify(execFile);

// Sandcastle supplies HOME and TMPDIR for each private Seatbelt sandbox.
export function privateHomeAgent(
  baseAgent: AgentProvider,
  provider: Provider,
): AgentProvider {
  return {
    ...baseAgent,
    buildPrintCommand(options) {
      const print = baseAgent.buildPrintCommand(options);
      const hostOnly =
        "CODEX_HOME CLAUDE_CONFIG_DIR OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY GH_TOKEN GITHUB_TOKEN GITLAB_TOKEN CODEX_USAGE_COMMAND CLAUDE_USAGE_COMMAND CLAUDE_USAGE_TOKEN_COMMAND";
      const clear = `unset ${hostOnly}${provider === "codex" ? " CLAUDE_CODE_OAUTH_TOKEN" : ""}; `;
      // Claude defaults to /tmp on macOS even when TMPDIR is set; keep its
      // internal files inside Seatbelt's private temp directory.
      const temp =
        provider === "claude" ? 'export CLAUDE_CODE_TMPDIR="$TMPDIR"; ' : "";
      // stopAgent signals this shell's process group while the file exists.
      // The no-op trap keeps the shell alive until the agent has cleaned up,
      // and unlike an ignored signal it is not inherited by the agent.
      const pid = '"$TMPDIR/toddler-agent.pid"';
      return {
        ...print,
        command: `trap : TERM INT; echo $$ > ${pid}; ${clear}${temp}${print.command}; status=$?; rm -f ${pid}; exit $status`,
      };
    },
  };
}

// Sandcastle only SIGKILLs the agent's process group, but both CLIs start shell
// commands in groups of their own, which would outlive it. Claude kills them on
// SIGTERM; codex exec on SIGINT, its only handler. Seatbelt blocks signals from
// another sandbox-exec, so they come from the host.
export async function stopAgent(
  sandbox: Sandbox,
  provider: Provider,
  graceMs = 10_000,
): Promise<void> {
  const read = await sandbox
    .exec('cat "$TMPDIR/toddler-agent.pid" 2>/dev/null')
    .catch(() => undefined);
  const group = Number(read?.stdout.trim());
  if (!Number.isInteger(group) || group <= 1) return;
  const signal = (name: NodeJS.Signals | 0) => {
    try {
      process.kill(-group, name);
      return true;
    } catch {
      return false;
    }
  };
  if (!signal(provider === "codex" ? "SIGINT" : "SIGTERM")) return;
  for (const end = Date.now() + graceMs; Date.now() < end && signal(0);)
    await sleep(100);
}

const ownSignalListeners = new Set<NodeJS.SignalsListener>();

// Toddler's SIGINT/SIGTERM listener; stripSignalListeners keeps only these.
export function onStopSignal(listener: NodeJS.SignalsListener): () => void {
  ownSignalListeners.add(listener);
  process.on("SIGINT", listener);
  process.on("SIGTERM", listener);
  return () => {
    ownSignalListeners.delete(listener);
    process.removeListener("SIGINT", listener);
    process.removeListener("SIGTERM", listener);
  };
}

// Call right after every createSandbox: sandcastle's listeners SIGKILL and
// process.exit(1) before a stage's finally can stop its agent. Node copies the
// listener list before calling it, so removing them inside toddler's handler
// would be too late.
// shortcut: relies on sandcastle's internal listener behaviour (a flag that keeps them gone until every teardown unregisters); switch to an upstream option if sandcastle adds one.
export function stripSignalListeners(): void {
  if (!ownSignalListeners.size) return;
  for (const name of ["SIGINT", "SIGTERM"] as const)
    for (const listener of process.listeners(name))
      if (!ownSignalListeners.has(listener))
        process.removeListener(name, listener);
}

// SIGKILLs this user's processes, other than toddler, whose cwd is under the
// sandbox's worktree or its seatbelt private root. Run before close().
// shortcut: a process that moved its cwd outside those paths escapes.
export async function sweepSandbox(
  sandbox: Sandbox,
  issue: number,
): Promise<number[]> {
  const roots = [await realpath(sandbox.worktreePath).catch(() => "")];
  const tmp = await sandbox
    .exec('printf %s "$TMPDIR"')
    .then(({ stdout }) => stdout.trim().replace(/\/+$/, ""))
    .catch(() => "");
  if (basename(dirname(tmp)).startsWith("sandcastle-seatbelt-"))
    roots.push(dirname(tmp));
  const listing = await execFileAsync(
    "lsof",
    ["-w", "-a", "-d", "cwd", "-u", String(process.getuid!()), "-Fn"],
    { maxBuffer: 16 * 1024 * 1024 },
  ).then(
    ({ stdout }) => stdout,
    // lsof exits 1 when some entries could not be read; keep what it found.
    (error: { stdout?: string }) => error.stdout ?? "",
  );
  const killed: number[] = [];
  let pid = 0;
  for (const line of listing.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (
      line.startsWith("n") &&
      pid !== process.pid &&
      roots.some(
        (root) =>
          root !== "" &&
          (line.slice(1) === root || line.startsWith(`n${root}/`)),
      )
    ) {
      try {
        process.kill(pid, "SIGKILL");
        killed.push(pid);
      } catch {}
    }
  }
  if (killed.length)
    console.log(
      `[issue #${issue}] killed ${killed.length} leftover process${killed.length === 1 ? "" : "es"} (pids ${killed.join(", ")})`,
    );
  return killed;
}
