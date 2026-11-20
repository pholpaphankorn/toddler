import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubForge, FilesTracker, NoneForge } from "../src/forge.ts";
import { defaults, type Config } from "../src/config.ts";

const config = {
  ...defaults,
  repository: "owner/repo",
  issueLabel: "ready now",
  remote: "origin",
} as Config;

test("doctor checks the configured issue label only for forge issues", async () => {
  const gh = async (_: string, args: string[] = []) => {
    if (args[0] === "api") throw new Error("label not found");
    return "";
  };
  const forge = new GitHubForge("/repo", config, async () => "", gh);
  const checks = forge.doctorChecks(config);
  assert.equal(checks[1][0], "Issue label");
  await assert.rejects(checks[1][1](), /label not found/);
  assert.equal(forge.doctorChecks({ ...config, issues: "files" }).length, 1);
  const present = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async () => "{}",
  );
  assert.equal(await present.doctorChecks(config)[1][1](), "ready now");
});

test("GitHub tracker normalizes issues and checks all native blockers and comments", async () => {
  const calls: string[][] = [];
  const gh = async (_: string, args: string[] = []) => {
    calls.push(args);
    if (args[3]?.includes("dependencies"))
      return JSON.stringify([[{ state: "closed" }, { state: "open" }]]);
    if (args[3]?.includes("comments"))
      return JSON.stringify([[{ body: "first" }], [{ body: "second" }]]);
    return JSON.stringify([
      [
        {
          number: 9,
          title: "Nine",
          body: null,
          labels: [{ name: "parallel-safe" }],
        },
        { number: 1, pull_request: {} },
      ],
      [{ number: 2, title: "Two", body: "body", labels: [] }],
    ]);
  };
  const tracker = new GitHubForge("/repo", config, async () => "", gh).tracker;
  const issues = await tracker.issues();
  assert.deepEqual(issues, [
    { number: 2, title: "Two", body: "body", labels: [] },
    { number: 9, title: "Nine", body: null, labels: ["parallel-safe"] },
  ]);
  assert.equal(await tracker.blocked(issues[0]), true);
  assert.deepEqual(await tracker.comments(issues[0]), ["first", "second"]);
  assert.ok(calls[0][3].includes("labels=ready%20now"));
  assert.ok(calls[1][3].includes("issues/2/dependencies/blocked_by"));
});

test("GitHub forge fetches the base, finds open or merged requests, pushes and creates a request", async () => {
  const calls: string[][] = [];
  let states = [
    { url: "closed", state: "CLOSED" },
    { url: "merged", state: "MERGED" },
  ];
  const git = async (_: string, args: string[] = []) => {
    calls.push(["git", ...args]);
    return "";
  };
  const gh = async (_: string, args: string[] = []) => {
    calls.push(["gh", ...args]);
    if (args[0] === "repo")
      return JSON.stringify({
        defaultBranchRef: { name: "main" },
        nameWithOwner: "owner/repo",
        viewerPermission: "WRITE",
      });
    if (args[1] === "list") return JSON.stringify(states);
    if (args[1] === "create") {
      assert.equal(
        await readFile(args[args.indexOf("--body-file") + 1], "utf8"),
        "body",
      );
      return "url";
    }
    return "";
  };
  const forge = new GitHubForge("/repo", config, git, gh);
  assert.deepEqual(await forge.base(), { branch: "main", ref: "origin/main" });
  assert.deepEqual(await forge.findRequest("branch"), {
    url: "merged",
    open: false,
  });
  states = [{ url: "open", state: "OPEN" }];
  assert.deepEqual(await forge.findRequest("branch"), {
    url: "open",
    open: true,
  });
  assert.equal(
    await forge.openRequest({
      branch: "branch",
      sha: "abc",
      base: "main",
      title: "title",
      body: "body",
    }),
    "url",
  );
  assert.ok(
    calls.some(
      (call) => call.join(" ") === "git push origin abc:refs/heads/branch",
    ),
  );
  assert.ok(calls.some((call) => call.join(" ") === "git fetch origin main"));
  assert.match(
    await forge.doctorChecks(config)[0][1](),
    /owner\/repo, base main, WRITE/,
  );
  assert.equal(await new NoneForge("/repo").findRequest("branch"), undefined);
});

test("GitHub forge merges immediately when auto-merge has no pending checks", async () => {
  const calls: string[][] = [];
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (args.includes("--auto")) throw new Error("clean status");
      return "";
    },
  );
  await forge.merge("https://example.com/pr/1");
  assert.deepEqual(calls, [
    ["pr", "merge", "https://example.com/pr/1", "--auto", "--merge"],
    ["pr", "merge", "https://example.com/pr/1", "--merge"],
  ]);
});

test("files tracker returns only open issues and resolves blocked_by against the open set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracker-test-"));
  try {
    const dir = join(root, ".sandcastle/specs/1-test/issues");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1-closed.md"), "---\nstatus: closed\n---\n");
    await writeFile(join(dir, "2-open.md"), "---\nblocked_by: [1]\n---\nBody");
    await writeFile(join(dir, "3-blocked.md"), "---\nblocked_by: [2]\n---\n");
    const tracker = new FilesTracker(root, async () => "");
    const issues = await tracker.issues();
    assert.deepEqual(
      issues.map((issue) => issue.number),
      [2, 3],
    );
    assert.deepEqual(Object.keys(issues[0]).sort(), [
      "body",
      "labels",
      "number",
      "title",
    ]);
    assert.equal(await tracker.blocked(issues[0]), false);
    assert.equal(await tracker.blocked(issues[1]), true);
    assert.deepEqual(await tracker.comments(issues[0]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("files tracker parses issue frontmatter and validates issue files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracker-parse-"));
  const specs = join(root, ".sandcastle/specs");
  try {
    const dir = join(specs, "1-auth/issues");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "3-fix-login.md"),
      "---\ntitle: Fix login\nlabels: [parallel-safe, blocked]\nblocked_by: [1, 2]\n---\nSteps here\n",
    );
    await writeFile(join(dir, "4-add-logout.md"), "Body only");
    await writeFile(join(specs, "1-auth/7-not-an-issue.md"), "ignored");
    const tracker = new FilesTracker(root, async () => "");
    assert.deepEqual(await tracker.issues(), [
      {
        number: 3,
        title: "Fix login",
        body: "Steps here\n",
        labels: ["parallel-safe", "blocked"],
      },
      { number: 4, title: "add logout", body: "Body only", labels: [] },
    ]);
    const invalid = join(dir, "notes.md");
    await writeFile(invalid, "");
    await assert.rejects(tracker.issues(), /issue-number/);
    await rm(invalid);
    await writeFile(join(dir, "5.md"), "---\nblocked_by: [x]\n---\n");
    await assert.rejects(
      tracker.issues(),
      /blocked_by must list issue numbers/,
    );
    await rm(join(dir, "5.md"));
    await mkdir(join(specs, "auth/issues"), { recursive: true });
    await writeFile(join(specs, "auth/issues/6-fix.md"), "");
    await assert.rejects(tracker.issues(), /spec-number/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("files tracker reads the freshly fetched base across rounds", async () => {
  const { connect } = await import("../src/forge.ts");
  let round = 0;
  const calls: string[][] = [];
  const git = async (_: string, args: string[] = []) => {
    calls.push(args);
    if (args[0] === "fetch") {
      round++;
      return "";
    }
    if (args[0] === "ls-tree")
      return ".sandcastle/specs/1-a/issues/1-first.md\n.sandcastle/specs/1-a/issues/2-next.md";
    if (args[0] === "show")
      return args[1].includes("1-first")
        ? `---\nstatus: ${round === 1 ? "open" : "closed"}\n---\n`
        : "---\nblocked_by: [1]\n---\n";
    return "";
  };
  const { forge, tracker } = connect(
    "/repo",
    { ...config, issues: "files" },
    git,
    async () => "",
  );
  await forge.base("main");
  let issues = await tracker.issues();
  assert.equal(await tracker.blocked(issues[1]), true);
  await forge.base("main");
  issues = await tracker.issues();
  assert.deepEqual(
    issues.map((item) => item.number),
    [2],
  );
  assert.equal(await tracker.blocked(issues[0]), false);
  assert.ok(
    calls.some(
      (args) => args[0] === "show" && args[1].startsWith("origin/main:"),
    ),
  );
});
