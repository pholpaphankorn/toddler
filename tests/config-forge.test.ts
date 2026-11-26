import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, chmodSync } from "node:fs";
import { connect, GitLabForge } from "../src/forge.ts";

test("one-host configuration defaults and rejects incompatible settings", () => {
  const root = mkdtempSync(join(tmpdir(), "config-forge-"));
  mkdirSync(join(root, ".sandcastle"));
  const load = (value: object) => {
    writeFileSync(join(root, ".sandcastle/config.json"), JSON.stringify(value));
    return loadConfig(root, { checkSkillNames: false });
  };
  try {
    assert.equal(load({ repository: "owner/name" }).forge, "github");
    assert.equal(load({ repository: "owner/name" }).issues, "forge");
    assert.equal(load({ forge: "none" }).issues, "files");
    assert.equal(load({ repository: "owner/name" }).autoMerge, false);
    assert.equal(load({ forge: "none", autoMerge: true }).autoMerge, true);
    assert.ok(
      connect(
        root,
        load({ forge: "gitlab", repository: "group/subgroup/project" }),
      ).forge instanceof GitLabForge,
    );
    for (const [value, pattern] of [
      [{ forge: "none", issues: "forge" }, /issues.*forge.*none/],
      [{}, /repository.*owner\/name/],
      [{ repository: "bad" }, /repository.*owner\/name/],
      [{ forge: "other", repository: "a/b" }, /forge/],
      [{ issues: "other", repository: "a/b" }, /issues/],
      [{ autoMerge: "true", repository: "a/b" }, /autoMerge/],
      [
        { forge: "none", repository: "a/b" },
        /repository.*only used with a forge/,
      ],
      [{ repository: "a/b", openPr: true }, /openPr.*obsolete setting/],
      [
        { repository: "a/b", issues: "github" },
        /issues.*obsolete setting.*forge/,
      ],
      [
        { repository: "a/b", issues: "local" },
        /issues.*obsolete setting.*files/,
      ],
    ] as const)
      assert.throws(
        () => load(value),
        (error: Error) => {
          assert.match(error.message, pattern);
          assert.ok(
            error.message.includes(join(root, ".sandcastle/config.json")),
          );
          return true;
        },
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("this project's configuration loads", () => {
  const config = loadConfig(fileURLToPath(new URL("..", import.meta.url)));
  assert.equal(config.forge, "github");
  assert.equal(config.issues, "files");
});

test("init detects GitHub, GitLab, or no forge", () => {
  for (const scenario of ["github", "gitlab", "neither", "remote"] as const) {
    const github = scenario === "github";
    const root = mkdtempSync(join(tmpdir(), "init-forge-"));
    try {
      assert.equal(spawnSync("git", ["init", "-q"], { cwd: root }).status, 0);
      const bin = join(root, "bin");
      mkdirSync(bin);
      const gh = join(bin, "gh");
      writeFileSync(
        gh,
        github ? "#!/bin/sh\necho owner/name\n" : "#!/bin/sh\nexit 1\n",
      );
      chmodSync(gh, 0o755);
      const glab = join(bin, "glab");
      writeFileSync(
        glab,
        scenario === "gitlab"
          ? "#!/bin/sh\necho group/sub/project\n"
          : "#!/bin/sh\nexit 1\n",
      );
      chmodSync(glab, 0o755);
      if (scenario === "remote")
        assert.equal(
          spawnSync(
            "git",
            ["remote", "add", "upstream", "https://example.com/repo.git"],
            { cwd: root },
          ).status,
          0,
        );
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../src/main.ts", import.meta.url)), "init"],
        {
          cwd: root,
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        JSON.parse(readFileSync(join(root, ".sandcastle/config.json"), "utf8")),
        github
          ? {
              forge: "github",
              repository: "owner/name",
              install: "",
              verify: "",
            }
          : scenario === "gitlab"
            ? {
                forge: "gitlab",
                repository: "group/sub/project",
                install: "",
                verify: "",
              }
            : { forge: "none", install: "", verify: "" },
      );
      assert.match(
        result.stdout,
        github || scenario === "gitlab"
          ? /Sandcastle.*issues.*files/
          : /Write issues.*Nothing is pushed/,
      );
      if (scenario === "remote")
        assert.match(result.stdout, /upstream.*(?:gh|glab).*rerun/is);
      if (!github && scenario !== "gitlab")
        assert.match(
          result.stdout,
          /"autoMerge": true.*fast-forward approved work/,
        );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
