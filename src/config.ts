import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { indexSkills } from "./skills.ts";

export type Provider = "codex" | "claude";
export type Role = "implementation" | "review";
export const providers: Provider[] = ["codex", "claude"];

export const defaults = {
  providers: [...providers],
  ranking: "quota" as string,
  stopConditions: [] as string[],
  remote: "origin",
  /** "github": labeled GitHub issues. "local": .sandcastle/specs/<spec-number>-<slug>/issues/<number>-<slug>.md files. */
  issues: "github" as "github" | "local",
  /** false: stop after review with the approved commit on a local branch; nothing is pushed. */
  openPr: true,
  issueLabel: "Sandcastle",
  parallelLabel: "parallel-safe",
  blockedLabels: ["blocked", "on-hold"],
  stopAt: {
    codex: { fiveHour: 5, weekly: 10 },
    claude: { fiveHour: 5, weekly: 10 },
  } as Record<Provider, { fiveHour: number; weekly: number }>,
  pollIntervalMs: 15_000,
  quotaTimeoutMs: 12_000,
  maxReviewRounds: 10,
  roles: {
    implementation: {
      skills: ["tdd", "diagnosing-bugs", "codebase-design", "ponytail"],
      models: { codex: "gpt-6.1-terra", claude: "claude-sonnet-5-5" },
    },
    review: {
      skills: ["code-review", "ponytail-review", "codebase-design"],
      models: { codex: "gpt-6.1-sol", claude: "claude-opus-5-5" },
    },
  } satisfies Record<
    Role,
    { skills: string[]; models: Record<Provider, string> }
  >,
};
export type Defaults = typeof defaults;
export interface Config extends Defaults {
  /** GitHub owner/name whose issues are worked. */
  repository: string;
  /** Shell command run inside the sandbox worktree; must exit 0 before a stage is accepted. Empty: no check. */
  verify: string;
  /** Shell command run in each new sandbox before the agent starts (e.g. "npm ci"); must exit 0. Empty: nothing installed. */
  install: string;
  /** Shell command run in the sandbox after each implementation stage (e.g. "npm run format"); any changes it makes are committed before verify and review. Empty: not run. */
  format: string;
}

/** Local issues kept on local branches: no GitHub repository or git remote is used. */
export function offline(config: Pick<Defaults, "issues" | "openPr">): boolean {
  return config.issues === "local" && !config.openPr;
}

export function configPath(root: string): string {
  return join(root, ".sandcastle/config.json");
}

// Project settings in <root>/.sandcastle/config.json override the defaults above.
export function loadConfig(
  root: string,
  options: { checkSkillNames?: boolean } = {},
): Config {
  const path = configPath(root);
  if (!existsSync(path))
    throw new Error(
      "No .sandcastle/config.json in this project; run toddler init",
    );
  const project = JSON.parse(readFileSync(path, "utf8"));
  if ("models" in project || "skills" in project)
    throw new Error(
      `${path}: obsolete setting; use roles.<role>.models and roles.<role>.skills; see README`,
    );
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (project.roles !== undefined) {
    if (!isObject(project.roles)) throw new Error(`${path}: invalid roles`);
    for (const [role, settings] of Object.entries(project.roles)) {
      const rolePath = `roles.${role}`;
      if (!Object.hasOwn(defaults.roles, role) || !isObject(settings))
        throw new Error(`${path}: invalid ${rolePath}`);
      for (const [field, value] of Object.entries(settings)) {
        const fieldPath = `${rolePath}.${field}`;
        if (field !== "skills" && field !== "models")
          throw new Error(`${path}: invalid ${fieldPath}`);
        if (field === "models") {
          if (!isObject(value))
            throw new Error(`${path}: invalid ${fieldPath}`);
          for (const [provider, model] of Object.entries(value)) {
            if (
              !providers.includes(provider as Provider) ||
              typeof model !== "string" ||
              !model.trim()
            )
              throw new Error(`${path}: invalid ${fieldPath}.${provider}`);
          }
        }
      }
    }
  }
  const config: Config = {
    ...defaults,
    ...project,
    roles: Object.fromEntries(
      Object.entries(defaults.roles).map(([role, settings]) => [
        role,
        {
          ...settings,
          ...project.roles?.[role],
          models: { ...settings.models, ...project.roles?.[role]?.models },
        },
      ]),
    ) as Defaults["roles"],
    stopAt: Object.fromEntries(
      providers.map((provider) => [
        provider,
        { ...defaults.stopAt[provider], ...project.stopAt?.[provider] },
      ]),
    ) as Defaults["stopAt"],
  };
  if (
    !Array.isArray(config.providers) ||
    !config.providers.length ||
    config.providers.some((name) => !providers.includes(name)) ||
    new Set(config.providers).size !== config.providers.length
  )
    throw new Error(`${path}: invalid providers`);
  if (
    typeof config.ranking !== "string" ||
    !config.ranking.trim() ||
    isAbsolute(config.ranking)
  )
    throw new Error(`${path}: invalid ranking`);
  if (
    !Array.isArray(config.stopConditions) ||
    config.stopConditions.some(
      (name) => typeof name !== "string" || !name.trim() || isAbsolute(name),
    )
  )
    throw new Error(`${path}: invalid stopConditions`);
  if (project.stopAt !== undefined) {
    if (
      !project.stopAt ||
      typeof project.stopAt !== "object" ||
      Array.isArray(project.stopAt)
    )
      throw new Error(`${path}: invalid stopAt`);
    for (const [provider, thresholds] of Object.entries(project.stopAt)) {
      if (
        !providers.includes(provider as Provider) ||
        !thresholds ||
        typeof thresholds !== "object" ||
        Array.isArray(thresholds)
      )
        throw new Error(`${path}: invalid stopAt provider ${provider}`);
      for (const [name, value] of Object.entries(thresholds)) {
        if (
          !["fiveHour", "weekly"].includes(name) ||
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 100
        )
          throw new Error(
            `${path}: invalid stopAt threshold ${provider}.${name}`,
          );
      }
    }
  }
  if ("reservePercent" in project || "codexLimitId" in project)
    throw new Error(`${path}: obsolete quota setting; see README`);
  // Offline projects have no repository; the placeholder only keys .sandcastle/state.json.
  if (offline(config) && config.repository === undefined)
    config.repository = "local";
  else if (
    typeof config.repository !== "string" ||
    !/^[\w.-]+\/[\w.-]+$/.test(config.repository)
  ) {
    throw new Error(
      `${path}: "repository" must be "owner/name" (optional only with "issues": "local" and "openPr": false)`,
    );
  }
  config.verify ??= "";
  if (typeof config.verify !== "string") {
    throw new Error(
      `${path}: "verify" must be a shell command that checks the project (e.g. "npm test")`,
    );
  }
  config.format ??= "";
  if (typeof config.format !== "string") {
    throw new Error(
      `${path}: "format" must be a shell command that formats the project (e.g. "npm run format")`,
    );
  }
  config.install ??= "";
  if (typeof config.install !== "string") {
    throw new Error(
      `${path}: "install" must be a shell command that installs dependencies (e.g. "npm ci")`,
    );
  }
  if (!["github", "local"].includes(config.issues))
    throw new Error(`${path}: "issues" must be "github" or "local"`);
  if (typeof config.openPr !== "boolean")
    throw new Error(`${path}: "openPr" must be true or false`);
  const skills = options.checkSkillNames === false ? undefined : indexSkills();
  for (const [role, { skills: names }] of Object.entries(config.roles)) {
    if (
      !Array.isArray(names) ||
      names.some((name) => typeof name !== "string")
    ) {
      throw new Error(
        `${path}: roles.${role}.skills must be an array of names`,
      );
    }
    for (const name of names) {
      if (skills && !skills.has(name))
        throw new Error(
          `${path}: roles.${role}.skills: "${name}" is not in vendor/skills; add it to vendor/skills.json and re-run scripts/vendor-skills.sh`,
        );
    }
  }
  return config;
}

export function modelsForProvider(
  config: Pick<Config, "roles">,
  provider: Provider,
): string[] {
  return [
    ...new Set(
      Object.values(config.roles).map((role) => role.models[provider]),
    ),
  ];
}
