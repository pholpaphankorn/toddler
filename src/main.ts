#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configPath,
  loadConfig,
  offline,
  providers,
  type Config,
} from "./config.ts";
import { command, codexRpc } from "./process.ts";
import { readUsage, codexAuth, claudeToken, Quotas } from "./quota.ts";
import { Runner, loadState, saveState } from "./runner.ts";
import { assignments } from "./policy.ts";
import { bundledSkillsPath } from "./skills.ts";
import { skillDoctorChecks } from "./skill-doctor.ts";

const usage =
  "Usage: toddler [init|setup|doctor|plan|run|smoke [codex|claude]]";
// This runner uses subscriptions exclusively; avoid accidental metered API use.
for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"])
  delete process.env[key];

// Run a script bundled with toddler from the current directory, passing its exit code through.
function script(file: string, args: string[] = []) {
  const path = fileURLToPath(new URL(`../scripts/${file}`, import.meta.url));
  const result = spawnSync(
    file.endsWith(".sh") ? "bash" : process.execPath,
    [path, ...args],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
}

async function init(root: string) {
  const path = configPath(root);
  if (existsSync(path)) {
    console.log(`${path} already exists.`);
    return;
  }
  let repository: string | undefined;
  try {
    repository = await command("gh", [
      "repo",
      "view",
      "--json",
      "nameWithOwner",
      "--jq",
      ".nameWithOwner",
    ]);
  } catch {
    /* No GitHub repository: set up local issues on local branches. */
  }
  await mkdir(join(root, ".sandcastle"), { recursive: true });
  const project = repository
    ? { repository, install: "", verify: "" }
    : { issues: "local", openPr: false, install: "", verify: "" };
  await writeFile(path, `${JSON.stringify(project, null, 2)}\n`);
  const ignore = join(root, ".sandcastle/.gitignore");
  if (!existsSync(ignore))
    await writeFile(
      ignore,
      ".env\nlogs/\nworktrees/\nstate.json\nstate.json.tmp\nrunner.lock\n",
    );
  console.log(`Wrote ${path} for ${repository ?? "local issues (no GitHub repository found)"}.
Next:${repository ? "" : "\n  0. Write issues as .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md files (spec in spec.md beside issues/)."}
  1. Optionally set "install" to a shell command that installs dependencies in each new sandbox (e.g. "npm ci"),
     and "verify" to a shell command that checks this project inside the sandbox (e.g. "npm test").
  2. Optionally write stack-specific agent notes in .sandcastle/project.md.
  3. Commit .sandcastle/, then run: toddler setup`);
}

async function doctor(config: Config, root: string) {
  let failures = 0;
  const check = async (name: string, action: () => Promise<string>) => {
    try {
      console.log(`OK   ${name}: ${await action()}`);
    } catch (error) {
      failures++;
      console.log(`FAIL ${name}: ${(error as Error).message}`);
    }
  };
  for (const [name, action] of skillDoctorChecks(root, config.skills))
    await check(name, action);
  await check("Sandcastle", async () => {
    await import("@ai-hero/sandcastle");
    return "installed";
  });
  await check("Seatbelt", async () => {
    const { seatbelt } = await import("@ai-hero/sandcastle/sandboxes/seatbelt");
    seatbelt();
    return "available (never falls back to unsandboxed execution)";
  });
  await check("GitHub", async () => {
    if (offline(config)) return "not used (local issues, openPr false)";
    const repo = JSON.parse(
      await command("gh", [
        "repo",
        "view",
        config.repository,
        "--json",
        "nameWithOwner,viewerPermission,defaultBranchRef",
      ]),
    );
    if (!["ADMIN", "MAINTAIN", "WRITE"].includes(repo.viewerPermission))
      throw new Error(
        "Repository write permission needed to push issue branches",
      );
    return `${repo.nameWithOwner}, base ${repo.defaultBranchRef.name}, ${repo.viewerPermission}`;
  });
  for (const provider of providers) {
    await check(`${provider} login`, async () => {
      if (provider === "codex") await codexAuth();
      else await claudeToken();
      return "subscription credentials available (not displayed)";
    });
    await check(`${provider} five-hour quota`, async () => {
      const usage = await readUsage(provider, config);
      return `${usage.remainingPercent}% remaining, resets ${new Date(usage.resetsAt * 1000).toISOString()}`;
    });
    await check(`${provider} CLI`, () =>
      command(provider === "claude" ? "claude" : "codex", ["--version"]),
    );
  }
  await check("Codex requested models", async () => {
    const response = await codexRpc<{ data: { model: string }[] }>(
      "model/list",
      { limit: 100 },
    );
    const names = response.data.map((entry) => entry.model);
    const missing = Object.values(config.models.codex).filter(
      (name) => !names.includes(name),
    );
    if (missing.length)
      throw new Error(
        `Not advertised by this account/CLI: ${missing.join(", ")}`,
      );
    return Object.values(config.models.codex).join(", ");
  });
  console.log(
    "Claude pins: " +
      Object.values(config.models.claude).join(", ") +
      " (access is verified by Claude when a task starts).",
  );
  process.exitCode = failures ? 1 : 0;
}

async function main() {
  const mode = process.argv[2] ?? "run";
  if (mode === "smoke") return script("smoke-agents.ts", process.argv.slice(3));
  if (!["init", "setup", "doctor", "plan", "run"].includes(mode))
    throw new Error(usage);
  let root: string;
  try {
    root = await command("git", ["rev-parse", "--show-toplevel"]);
  } catch {
    throw new Error("Run toddler inside the git repository it should work on");
  }
  process.chdir(root);
  if (existsSync(join(root, ".sandcastle/.env")))
    process.loadEnvFile(join(root, ".sandcastle/.env"));
  if (mode === "init") return init(root);
  if (mode === "setup") return script("setup.sh");
  const config = loadConfig(root, { checkSkillNames: mode !== "doctor" });
  if (mode === "doctor") return doctor(config, root);
  const statePath = join(root, ".sandcastle/state.json");
  const state = loadState(statePath, config.repository);
  const quotas = new Quotas(config);
  const runner = new Runner({
    root,
    config,
    quotas,
    state,
    save: () => saveState(statePath, state),
  });
  if (mode === "plan") {
    await quotas.refresh();
    const issues = await runner.candidates();
    console.log(
      JSON.stringify(
        {
          quotas: Object.fromEntries(quotas.values),
          unavailable: Object.fromEntries(quotas.disabled),
          next: assignments(
            issues,
            (name) => quotas.available(name),
            config,
          ).map(({ issue, provider }) => ({
            issue: issue.number,
            title: issue.title,
            provider,
            implementation: config.models[provider].implementation,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const dirty = await command("git", ["status", "--porcelain"]);
  if (dirty)
    throw new Error(
      "Commit or stash repository changes before starting Sandcastle",
    );
  if (!offline(config)) {
    const remote = await command("git", ["remote", "get-url", config.remote]);
    if (
      !remote.endsWith(`${config.repository}.git`) &&
      !remote.endsWith(config.repository)
    ) {
      throw new Error(
        "Configured push remote does not match the GitHub repository",
      );
    }
  }
  await mkdir(join(root, ".sandcastle/logs"), { recursive: true });
  const lockPath = join(root, ".sandcastle/runner.lock");
  let lock: FileHandle;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch {
    throw new Error(
      "Runner lock exists. Check the PID in .sandcastle/runner.lock before removing a stale lock",
    );
  }
  const stop = () => {
    runner.interrupted = true;
    quotas.stop();
    process.exitCode = 130;
  };
  try {
    await lock.writeFile(`${process.pid}\n`);
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    const { seatbelt } = await import("@ai-hero/sandcastle/sandboxes/seatbelt");
    // Sandcastle imports declared .env keys into the sandbox. These belong to
    // the host only; agents use their private homes and subscription credentials.
    runner.sandboxProvider = seatbelt({
      mounts: [
        {
          hostPath: bundledSkillsPath,
          sandboxPath: bundledSkillsPath,
          readonly: true,
        },
      ],
      env: {
        CODEX_HOME: "",
        CLAUDE_CONFIG_DIR: "",
        CODEX_USAGE_COMMAND: "",
        CLAUDE_USAGE_COMMAND: "",
        CLAUDE_USAGE_TOKEN_COMMAND: "",
        OPENAI_API_KEY: "",
        CODEX_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
      },
    });
    runner.sandcastle = await import("@ai-hero/sandcastle");
    let baseBranch: string;
    if (offline(config)) {
      // Offline jobs branch from the checked-out branch, as it is locally.
      baseBranch = await runner.git(["branch", "--show-current"]);
      if (!baseBranch)
        throw new Error("Check out a branch for local issues to start from");
    } else {
      const repo = JSON.parse(
        await runner.gh([
          "repo",
          "view",
          config.repository,
          "--json",
          "defaultBranchRef",
        ]),
      );
      baseBranch = repo.defaultBranchRef.name;
      await runner.git(["fetch", config.remote, baseBranch]);
    }
    // Disable unavailable logins without taking the other provider down.
    for (const provider of providers) {
      try {
        if (provider === "codex") await codexAuth();
        else await claudeToken();
      } catch {
        quotas.disable(provider, "subscription login unavailable");
      }
    }
    await runner.run(baseBranch);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
