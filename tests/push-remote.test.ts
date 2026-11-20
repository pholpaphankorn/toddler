import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validatePushRemote } from "../src/forge.ts";
import { command } from "../src/process.ts";

test("push validation checks every destination and the complete project path", async () => {
  const root = mkdtempSync(join(tmpdir(), "toddler-push-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    git("init", "-q");
    git(
      "remote",
      "add",
      "origin",
      "https://gitlab.example/group/sub/project.git",
    );
    const run = (file: string, args?: string[]) =>
      command(file, args, { cwd: root });
    await validatePushRemote(run, "origin", "group/sub/project", "gitlab");
    await assert.rejects(
      validatePushRemote(run, "origin", "sub/project", "gitlab"),
      /GitLab repository/,
    );
    git(
      "remote",
      "set-url",
      "--add",
      "--push",
      "origin",
      "git@gitlab.example:group/sub/project.git",
    );
    git(
      "remote",
      "set-url",
      "--add",
      "--push",
      "origin",
      "git@gitlab.example:other/project.git",
    );
    await assert.rejects(
      validatePushRemote(run, "origin", "group/sub/project", "gitlab"),
      /GitLab repository/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
