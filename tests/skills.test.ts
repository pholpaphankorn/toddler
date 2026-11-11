import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexSkills } from "../src/skills.ts";
import { defaults, loadConfig } from "../src/config.ts";

test("skill index uses frontmatter names, falls back to folder names, and rejects duplicates", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-index-"));
  try {
    const add = (upstream: string, folder: string, content: string) => {
      const dir = join(root, upstream, folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), content);
      return dir;
    };
    const named = add("one", "folder", '---\nname: "custom"\n---\nbody\n');
    const fallback = add("one", "fallback", "# No frontmatter\n");
    assert.equal(indexSkills(root).get("custom"), named);
    assert.equal(indexSkills(root).get("fallback"), fallback);
    add("two", "other", "---\nname: custom\n---\n");
    assert.throws(() => indexSkills(root), /Duplicate skill name "custom"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("skill overrides replace individual role defaults and reject unknown names", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-config-"));
  try {
    mkdirSync(join(root, ".sandcastle"));
    const write = (skills: object) => writeFileSync(join(root, ".sandcastle/config.json"), JSON.stringify({ repository: "owner/repo", skills }));
    write({ review: ["tdd"] });
    assert.deepEqual(loadConfig(root).skills, { implementation: defaults.skills.implementation, review: ["tdd"] });
    write({ implementation: [] });
    assert.deepEqual(loadConfig(root).skills, { implementation: [], review: defaults.skills.review });
    write({ review: ["missing"] });
    assert.throws(() => loadConfig(root), /skills: "missing" in review set is not in vendor\/skills; add it to vendor\/skills.json and re-run scripts\/vendor-skills.sh/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
