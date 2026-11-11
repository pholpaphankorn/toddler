import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillDoctorChecks } from "../src/skill-doctor.ts";

test("doctor reports skill failures and committed project clashes", async () => {
  const project = mkdtempSync(join(tmpdir(), "skill-doctor-"));
  try {
    const root = join(project, "vendor/skills"), upstream = join(root, "source"), manifest = join(project, "manifest.json");
    const sets = { implementation: ["tdd"], review: ["other"] };
    const checks = () => new Map(skillDoctorChecks(project, sets, root, manifest));
    const run = (name: string) => checks().get(name)!();
    await assert.rejects(run("skills index"), /vendor\/skills is missing/);
    mkdirSync(join(upstream, "tdd"), { recursive: true });
    writeFileSync(join(upstream, "tdd/SKILL.md"), "---\nname: tdd\n---\n");
    writeFileSync(manifest, JSON.stringify({ source: { skills: ["tdd", "missing"] } }));
    await assert.rejects(run("skills manifest"), /"missing" is in vendor\/skills.json but not vendored; run scripts\/vendor-skills.sh/);
    writeFileSync(manifest, JSON.stringify({ source: { skills: [] } }));
    await assert.rejects(run("skills manifest"), /"tdd" is vendored but not in vendor\/skills.json/);
    writeFileSync(manifest, JSON.stringify({ source: { skills: ["tdd"] } }));
    assert.equal(await run("skills manifest"), "in sync");
    await assert.rejects(run("skills upstreams"), /source is missing LICENSE/);
    writeFileSync(join(upstream, "LICENSE"), "license");
    await assert.rejects(run("skills upstreams"), /source is missing UPSTREAM.json/);
    writeFileSync(join(upstream, "UPSTREAM.json"), JSON.stringify({ version: "1.2.3", commit: "1234567890" }));
    assert.equal(await run("skills upstreams"), "source 1.2.3 (1234567)");
    assert.equal(await run("skills implementation"), "tdd");
    await assert.rejects(run("skills review"), /"other" in review set is not in vendor\/skills/);
    mkdirSync(join(root, "second/duplicate"), { recursive: true });
    writeFileSync(join(root, "second/duplicate/SKILL.md"), "---\nname: tdd\n---\n");
    await assert.rejects(run("skills index"), /Duplicate skill name "tdd"/);
    rmSync(join(root, "second"), { recursive: true });

    const git = (...args: string[]) => execFileSync("git", ["-C", project, ...args], { stdio: "ignore" });
    git("init");
    for (const path of [".claude/skills/tdd", ".agents/skills/other", ".agents/skills/unrelated"]) {
      mkdirSync(join(project, path), { recursive: true });
      writeFileSync(join(project, path, "SKILL.md"), "fixture");
    }
    git("add", ".claude", ".agents");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "fixture");
    rmSync(join(project, ".claude/skills/tdd"), { recursive: true });
    mkdirSync(join(project, ".claude/skills/other"), { recursive: true });
    writeFileSync(join(project, ".claude/skills/other/SKILL.md"), "uncommitted");
    assert.equal(await run("skills project clashes"), ".agents/skills/other/SKILL.md, .claude/skills/tdd/SKILL.md (informational; bundled skills load by path)");
  } finally { rmSync(project, { recursive: true, force: true }); }
});
