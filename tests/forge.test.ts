import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

test("none forge doctor reports auto-merge setting", async () => {
  const { NoneForge } = await import("../src/forge.ts");
  const forge = new NoneForge(".");
  for (const autoMerge of [false, true]) {
    const [name, check] = forge.doctorChecks({ ...config, autoMerge })[0];
    assert.equal(
      `OK ${name}: ${await check()}`,
      `OK Forge: none (nothing pushed; autoMerge ${autoMerge ? "on" : "off"})`,
    );
  }
});
import { join } from "node:path";
import { GitHubForge, FilesTracker, NoneForge } from "../src/forge.ts";
import { defaults, type Config } from "../src/config.ts";

const config = {
  ...defaults,
  repository: "owner/repo",
  issueLabel: "ready now",
  remote: "origin",
} as Config;

test("files tracker reads a spec and its issues", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracker-spec-"));
  try {
    const dir = join(root, ".sandcastle/specs/12-example");
    await mkdir(join(dir, "issues"), { recursive: true });
    await writeFile(join(dir, "spec.md"), "# Example spec\n\nDescription\n");
    await writeFile(
      join(dir, "issues/3-first.md"),
      "---\ntitle: First\nparent: 99\n---\nBody",
    );
    await writeFile(
      join(dir, "issues/4-second.md"),
      "---\nstatus: closed\n---\n",
    );
    assert.deepEqual(await new FilesTracker(root).spec(12), {
      id: 12,
      title: "Example spec",
      body: "# Example spec\n\nDescription\n",
      issues: [
        { number: 3, title: "First", state: "open" },
        { number: 4, title: "second", state: "closed" },
      ],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GitHub reads only direct sub-issues in one GraphQL call", async () => {
  const calls: string[][] = [];
  const tracker = new GitHubForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      return JSON.stringify({
        data: {
          repository: {
            issue: {
              number: 12,
              title: "Spec",
              body: "Text",
              subIssues: {
                nodes: [
                  {
                    number: 3,
                    title: "Child",
                    state: "OPEN",
                    subIssues: {
                      nodes: [{ number: 4, title: "Nested", state: "CLOSED" }],
                    },
                  },
                ],
              },
            },
          },
        },
      });
    },
  ).tracker;
  assert.deepEqual(await tracker.spec(12), {
    id: 12,
    title: "Spec",
    body: "Text",
    issues: [{ number: 3, title: "Child", state: "open" }],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "graphql");
});

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
});

test("GitHub uses an allowed merge method for noninteractive auto-merge and clean PRs", async () => {
  const calls: string[][] = [];
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (args[0] === "api")
        return JSON.stringify({
          allow_merge_commit: true,
          allow_squash_merge: true,
          allow_rebase_merge: false,
        });
      if (args[0] === "repo")
        return JSON.stringify({ viewerDefaultMergeMethod: "SQUASH" });
      if (!args.includes("--squash"))
        throw new Error("noninteractive gh requires a merge method");
      if (args.includes("--auto")) throw new Error("clean status");
      return "";
    },
  );
  await forge.enableAutoMerge("url");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    ["pr", "merge", "url", "--auto", "--squash"],
    ["pr", "merge", "url", "--squash"],
  ]);
});

test("GitHub forge merges immediately when auto-merge has no pending checks", async () => {
  const calls: string[][] = [];
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (args[0] === "api")
        return JSON.stringify({ allow_merge_commit: true });
      if (args[0] === "repo")
        return JSON.stringify({ viewerDefaultMergeMethod: "MERGE" });
      if (args.includes("--auto")) throw new Error("clean status");
      return "";
    },
  );
  await forge.enableAutoMerge("https://example.com/pr/1");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    ["pr", "merge", "https://example.com/pr/1", "--auto", "--merge"],
    ["pr", "merge", "https://example.com/pr/1", "--merge"],
  ]);
});

test("GitHub enables auto-merge and propagates refusals", async () => {
  const calls: string[][] = [];
  let refuse = false;
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (args[0] === "api")
        return JSON.stringify({ allow_merge_commit: true });
      if (args[0] === "repo")
        return JSON.stringify({ viewerDefaultMergeMethod: "MERGE" });
      if (refuse) throw new Error("auto-merge is not allowed");
      return "";
    },
  );
  await forge.enableAutoMerge("url");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    ["pr", "merge", "url", "--auto", "--merge"],
  ]);
  refuse = true;
  await assert.rejects(forge.enableAutoMerge("url"), /not allowed/);
  assert.equal(calls.length, 6);
});

test("doctor requires GitHub auto-merge only when configured", async () => {
  let allowed = false;
  const calls: string[][] = [];
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (args[0] === "api")
        return JSON.stringify({ allow_auto_merge: allowed });
      assert.deepEqual(args, [
        "repo",
        "view",
        "owner/repo",
        "--json",
        "nameWithOwner,viewerPermission,defaultBranchRef",
      ]);
      return JSON.stringify({
        nameWithOwner: "owner/repo",
        viewerPermission: "WRITE",
        defaultBranchRef: { name: "main" },
      });
    },
  );
  await forge.doctorChecks(config)[0][1]();
  assert.equal(calls.length, 1);
  await assert.rejects(
    forge.doctorChecks({ ...config, autoMerge: true })[0][1](),
    /does not allow auto-merge/,
  );
  assert.deepEqual(calls[2], ["api", "repos/owner/repo"]);
  allowed = true;
  await forge.doctorChecks({ ...config, autoMerge: true })[0][1]();
});

test("files tracker returns only open issues and resolves blocked_by against the open set", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracker-test-"));
  try {
    const dir = join(root, ".sandcastle/specs/1-test/issues");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1-closed.md"), "---\nstatus: closed\n---\n");
    await writeFile(join(dir, "2-open.md"), "---\nblocked_by: [1]\n---\nBody");
    await writeFile(join(dir, "3-blocked.md"), "---\nblocked_by: [2]\n---\n");
    const tracker = new FilesTracker(root);
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
    const tracker = new FilesTracker(root);
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

test("GitHub deliver pushes the exact SHA to an open request and poll reads only request state until #88", async () => {
  const calls: string[] = [];
  let states = [{ url: "open", state: "OPEN" }];
  const forge = new GitHubForge(
    "/repo",
    config,
    async (_, args = []) => {
      calls.push(["git", ...args].join(" "));
      return "";
    },
    async (_, args = []) => {
      calls.push(["gh", ...args].join(" "));
      return JSON.stringify(states);
    },
  );
  const job = { branch: "branch", sha: "abc", base: "main" };
  assert.deepEqual(await forge.deliver({ ...job, title: "t", body: "b" }), {
    state: "waiting",
    url: "open",
  });
  assert.ok(calls.includes("git push origin abc:refs/heads/branch"));
  assert.ok(!calls.some((call) => / pr (create|merge)/.test(call)));
  assert.deepEqual(await forge.poll(job), { state: "waiting" });
  states = [{ url: "merged", state: "MERGED" }];
  assert.deepEqual(await forge.poll(job), { state: "landed" });
  states = [];
  assert.deepEqual(await forge.poll(job), { state: "none" });
});
