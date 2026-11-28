import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createSandbox,
  type AgentProvider,
  type Sandbox,
} from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import {
  onStopSignal,
  privateHomeAgent,
  stopAgent,
  stripSignalListeners,
  sweepSandbox,
} from "../src/agents.ts";
import type { Provider } from "../src/config.ts";

const running = (pattern: string) => {
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const fake = (command: string) =>
  ({ buildPrintCommand: () => ({ command }) }) as unknown as AgentProvider;

// Starts `command` as a fake agent in a real seatbelt sandbox, waits for
// `sleep <seconds>` to appear, runs `check`, and cleans up whatever is left.
async function withAgent(
  provider: Provider,
  command: (seconds: number) => string,
  check: (sandbox: Sandbox, seconds: number, root: string) => Promise<void>,
) {
  const seconds = 600 + Math.floor(Math.random() * 300);
  const root = mkdtempSync(join(tmpdir(), "toddler-stop-"));
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
      privateHomeAgent(fake(command(seconds)), provider).buildPrintCommand({
        prompt: "",
        dangerouslySkipPermissions: true,
      }).command,
    );
    for (let i = 0; i < 100 && !running(`sleep ${seconds}`); i++)
      await sleep(50);
    assert.ok(running(`sleep ${seconds}`), "fake agent did not start");
    await check(sandbox, seconds, root);
    await sandbox.close();
    await agent.catch(() => {});
  } finally {
    if (running(`sleep ${seconds}`))
      execFileSync("pkill", ["-9", "-f", `sleep ${seconds}`]);
    rmSync(root, { recursive: true, force: true });
  }
}

// Like the real CLIs, the fake starts its tool command in a new process group
// and cleans it up only on the signal that provider handles.
for (const [provider, handled] of [
  ["claude", "TERM"],
  ["codex", "INT"],
] as const) {
  test(
    `cancel leaves no ${provider} shell command running`,
    { timeout: 30_000 },
    () =>
      withAgent(
        provider,
        (seconds) =>
          `bash -c 'set -m; sleep ${seconds} & child=$!; trap "kill -9 -- -$child; exit 1" ${handled}; wait'`,
        async (sandbox, seconds) => {
          await stopAgent(sandbox, provider);
          await sweepSandbox(sandbox, 1);
          assert.equal(running(`sleep ${seconds}`), "");
        },
      ),
  );
}

test(
  "the sweep kills a self-detached command that ignores INT and TERM",
  { timeout: 30_000 },
  () =>
    withAgent(
      "codex",
      // macOS has no setsid(1); perl's POSIX::setsid does the same.
      (seconds) =>
        `bash -c 'trap "" INT TERM; perl -MPOSIX -e "setsid; exec @ARGV" nohup sleep ${seconds} >/dev/null 2>&1 & trap "exit 1" INT; wait'`,
      async (sandbox, seconds) => {
        await stopAgent(sandbox, "codex", 2_000);
        assert.ok(running(`sleep ${seconds}`), "detached sleep died early");
        const killed = await sweepSandbox(sandbox, 1);
        assert.ok(killed.length > 0);
        for (let i = 0; i < 20 && running(`sleep ${seconds}`); i++)
          await sleep(50);
        assert.equal(running(`sleep ${seconds}`), "");
      },
    ),
);

test(
  "the sweep kills an agent that ignores its signal past the grace period and spares host processes",
  { timeout: 30_000 },
  () =>
    withAgent(
      "claude",
      (seconds) => `bash -c 'trap "" INT TERM; sleep ${seconds}'`,
      async (sandbox, seconds, root) => {
        const host = spawn("sleep", [String(seconds + 1)], {
          cwd: root,
          stdio: "ignore",
        });
        try {
          await stopAgent(sandbox, "claude", 300);
          assert.ok(running(`sleep ${seconds}$`), "agent stopped on its own");
          const killed = await sweepSandbox(sandbox, 1);
          assert.ok(!killed.includes(host.pid!));
          for (let i = 0; i < 20 && running(`sleep ${seconds}$`); i++)
            await sleep(50);
          assert.equal(running(`sleep ${seconds}$`), "");
          assert.ok(running(`sleep ${seconds + 1}`), "host sleep was killed");
        } finally {
          host.kill("SIGKILL");
        }
      },
    ),
);

test(
  "after createSandbox only toddler's signal listener remains",
  { timeout: 30_000 },
  async () => {
    const own = () => {};
    const off = onStopSignal(own);
    const root = mkdtempSync(join(tmpdir(), "toddler-signals-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main", root]);
      execFileSync("git", [
        "-C",
        root,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "f",
      ]);
      const sandbox = await createSandbox({
        cwd: root,
        branch: "signals",
        sandbox: seatbelt(),
      });
      try {
        assert.ok(process.listeners("SIGINT").length > 1);
        stripSignalListeners();
        assert.deepEqual(process.listeners("SIGINT"), [own]);
        assert.deepEqual(process.listeners("SIGTERM"), [own]);
      } finally {
        await sandbox.close();
      }
    } finally {
      off();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
