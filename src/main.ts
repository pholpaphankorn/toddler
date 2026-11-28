#!/usr/bin/env node
import { defaults, modelsForProvider, providers } from "./config.ts";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configPath, loadConfig, offline, type Config } from "./config.ts";
import { command, codexRpc } from "./process.ts";
import { onStopSignal } from "./agents.ts";
import {
  readUsage,
  codexAuth,
  claudeToken,
  Quotas,
  loadStopConditions,
  modelMatches,
  type Window,
} from "./quota.ts";
import { Runner, loadState, saveState } from "./runner.ts";
import { builtinRankers, loadRanker } from "./policy.ts";
import { bundledSkillsPath } from "./skills.ts";
import { planJson, planPass, planText } from "./plan.ts";
import { connect, validatePushRemote } from "./forge.ts";
import { smokeForge } from "./smoke-forge.ts";
import { writeKit } from "./kit.ts";

const usage =
  "Usage: toddler [init|setup|doctor|plan|run|smoke [codex|claude]|smoke forge <github|gitlab> <scratch-repository>]";
// This runner uses subscriptions exclusively; avoid accidental metered API use.
for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"])
  delete process.env[key];

// Run a script bundled with toddler from the current directory, passing its exit code through.
function script(file: string, args: string[] = []) {
  const path = fileURLToPath(new URL(`../scripts/${file}`, import.meta.url));
  const result = spawnSync(process.execPath, [path, ...args], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}

// One setup login step: the CLI's signed-in check, else its login with the terminal
// attached. A failed or cancelled login is reported and setup goes on.
function signIn(cli: string, status: string[], login: string[]) {
  if (spawnSync(cli, status, { stdio: "ignore" }).status === 0)
    return console.log(`${cli}: signed in`);
  console.log(`${cli}: signing in…`);
  const ok = spawnSync(cli, login, { stdio: "inherit" }).status === 0;
  console.log(`${cli}: ${ok ? "signed in" : "not signed in"}`);
}

async function init(root: string) {
  const path = configPath(root);
  if (existsSync(path)) {
    console.log(`${path} already exists.`);
    return;
  }
  let repository: string | undefined;
  let forge = "none";
  try {
    repository = await command("gh", [
      "repo",
      "view",
      "--json",
      "nameWithOwner",
      "--jq",
      ".nameWithOwner",
    ]);
    if (repository) forge = "github";
  } catch {
    /* Try GitLab next. */
  }
  if (!repository) {
    try {
      repository = await command("glab", [
        "repo",
        "view",
        "--output",
        "json",
        "--jq",
        ".path_with_namespace",
      ]);
      if (repository) forge = "gitlab";
    } catch {
      /* Neither CLI could identify the repository. */
    }
  }
  let remotes = "";
  if (!repository) {
    try {
      remotes = await command("git", ["remote"], { cwd: root });
    } catch {
      /* Not a git repository. */
    }
  }
  await mkdir(join(root, ".sandcastle"), { recursive: true });
  const project = repository
    ? { forge, repository, install: "", verify: "" }
    : { forge: "none", install: "", verify: "" };
  await writeFile(path, `${JSON.stringify(project, null, 2)}\n`);
  const ignore = join(root, ".sandcastle/.gitignore");
  if (!existsSync(ignore))
    await writeFile(
      ignore,
      ".env\nlogs/\nworktrees/\nstate.json\nstate.json.tmp\nrunner.lock\n",
    );
  console.log(`Wrote ${path} for ${repository ?? "local issues (no forge repository found)"}.${remotes ? `\nGit remote(s) ${remotes.replaceAll("\n", ", ")} could not be read. Log in with gh or glab and rerun toddler init (remove the generated config first).` : ""}
Next:${repository ? `\n  0. Label issues ${defaults.issueLabel} or set \"issues\": \"files\".` : '\n  0. Write issues as .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md files (spec in spec.md beside issues/). Nothing is pushed. Set "autoMerge": true to fast-forward approved work into the base branch.'}
  1. Optionally set "install" to a shell command that installs dependencies in each new sandbox (e.g. "npm ci"),
     and "verify" to a shell command that checks this project inside the sandbox (e.g. "npm test").
  2. Optionally put stack-specific agent notes in AGENTS.md or CLAUDE.md; agents read them from the worktree.
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
  await check("Ranking", async () => {
    await loadRanker(root, config);
    return builtinRankers.includes(config.ranking)
      ? `${config.ranking} (built-in)`
      : config.ranking;
  });
  for (const name of config.stopConditions)
    await check(`Stop condition ${name}`, async () => {
      await loadStopConditions(root, { ...config, stopConditions: [name] });
      return name;
    });
  await check("Sandcastle", async () => {
    await import("@ai-hero/sandcastle");
    return "installed";
  });
  await check("Seatbelt", async () => {
    const { seatbelt } = await import("@ai-hero/sandcastle/sandboxes/seatbelt");
    seatbelt();
    return "available (never falls back to unsandboxed execution)";
  });
  for (const [name, action] of connect(root, config).forge.doctorChecks(config))
    await check(name, action);
  for (const provider of config.providers) {
    await check(`${provider} login`, async () => {
      if (provider === "codex") await codexAuth();
      else await claudeToken();
      return "subscription credentials available (not displayed)";
    });
    await check(`${provider} quota`, async () => {
      const reading = await readUsage(provider, config);
      const describe = (window: Window | null) =>
        window
          ? `${window.remainingPercent}% remaining, resets ${window.resetsAt === null ? "unknown" : new Date(window.resetsAt * 1000).toISOString()}`
          : "no limit";
      const buckets = Object.entries(reading.weeklyByModel).map(
        ([label, window]) =>
          `${label}: ${describe(window)}${modelsForProvider(config, provider).some((model) => modelMatches(provider, label, model)) ? "" : " (no configured model matches)"}`,
      );
      return [
        `five-hour: ${describe(reading.fiveHour)}`,
        `weekly: ${describe(reading.weekly)}`,
        ...buckets,
      ].join("; ");
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
    const missing = modelsForProvider(config, "codex").filter(
      (name) => !names.includes(name),
    );
    if (missing.length)
      throw new Error(
        `Not advertised by this account/CLI: ${missing.join(", ")}`,
      );
    return modelsForProvider(config, "codex").join(", ");
  });
  console.log(
    "Claude pins: " +
      modelsForProvider(config, "claude").join(", ") +
      " (access is verified by Claude when a task starts).",
  );
  process.exitCode = failures ? 1 : 0;
}

async function main() {
  const mode = process.argv[2] ?? "run";
  if (mode === "smoke" && process.argv[3] === "forge")
    return smokeForge(process.argv.slice(4));
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
  if (mode === "setup") {
    if (!existsSync(configPath(root)))
      throw new Error("No .sandcastle/config.json: run `toddler init` first");
    const config = loadConfig(root, { checkSkillNames: false });
    for (const line of writeKit(root, config)) console.log(line);
    if (config.forge === "github")
      signIn(
        "gh",
        ["auth", "status", "--hostname", "github.com"],
        ["auth", "login", "--hostname", "github.com"],
      );
    if (config.forge === "gitlab") {
      const host = spawnSync("glab", ["config", "get", "host"], {
        encoding: "utf8",
      }).stdout?.trim();
      signIn(
        "glab",
        ["auth", "status"],
        ["auth", "login", "--hostname", host || "gitlab.com"],
      );
    }
    for (const provider of providers)
      if (!config.providers.includes(provider))
        console.log(`${provider}: skipped (no role uses it)`);
      else if (provider === "codex")
        signIn("codex", ["login", "status"], ["login"]);
      else signIn("claude", ["auth", "status"], ["auth", "login"]);
    return doctor(config, root);
  }
  const config = loadConfig(root, { checkSkillNames: mode !== "doctor" });
  if (mode === "doctor") return doctor(config, root);
  const ranker = await loadRanker(root, config);
  const stopConditions = await loadStopConditions(root, config);
  const statePath = join(root, ".sandcastle/state.json");
  const state = loadState(statePath, config.repository);
  const quotas = new Quotas(config, undefined, stopConditions);
  const runner = new Runner({
    root,
    config,
    quotas,
    ranker,
    state,
    save: () => saveState(statePath, state),
  });
  if (mode === "plan") {
    await quotas.refresh();
    const pass = planPass(
      runner.scheduler,
      await runner.candidates(),
      state.jobs,
    );
    console.log(
      process.argv.includes("--json")
        ? JSON.stringify(planJson(runner.scheduler, pass), null, 2)
        : planText(runner.scheduler, pass),
    );
    return;
  }
  const dirty = await command("git", ["status", "--porcelain"]);
  if (dirty)
    throw new Error(
      "Commit or stash repository changes before starting Sandcastle",
    );
  if (!offline(config)) {
    await validatePushRemote(
      command,
      config.remote,
      config.repository,
      config.forge,
    );
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
  // A second Ctrl+C exits at once, which skips the finally below.
  const unlock = () => rmSync(lockPath, { force: true });
  process.on("exit", unlock);
  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(130);
    stopping = true;
    runner.interrupted = true;
    quotas.stop();
    process.exitCode = 130;
  };
  const offStop = onStopSignal(stop);
  try {
    await lock.writeFile(`${process.pid}\n`);
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
        GITLAB_TOKEN: "",
      },
    });
    runner.sandcastle = await import("@ai-hero/sandcastle");
    const { branch: baseBranch } = await runner.forge.base();
    // Disable unavailable logins without taking the other provider down.
    for (const provider of config.providers) {
      try {
        if (provider === "codex") await codexAuth();
        else await claudeToken();
      } catch {
        quotas.lock(provider, "subscription login unavailable");
      }
    }
    await runner.run(baseBranch);
  } finally {
    offStop();
    process.removeListener("exit", unlock);
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
