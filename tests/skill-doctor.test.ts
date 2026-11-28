import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const vendor = fileURLToPath(new URL("../vendor", import.meta.url));
const root = join(vendor, "skills");

test("vendor/skills matches vendor/skills.json and each upstream has LICENSE and UPSTREAM.json", () => {
  const manifest: Record<string, { skills: string[] }> = JSON.parse(
    readFileSync(join(vendor, "skills.json"), "utf8"),
  );
  const dirs = (path: string) =>
    readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  const vendored = dirs(root).flatMap((upstream) =>
    dirs(join(root, upstream))
      .filter((skill) => existsSync(join(root, upstream, skill, "SKILL.md")))
      .map((skill) => `${upstream}/${skill}`),
  );
  const listed = Object.entries(manifest).flatMap(([upstream, { skills }]) =>
    skills.map((skill) => `${upstream}/${skill}`),
  );
  assert.deepEqual(
    vendored.sort(),
    listed.sort(),
    "vendor/skills and vendor/skills.json disagree; run scripts/vendor-skills.sh",
  );
  for (const upstream of dirs(root)) {
    assert.ok(
      existsSync(join(root, upstream, "LICENSE")),
      `${upstream} is missing LICENSE`,
    );
    assert.ok(
      existsSync(join(root, upstream, "UPSTREAM.json")),
      `${upstream} is missing UPSTREAM.json`,
    );
    const info = JSON.parse(
      readFileSync(join(root, upstream, "UPSTREAM.json"), "utf8"),
    );
    assert.ok(
      typeof info.version === "string" &&
        info.version &&
        typeof info.commit === "string" &&
        info.commit,
      `${upstream}/UPSTREAM.json must contain version and commit`,
    );
  }
});
