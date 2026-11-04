// Explicit opt-in: makes one tiny subscription model call per configured role.
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, codex, claudeCode, type Sandbox } from "@ai-hero/sandcastle";
import { seatbelt } from "@ai-hero/sandcastle/sandboxes/seatbelt";
import { command } from "./process.ts";
import { codexAuth, claudeToken, Quotas } from "./quota.ts";
import { privateHomeAgent } from "./agents.ts";
import { defaults as config, providers as allProviders, type Provider } from "./config.ts";

const providers = process.argv[2] ? [process.argv[2] as Provider] : allProviders;
if (providers.some((provider) => !allProviders.includes(provider))) throw new Error("Expected codex or claude");
const root = await mkdtemp(join(tmpdir(), "sandcastle-model-smoke-"));
// shortcut: smokes the default models, not a project's overrides; load the project config if overrides get used.
const quotas = new Quotas(config);
let sandbox: Sandbox | undefined;
try {
  await mkdir(join(root, ".sandcastle/logs"), { recursive: true });
  await command("git", ["init", "-b", "main", root]);
  await command("git", ["-C", root, "config", "user.name", "Model smoke"]);
  await command("git", ["-C", root, "config", "user.email", "smoke@example.invalid"]);
  await writeFile(join(root, "sample.txt"), "sample\n");
  await command("git", ["-C", root, "add", "sample.txt"]);
  await command("git", ["-C", root, "commit", "-m", "Smoke fixture"]);
  sandbox = await createSandbox({ cwd: root, branch: "codex/model-smoke", sandbox: seatbelt() });
  if (providers.includes("codex")) {
    const setup = await sandbox.exec('umask 077; mkdir -p "$HOME/.codex"; cat > "$HOME/.codex/auth.json"', { stdin: await codexAuth() });
    if (setup.exitCode) throw new Error("Private Codex auth setup failed");
  }
  for (const provider of providers) {
    for (const role of ["implementation", "review"] as const) {
      const model = config.models[provider][role];
      const base = provider === "codex" ? codex(model, { captureSessions: false }) : claudeCode(model, {
        captureSessions: false, env: { CLAUDE_CODE_OAUTH_TOKEN: await claudeToken(), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
      });
      await quotas.run(provider, async (signal) => {
        const result = await sandbox!.run({ agent: privateHomeAgent(base, provider), maxIterations: 1, signal,
          name: `${provider}-${role}-smoke`,
          prompt: "This is a connection smoke test in a disposable repository. Do not use tools, edit files, or delegate. Reply with exactly READY and end your turn.",
          logging: { type: "file", path: join(root, ".sandcastle/logs", `${provider}-${role}.log`) },
        });
        if (!result.stdout.includes("READY")) throw new Error(`${model} did not return the expected smoke response`);
        console.log(`PASS: ${provider} ${role}, ${model}, subscription auth inside Seatbelt`);
      });
    }
  }
} finally {
  if (sandbox) await sandbox.close();
  await rm(root, { recursive: true, force: true });
}
