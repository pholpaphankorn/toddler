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
    assert.equal(load({ repository: "a/b" }).landingPollSeconds, 60);
    assert.equal(
      load({ repository: "a/b", landingPollSeconds: 10 }).landingPollSeconds,
      10,
    );
    assert.equal(load({ repository: "a/b" }).maxParallelIssues, 2);
    assert.equal(
      load({ repository: "a/b", maxParallelIssues: 3 }).maxParallelIssues,
      3,
    );
    // Ignored without a forge.
    assert.equal(load({ forge: "none", landingPollSeconds: 1 }).forge, "none");
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
      [{ maxParallelIssues: 0, repository: "a/b" }, /maxParallelIssues/],
      [{ maxParallelIssues: 1.5, repository: "a/b" }, /maxParallelIssues/],
      [{ landingPollSeconds: 9, repository: "a/b" }, /landingPollSeconds/],
      [{ landingPollSeconds: "60", repository: "a/b" }, /landingPollSeconds/],
      [
        { forge: "none", repository: "a/b" },
        /repository.*only used with a forge/,
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
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@example.com",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@example.com",
          },
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

test("init commits only the files it created, once", () => {
  const root = mkdtempSync(join(tmpdir(), "init-commit-"));
  const bin = join(root, ".bin");
  mkdirSync(bin);
  for (const name of ["gh", "glab"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, name), 0o755);
  }
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
  };
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const init = () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../src/main.ts", import.meta.url)), "init"],
      { cwd: root, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(join(root, ".gitignore"), ".bin/\n");
    writeFileSync(join(root, "other.txt"), "staged\n");
    git("add", "other.txt");
    const first = init();
    assert.match(first, /config: committed \w+ \(toddler: add config\)/);
    assert.match(first, /run: toddler setup\n$/);
    assert.doesNotMatch(first, /Commit \.sandcastle/);
    assert.equal(git("log", "--format=%s"), "toddler: add config");
    assert.equal(
      git("show", "--name-only", "--format=", "HEAD"),
      ".sandcastle/.gitignore\n.sandcastle/config.json",
    );
    const status = git("status", "--porcelain", "--untracked-files=all");
    assert.equal(status, "A  other.txt\n?? .gitignore");
    assert.match(init(), /already exists/);
    assert.equal(git("rev-list", "--count", "HEAD"), "1");
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), status);

    rmSync(join(root, ".sandcastle"), { recursive: true });
    git("checkout", "-q", "--detach");
    git("rm", "-q", "--cached", "-r", ".sandcastle");
    const detached = init();
    assert.match(detached, /detached HEAD: config written, not committed/);
    assert.equal(git("rev-list", "--count", "HEAD"), "1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
