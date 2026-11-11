import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const bundledSkillsPath = fileURLToPath(new URL("../vendor/skills", import.meta.url));

/** Shell commands to expose only the selected bundled skills in the private home. */
export function skillLinks(names: string[], index = indexSkills()): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const commands = ['mkdir -p "$HOME/.claude/skills" "$HOME/.agents/skills"'];
  for (const name of names) {
    const folder = index.get(name);
    if (!folder || name === "." || name === ".." || name.includes("/")) throw new Error(`Invalid skill name: ${name}`);
    for (const provider of [".claude", ".agents"]) {
      commands.push(`ln -s ${quote(folder)} "$HOME/${provider}/skills/"${quote(name)}`);
    }
  }
  return commands.join(" && ");
}

/** Index skill names by their vendored folder. */
export function indexSkills(root: string = bundledSkillsPath): Map<string, string> {
  const index = new Map<string, string>();
  if (!existsSync(root)) return index;
  for (const upstream of readdirSync(root, { withFileTypes: true })) {
    if (!upstream.isDirectory()) continue;
    for (const skill of readdirSync(join(root, upstream.name), { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const folder = join(root, upstream.name, skill.name);
      const path = join(folder, "SKILL.md");
      if (!existsSync(path)) continue;
      const content = readFileSync(path, "utf8");
      const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|\s*$)/)?.[1];
      // Only `name` is read; a full YAML parser would throw on common unquoted colons in other fields.
      const raw = /^name:[ \t]*(.*)$/m.exec(frontmatter ?? "")?.[1].trim() ?? "";
      const name = (/^(["'])(.*)\1/.exec(raw)?.[2] ?? raw.replace(/\s+#.*$/, "")).trim() || skill.name;
      if (index.has(name)) throw new Error(`Duplicate skill name "${name}" in ${index.get(name)} and ${folder}`);
      index.set(name, folder);
    }
  }
  return index;
}
