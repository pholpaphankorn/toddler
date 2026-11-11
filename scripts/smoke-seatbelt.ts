// No model calls, credentials, network requests, or changes to this repository.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { command } from "../src/process.ts";
import { indexSkills, skillLinks } from "../src/skills.ts";

const directory = await mkdtemp(join(tmpdir(), "toddler-seatbelt-smoke-"));
const root = join(directory, "repo");
const { mkdir } = await import("node:fs/promises");
await mkdir(root);
try {
  await writeFile(join(directory, "outside.txt"), "outside-repo\n");
  const skills = join(directory, "fixture skills");
  for (const name of ["selected", "other"]) {
    await mkdir(join(skills, "upstream", name), { recursive: true });
    await writeFile(join(skills, "upstream", name, "SKILL.md"), `${name}\n`);
  }
  await command("git", ["init", "-b", "main", root]);
  await command("git", ["-C", root, "config", "user.name", "Seatbelt smoke"]);
  await command("git", ["-C", root, "config", "user.email", "smoke@example.invalid"]);
  await writeFile(join(root, "sample.txt"), "sample\n");
  await command("git", ["-C", root, "add", "sample.txt"]);
  await command("git", ["-C", root, "commit", "-m", "Smoke fixture"]);
  const sandbox = await createSandbox({ cwd: root, branch: "codex/smoke", sandbox: seatbelt({
    mounts: [{ hostPath: skills, sandboxPath: skills, readonly: true }],
  }) });
  try {
    const setup = await sandbox.exec(`umask 077; ${skillLinks(["selected"], indexSkills(skills))} && mkdir -p "$HOME/.codex" && cat > "$HOME/.codex/auth.json"`, { stdin: '{"fixture":true}' });
    if (setup.exitCode) throw new Error("Private home credential bootstrap failed");
    for (const provider of [".claude", ".agents"]) {
      const base = `"$HOME/${provider}/skills"`;
      if ((await sandbox.exec(`test "$(cat ${base}/selected/SKILL.md)" = selected && test ! -L ${base}/other`)).exitCode) {
        throw new Error(`Skill links are incorrect for ${provider}`);
      }
      if (!(await sandbox.exec(`echo changed >> ${base}/selected/SKILL.md`)).exitCode) throw new Error(`Skill link is writable for ${provider}`);
    }
    const allowed = await sandbox.exec("git status --short >/dev/null && touch allowed.txt");
    if (allowed.exitCode) throw new Error("Sandbox could not use host tools or write its worktree");
    const denied = await sandbox.exec("cat ../outside.txt");
    // Check a real outside path, rather than a missing relative path.
    const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
    const hostRead = await sandbox.exec(`cat ${quote(join(directory, "outside.txt"))}`);
    const hostWrite = await sandbox.exec(`touch ${quote(join(directory, "forbidden.txt"))}`);
    if (!hostRead.exitCode || !hostWrite.exitCode) throw new Error("Sandbox allowed access outside the worktree");
    if (!denied.exitCode) throw new Error("Unexpected sibling read access");
    await sandbox.exec("rm allowed.txt");
    console.log("PASS: Seatbelt skill links and read-only mount, worktree writes, host tools, private-home auth, outside access denied.");
  } finally { await sandbox.close(); }
} finally { await rm(directory, { recursive: true, force: true }); }
