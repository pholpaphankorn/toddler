import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { indexSkills } from "./skills.ts";

export type Provider = "codex" | "claude";
export type Role = "implementation" | "review";
export const providers: Provider[] = ["codex", "claude"];

export const defaults = {
  remote: "origin",
  /** "github": labeled GitHub issues. "local": .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md files. */
  issues: "github" as "github" | "local",
  /** false: stop after review with the approved commit on a local branch; nothing is pushed. */
  openPr: true,
  issueLabel: "Sandcastle",
  parallelLabel: "parallel-safe",
  blockedLabels: ["blocked", "on-hold"],
  reservePercent: 5,
  pollIntervalMs: 15_000,
  quotaTimeoutMs: 12_000,
  maxReviewRounds: 3,
  models: {
    codex: { implementation: "gpt-6.1-terra", review: "gpt-6.1-sol" },
    claude: { implementation: "claude-sonnet-5-5", review: "claude-opus-5-5" },
  } as Record<Provider, Record<Role, string>>,
  skills: {
    implementation: ["tdd", "diagnosing-bugs", "codebase-design", "ponytail"],
    review: ["code-review", "ponytail-review", "codebase-design"],
  } as Record<Role, string[]>,
  codexLimitId: "codex",
};
export type Defaults = typeof defaults;
export interface Config extends Defaults {
  /** GitHub owner/name whose issues are worked. */
  repository: string;
  /** Shell command run inside the sandbox worktree; must exit 0 before a stage is accepted. Empty: no check. */
  verify: string;
}

/** Local issues kept on local branches: no GitHub repository or git remote is used. */
export function offline(config: Pick<Defaults, "issues" | "openPr">): boolean { return config.issues === "local" && !config.openPr; }

export function configPath(root: string): string { return join(root, ".sandcastle/config.json"); }

// Project settings in <root>/.sandcastle/config.json override the defaults above.
export function loadConfig(root: string): Config {
  const path = configPath(root);
  if (!existsSync(path)) throw new Error("No .sandcastle/config.json in this project; run toddler init");
  const project = JSON.parse(readFileSync(path, "utf8"));
  const config: Config = { ...defaults, ...project, models: { ...defaults.models, ...project.models }, skills: { ...defaults.skills, ...project.skills } };
  // Offline projects have no repository; the placeholder only keys .sandcastle/state.json.
  if (offline(config) && config.repository === undefined) config.repository = "local";
  else if (typeof config.repository !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(config.repository)) {
    throw new Error(`${path}: "repository" must be "owner/name" (optional only with "issues": "local" and "openPr": false)`);
  }
  config.verify ??= "";
  if (typeof config.verify !== "string") {
    throw new Error(`${path}: "verify" must be a shell command that checks the project (e.g. "npm test")`);
  }
  if (!["github", "local"].includes(config.issues)) throw new Error(`${path}: "issues" must be "github" or "local"`);
  if (typeof config.openPr !== "boolean") throw new Error(`${path}: "openPr" must be true or false`);
  const skills = indexSkills();
  for (const [role, names] of Object.entries(config.skills)) {
    if (!Array.isArray(names) || names.some(name => typeof name !== "string")) {
      throw new Error(`${path}: skills: ${role} set must be an array of names`);
    }
    for (const name of names) {
      if (!skills.has(name)) throw new Error(`skills: "${name}" in ${role} set is not in vendor/skills; add it to vendor/skills.json and re-run scripts/vendor-skills.sh`);
    }
  }
  return config;
}
