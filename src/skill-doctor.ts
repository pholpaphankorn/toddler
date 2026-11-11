import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { command } from "./process.ts";
import { bundledSkillsPath, indexSkills, skillName } from "./skills.ts";
import type { Role } from "./config.ts";

const manifestPath = fileURLToPath(new URL("../vendor/skills.json", import.meta.url));
type Check = [string, () => Promise<string>];

/** Static checks use the bundled files and the project tree committed at HEAD. */
export function skillDoctorChecks(project: string, sets: Record<Role, string[]>,
  root = bundledSkillsPath, manifest = manifestPath): Check[] {
  const index = () => {
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("skills: vendor/skills is missing; run scripts/vendor-skills.sh");
    return indexSkills(root);
  };
  return [
    ["skills index", async () => `${index().size} vendored skills`],
    ["skills manifest", async () => {
      const skills = index();
      const entries: Record<string, { skills: string[] }> = JSON.parse(readFileSync(manifest, "utf8"));
      const listed = new Set<string>();
      for (const [upstream, entry] of Object.entries(entries)) for (const name of entry.skills) {
        const path = join(root, upstream, name);
        listed.add(path);
        if (![...skills.values()].includes(path)) throw new Error(`skills: "${name}" is in vendor/skills.json but not vendored; run scripts/vendor-skills.sh`);
      }
      for (const [name, path] of skills) if (!listed.has(path)) {
        throw new Error(`skills: "${name}" is vendored but not in vendor/skills.json; run scripts/vendor-skills.sh`);
      }
      return "in sync";
    }],
    ["skills upstreams", async () => {
      index();
      const versions: string[] = [];
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = join(root, entry.name);
        for (const file of ["LICENSE", "UPSTREAM.json"]) {
          if (!existsSync(join(dir, file))) throw new Error(`skills: ${entry.name} is missing ${file}; run scripts/vendor-skills.sh`);
        }
        const info = JSON.parse(readFileSync(join(dir, "UPSTREAM.json"), "utf8"));
        if (typeof info.version !== "string" || typeof info.commit !== "string" || !info.version || !info.commit) throw new Error(`skills: ${entry.name}/UPSTREAM.json must contain version and commit`);
        versions.push(`${entry.name} ${info.version} (${info.commit.slice(0, 7)})`);
      }
      return versions.join(", ") || "none";
    }],
    ...Object.entries(sets).map(([role, names]): Check => [`skills ${role}`, async () => {
      const skills = index();
      for (const name of names) if (!skills.has(name)) throw new Error(`skills: "${name}" in ${role} set is not in vendor/skills`);
      return names.join(", ") || "(empty)";
    }]),
    ["skills project clashes", async () => {
      const output = await command("git", ["ls-tree", "-r", "--name-only", "-z", "HEAD", "--", ".claude/skills", ".agents/skills"], { cwd: project });
      const names = new Set(Object.values(sets).flat());
      const clashes: string[] = [];
      for (const path of output.split("\0")) {
        const match = /^\.(?:claude|agents)\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
        if (!match) continue;
        const content = await command("git", ["show", `HEAD:${path}`], { cwd: project });
        if (names.has(skillName(content, match[1]))) clashes.push(path);
      }
      return clashes.length ? `${clashes.join(", ")} (informational; bundled skills load by path)` : "none";
    }],
  ];
}
