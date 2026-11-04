// No model calls, credentials, network requests, or changes to this repository.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { command } from "./process.mjs";

const directory = await mkdtemp(join(tmpdir(), "nvim-seatbelt-smoke-"));
const root = join(directory, "repo");
const { mkdir } = await import("node:fs/promises");
await mkdir(root);
try {
  await writeFile(join(directory, "outside.txt"), "outside-repo\n");
  await command("git", ["init", "-b", "main", root]);
  await command("git", ["-C", root, "config", "user.name", "Seatbelt smoke"]);
  await command("git", ["-C", root, "config", "user.email", "smoke@example.invalid"]);
  await writeFile(join(root, "sample.lua"), "return {}\n");
  await command("git", ["-C", root, "add", "sample.lua"]);
  await command("git", ["-C", root, "commit", "-m", "Smoke fixture"]);
  const sandbox = await createSandbox({ cwd: root, branch: "codex/smoke", sandbox: seatbelt() });
  try {
    const setup = await sandbox.exec('umask 077; mkdir -p "$HOME/.codex"; cat > "$HOME/.codex/auth.json"', { stdin: '{"fixture":true}' });
    if (setup.exitCode) throw new Error("Private home credential bootstrap failed");
    const allowed = await sandbox.exec("luac -p sample.lua && touch allowed.txt");
    if (allowed.exitCode) throw new Error("Sandbox could not use host Lua or write its worktree");
    const denied = await sandbox.exec("cat ../outside.txt");
    // Check a real outside path, rather than a missing relative path.
    const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
    const hostRead = await sandbox.exec(`cat ${quote(join(directory, "outside.txt"))}`);
    const hostWrite = await sandbox.exec(`touch ${quote(join(directory, "forbidden.txt"))}`);
    if (!hostRead.exitCode || !hostWrite.exitCode) throw new Error("Sandbox allowed access outside the worktree");
    if (!denied.exitCode) throw new Error("Unexpected sibling read access");
    await sandbox.exec("rm allowed.txt");
    console.log("PASS: Seatbelt worktree writes, host Lua, stdin/private-home auth bootstrap, outside reads/writes denied.");
  } finally { await sandbox.close(); }
} finally { await rm(directory, { recursive: true, force: true }); }
