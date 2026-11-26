import { test } from "node:test";
import assert from "node:assert/strict";
import { FilesTracker, GitLabForge } from "../src/forge.ts";
import { defaults, type Config } from "../src/config.ts";
import { Runner, type Job } from "../src/runner.ts";
import type { Quotas } from "../src/quota.ts";

const config = {
  ...defaults,
  forge: "gitlab",
  repository: "group/sub/project",
  issueLabel: "workflow::ready",
  verify: "",
} as Config;

test("GitLab reads spec references and reports duplicate lines only when reading", async () => {
  let duplicate = false;
  const tracker = new GitLabForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      if (args[1].endsWith("/issues/12"))
        return JSON.stringify({ iid: 12, title: "Spec", description: "Text" });
      return JSON.stringify([
        {
          iid: 3,
          title: "Child",
          description: duplicate ? "Spec: #12\nSpec: #99" : "Spec: #12",
          state: "opened",
          labels: [config.issueLabel],
        },
        {
          iid: 4,
          title: "Closed",
          description: "Spec: #12",
          state: "closed",
          labels: [],
        },
        {
          iid: 5,
          title: "Other",
          description: "Spec: #99",
          state: "opened",
          labels: [],
        },
      ]);
    },
  ).tracker;
  assert.deepEqual(await tracker.spec(12), {
    id: 12,
    title: "Spec",
    body: "Text",
    issues: [
      { number: 3, title: "Child", state: "open" },
      { number: 4, title: "Closed", state: "closed" },
    ],
  });
  duplicate = true;
  assert.equal((await tracker.issues()).length, 1);
  await assert.rejects(tracker.spec(12), /#3.*[Dd]uplicate|[Dd]uplicate.*#3/);
});

test("GitLab doctor requires Developer access and checks the issue label", async () => {
  let project: any = {
    path_with_namespace: "group/sub/project",
    default_branch: "main",
    permissions: {
      project_access: { access_level: 20 },
      group_access: { access_level: 30 },
    },
  };
  const calls: string[] = [];
  const forge = new GitLabForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args[1]);
      if (args[1].includes("/labels/")) return "{}";
      if (!project) throw new Error("glab: access denied");
      return JSON.stringify(project);
    },
  );
  const checks = forge.doctorChecks({ ...config, autoMerge: true });
  assert.match(await checks[0][1](), /group\/sub\/project.*main/);
  assert.equal(await checks[1][1](), "workflow::ready");
  assert.deepEqual(calls, [
    "projects/group%2Fsub%2Fproject",
    "projects/group%2Fsub%2Fproject/labels/workflow%3A%3Aready",
  ]);
  assert.equal(forge.doctorChecks({ ...config, issues: "files" }).length, 1);
  project.permissions.group_access.access_level = 20;
  await assert.rejects(checks[0][1](), /Developer/);
  project = null;
  await assert.rejects(checks[0][1](), /glab: access denied/);
});

test("GitLab tracker lists iids and checks native and body blockers", async () => {
  const calls: string[] = [];
  const glab = async (_: string, args: string[] = []) => {
    const path = args.find((a) => a.startsWith("projects/"))!;
    calls.push(path);
    if (path.includes("/links"))
      return JSON.stringify([
        { link_type: "is_blocked_by", state: "closed" },
        { link_type: "relates_to", state: "opened" },
      ]);
    if (path.endsWith("/issues/12")) return JSON.stringify({ state: "closed" });
    if (path.endsWith("/issues/15")) return JSON.stringify({ state: "opened" });
    if (path.includes("/notes")) return JSON.stringify([{ body: "note" }]);
    return JSON.stringify([
      {
        iid: 2,
        title: "Two",
        description: "Blocked by: #12\nblocked BY: #15",
        labels: ["workflow::ready"],
      },
      {
        iid: 8,
        title: "Other",
        description: "",
        labels: ["workflow::ready-later"],
      },
    ]);
  };
  const tracker = new GitLabForge(".", config, async () => "", glab).tracker;
  const issues = await tracker.issues();
  assert.equal(issues.length, 1);
  const [issue] = issues;
  assert.equal(issue.number, 2);
  assert.deepEqual(issue.labels, ["workflow::ready"]);
  assert.equal(await tracker.blocked(issue), true);
  assert.equal(
    await tracker.blocked({ ...issue, body: "Blocked by: #12, #15" }),
    true,
  );
  assert.equal(
    await tracker.blocked({ ...issue, body: "Mention Blocked by: #15" }),
    false,
  );
  assert.deepEqual(await tracker.comments(issue), ["note"]);
  assert.ok(
    calls[0].includes(
      "projects/group%2Fsub%2Fproject/issues?state=opened&labels=workflow%3A%3Aready",
    ),
  );
});

test("publishing GitLab merge requests uses the tracker reference in the generated body", async () => {
  for (const issues of ["forge", "files"] as const) {
    let description = "";
    const git = async (_: string, args: string[] = []) =>
      args[0] === "rev-parse" ? "reviewed" : "";
    const forge = new GitLabForge(".", config, git, async (_, args = []) => {
      if (args.includes("POST")) {
        description = args
          .find((arg) => arg.startsWith("description="))!
          .slice("description=".length);
        return JSON.stringify({ web_url: "created" });
      }
      return "[]";
    });
    const job = {
      number: 3,
      branch: "feature",
      baseBranch: "main",
      reviewedSha: "reviewed",
      reviewer: "codex",
      report: { summary: "Done", validation: "Tests passed" },
      status: "approved",
    } as Job;
    const runner = new Runner({
      root: ".",
      config: { ...config, issues },
      quotas: {} as Quotas,
      state: { repository: config.repository, jobs: { 3: job } },
      save: () => {},
      git,
      forge,
      tracker: issues === "forge" ? forge.tracker : new FilesTracker("."),
    });
    assert.equal(
      await runner.landing.land({
        number: 3,
        title: "Example",
        labels: [],
        body: "",
      }),
      "approved",
    );
    assert.equal(job.pr, "created");
    assert.match(description, /review → merge request/);
    if (issues === "forge") assert.match(description, /Closes #3/);
    else assert.doesNotMatch(description, /Closes #\d+/);
  }
});

test("GitLab delivery enables auto-merge, lands once merged, and is refused when auto-merge is", async () => {
  for (const refused of [false, true]) {
    const calls: string[][] = [];
    const url = "https://gitlab.example/group/sub/project/-/merge_requests/42";
    const git = async (_: string, args: string[] = []) =>
      args[0] === "rev-parse" ? "reviewed" : "";
    let requests = "[]";
    const forge = new GitLabForge(
      ".",
      { ...config, autoMerge: true },
      git,
      async (_, args = []) => {
        calls.push(args);
        if (args.includes("POST")) return JSON.stringify({ web_url: url });
        if (args.includes("PUT")) {
          if (refused) throw new Error("merge refused");
          requests = JSON.stringify([{ state: "merged", web_url: url }]);
          return "{}";
        }
        return requests;
      },
    );
    const job = {
      number: 3,
      branch: "feature",
      baseBranch: "main",
      reviewedSha: "reviewed",
      reviewer: "codex",
      report: { summary: "Done", validation: "Tests passed" },
      status: "approved",
    } as Job;
    const runner = new Runner({
      root: ".",
      config: { ...config, autoMerge: true },
      quotas: {} as Quotas,
      state: { repository: config.repository, jobs: { 3: job } },
      save: () => {},
      git,
      forge,
      tracker: forge.tracker,
      wait: async () => {},
    });
    const original = console.error;
    console.error = () => {};
    try {
      assert.equal(
        await runner.landing.land({
          number: 3,
          title: "Example",
          labels: [],
          body: "",
        }),
        refused ? "attention" : "landed",
      );
    } finally {
      console.error = original;
    }
    if (refused) {
      assert.equal(job.attention?.reason, "refused");
      assert.match(
        job.attention!.detail,
        /Could not enable auto-merge on .*merge_requests\/42: merge refused/,
      );
    } else assert.equal(job.status, "landed");
    assert.ok(
      calls.some(
        (args) =>
          args.join(" ") ===
          "api projects/group%2Fsub%2Fproject/merge_requests/42/merge --method PUT --field auto_merge=true",
      ),
    );
  }
});

test("GitLab blockers fail closed and log unresolvable lines", async () => {
  let native = false;
  const tracker = new GitLabForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      if (args[1].includes("/links"))
        return JSON.stringify(
          native ? [{ link_type: "is_blocked_by", state: "opened" }] : [],
        );
      throw new Error("not found");
    },
  ).tracker;
  const issue = { number: 3, title: "", labels: [], body: "" };
  native = true;
  assert.equal(await tracker.blocked(issue), true);
  native = false;
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args) => messages.push(args.join(" "));
  try {
    assert.equal(
      await tracker.blocked({ ...issue, body: "Blocked by: #99" }),
      true,
    );
    assert.equal(
      await tracker.blocked({ ...issue, body: "Blocked by: group/other#4" }),
      true,
    );
    assert.equal(messages.length, 2);
    assert.match(messages.join("\n"), /#99.*group\/other#4/s);
  } finally {
    console.error = original;
  }
});

test("GitLab fetches, finds and opens merge requests", async () => {
  let requests = [
    { state: "closed", web_url: "closed" },
    { state: "merged", web_url: "merged" },
  ];
  const calls: string[][] = [];
  const forge = new GitLabForge(
    ".",
    config,
    async (_, args = []) => {
      calls.push(["git", ...args]);
      return "";
    },
    async (_, args = []) => {
      calls.push(["glab", ...args]);
      if (args.includes("POST")) return JSON.stringify({ web_url: "created" });
      if (args[1].includes("merge_requests?")) return JSON.stringify(requests);
      return JSON.stringify({ default_branch: "main" });
    },
  );
  assert.deepEqual(await forge.base(), { branch: "main", ref: "origin/main" });
  assert.deepEqual(await forge.findRequest("feature/a"), {
    url: "merged",
    open: false,
  });
  requests = [{ state: "opened", web_url: "opened" }];
  assert.deepEqual(await forge.findRequest("feature/a"), {
    url: "opened",
    open: true,
  });
  requests = [{ state: "closed", web_url: "closed" }];
  assert.equal(await forge.findRequest("feature/a"), undefined);
  assert.equal(
    await forge.openRequest({
      branch: "feature/a",
      sha: "abc",
      base: "main",
      title: "Title",
      body: "Closes #3",
    }),
    "created",
  );
  assert.ok(calls.some((call) => call.includes("description=Closes #3")));
  assert.ok(
    calls.some(
      (call) =>
        call.includes("source_branch=feature%2Fa&per_page=100") ||
        call.some((arg) => arg.includes("source_branch=feature%2Fa")),
    ),
  );
  // deliver pushes first; opening a request never pushes.
  assert.ok(!calls.some((call) => call.includes("push")));
});
