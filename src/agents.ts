import type { AgentProvider, Sandbox } from "@ai-hero/sandcastle";
import { setTimeout as sleep } from "node:timers/promises";
import type { Provider } from "./config.ts";

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
      const pid = '"$TMPDIR/infant-agent.pid"';
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
    .exec('cat "$TMPDIR/infant-agent.pid" 2>/dev/null')
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
