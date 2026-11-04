import { existsSync } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.mjs";
import { command, codexRpc } from "./process.mjs";
import { readUsage, codexAuth, claudeToken, Quotas } from "./quota.mjs";
import { Runner, loadState, saveState } from "./runner.mjs";
import { assignments } from "./policy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
if (existsSync(join(root, ".sandcastle/.env"))) process.loadEnvFile(join(root, ".sandcastle/.env"));
// This runner uses subscriptions exclusively; avoid accidental metered API use.
for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[key];

async function doctor() {
  let failures = 0;
  const check = async (name, action) => {
    try { console.log(`OK   ${name}: ${await action()}`); }
    catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
  };
  await check("Sandcastle", async () => {
    await import("@ai-hero/sandcastle");
    return "local checkout linked";
  });
  await check("Seatbelt", async () => {
    const { seatbelt } = await import("@ai-hero/sandcastle/sandboxes/seatbelt");
    seatbelt(); return "available (never falls back to unsandboxed execution)";
  });
  await check("GitHub", async () => {
    const repo = JSON.parse(await command("gh", ["repo", "view", config.repository, "--json", "nameWithOwner,viewerPermission,defaultBranchRef"]));
    if (!["ADMIN", "MAINTAIN", "WRITE"].includes(repo.viewerPermission)) throw new Error("Repository write permission needed to push issue branches");
    return `${repo.nameWithOwner}, base ${repo.defaultBranchRef.name}, ${repo.viewerPermission}`;
  });
  for (const provider of ["codex", "claude"]) {
    await check(`${provider} login`, async () => {
      if (provider === "codex") await codexAuth(); else await claudeToken();
      return "subscription credentials available (not displayed)";
    });
    await check(`${provider} five-hour quota`, async () => {
      const usage = await readUsage(provider, config);
      return `${usage.remainingPercent}% remaining, resets ${new Date(usage.resetsAt * 1000).toISOString()}`;
    });
    await check(`${provider} CLI`, () => command(provider === "claude" ? "claude" : "codex", ["--version"]));
  }
  await check("Codex requested models", async () => {
    const response = await codexRpc("model/list", { limit: 100 });
    const names = response.data.map((entry) => entry.model);
    const missing = Object.values(config.models.codex).filter((name) => !names.includes(name));
    if (missing.length) throw new Error(`Not advertised by this account/CLI: ${missing.join(", ")}`);
    return Object.values(config.models.codex).join(", ");
  });
  console.log("Claude pins: " + Object.values(config.models.claude).join(", ") + " (access is verified by Claude when a task starts).");
  process.exitCode = failures ? 1 : 0;
}

async function main() {
  const mode = process.argv[2] ?? "run";
  if (mode === "doctor") return doctor();
  if (!["run", "plan"].includes(mode)) throw new Error("Usage: npm run sandcastle -- [run|plan|doctor]");
  const statePath = join(root, ".sandcastle/state.json");
  const state = loadState(statePath, config.repository);
  const quotas = new Quotas(config);
  const runner = new Runner({ root, config, quotas, state, save: () => saveState(statePath, state) });
  if (mode === "plan") {
    await quotas.refresh();
    const issues = await runner.candidates();
    console.log(JSON.stringify({ quotas: Object.fromEntries(quotas.values),
      unavailable: Object.fromEntries(quotas.disabled),
      next: assignments(issues, (name) => quotas.available(name), config).map(({ issue, provider }) =>
        ({ issue: issue.number, title: issue.title, provider, implementation: config.models[provider].implementation })),
    }, null, 2));
    return;
  }
  const dirty = await command("git", ["status", "--porcelain"]);
  if (dirty) throw new Error("Commit or stash repository changes before starting Sandcastle");
  const remote = await command("git", ["remote", "get-url", config.remote]);
  if (!remote.endsWith(`${config.repository}.git`) && !remote.endsWith(config.repository)) {
    throw new Error("Configured push remote does not match the GitHub repository");
  }
  await mkdir(join(root, ".sandcastle/logs"), { recursive: true });
  const lockPath = join(root, ".sandcastle/runner.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch { throw new Error("Runner lock exists. Check the PID in .sandcastle/runner.lock before removing a stale lock"); }
  const stop = () => { runner.interrupted = true; quotas.stop(); process.exitCode = 130; };
  try {
    await lock.writeFile(`${process.pid}\n`);
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
    const { seatbelt } = await import("@ai-hero/sandcastle/sandboxes/seatbelt");
    // Sandcastle imports declared .env keys into the sandbox. These belong to
    // the host only; agents use their private homes and subscription credentials.
    runner.sandboxProvider = seatbelt({ env: {
      CODEX_HOME: "", CLAUDE_CONFIG_DIR: "", CODEX_USAGE_COMMAND: "", CLAUDE_USAGE_COMMAND: "",
      CLAUDE_USAGE_TOKEN_COMMAND: "",
      OPENAI_API_KEY: "", CODEX_API_KEY: "", ANTHROPIC_API_KEY: "", GH_TOKEN: "", GITHUB_TOKEN: "",
    } });
    runner.sandcastle = await import("@ai-hero/sandcastle");
    const repo = JSON.parse(await runner.gh(["repo", "view", config.repository, "--json", "defaultBranchRef"]));
    const baseBranch = repo.defaultBranchRef.name;
    await runner.git(["fetch", config.remote, baseBranch]);
    // Disable unavailable logins without taking the other provider down.
    for (const provider of ["codex", "claude"]) {
      try { if (provider === "codex") await codexAuth(); else await claudeToken(); }
      catch { quotas.disable(provider, "subscription login unavailable"); }
    }
    await runner.run(baseBranch);
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await lock.close(); await rm(lockPath, { force: true });
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
