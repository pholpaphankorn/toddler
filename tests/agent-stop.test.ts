import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createSandbox, type AgentProvider } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { privateHomeAgent, stopAgent } from "../src/agents.ts";

const running = (pattern: string) => {
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

// Like the real CLIs, the fake starts its tool command in a new process group
// and cleans it up only on the signal that provider handles.
for (const [provider, handled] of [
  ["claude", "TERM"],
  ["codex", "INT"],
] as const) {
  test(
    `cancel leaves no ${provider} shell command running`,
    { timeout: 30_000 },
    async () => {
      const seconds = 600 + Math.floor(Math.random() * 300);
      const fake = {
        buildPrintCommand: () => ({
          command: `bash -c 'set -m; sleep ${seconds} & child=$!; trap "kill -9 -- -$child; exit 1" ${handled}; wait'`,
        }),
      } as unknown as AgentProvider;
      const root = mkdtempSync(join(tmpdir(), "infant-stop-"));
      try {
        execFileSync("git", ["init", "-q", "-b", "main", root]);
        writeFileSync(join(root, "f"), "f\n");
        execFileSync("git", ["-C", root, "add", "f"]);
        execFileSync("git", [
          "-C",
          root,
          "-c",
          "user.name=t",
          "-c",
          "user.email=t@example.invalid",
          "commit",
          "-qm",
          "f",
        ]);
        const sandbox = await createSandbox({
          cwd: root,
          branch: "stop",
          sandbox: seatbelt(),
        });
        const agent = sandbox.exec(
          privateHomeAgent(fake, provider).buildPrintCommand({
            prompt: "",
            dangerouslySkipPermissions: true,
          }).command,
        );
        for (let i = 0; i < 100 && !running(`sleep ${seconds}`); i++)
          await sleep(50);
        assert.ok(running(`sleep ${seconds}`), "fake agent did not start");
        await stopAgent(sandbox, provider);
        await sandbox.close();
        await agent.catch(() => {});
        assert.equal(running(`sleep ${seconds}`), "");
      } finally {
        if (running(`sleep ${seconds}`))
          execFileSync("pkill", ["-f", `sleep ${seconds}`]);
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
}
