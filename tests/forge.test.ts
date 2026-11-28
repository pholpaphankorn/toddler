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
import {
  GitHubForge,
  GitLabForge,
  FilesTracker,
  NoneForge,
} from "../src/forge.ts";
import { ready } from "../src/policy.ts";
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

test("GitHub doctor fails on open spec children missing the issue label", async () => {
  const node = (number: number, labels: string[], parent?: string) => ({
    number,
    labels: { nodes: labels.map((name) => ({ name })) },
    parent: parent ? { number: 1, state: parent } : null,
  });
  const page = (nodes: unknown[]) => ({
    data: { repository: { issues: { nodes } } },
  });
  let pages: unknown = [];
  const calls: string[][] = [];
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      calls.push(args);
      if (pages instanceof Error) throw pages;
      return JSON.stringify(pages);
    },
  );
  const [name, check] = forge.doctorChecks(config)[2];
  assert.equal(name, "Spec children");
  pages = [
    page([
      node(1, [], "OPEN"), // nested: the spec is itself a child
      node(2, ["ready now"], "OPEN"),
      node(3, [], "CLOSED"), // closed spec
      node(4, []), // no spec
      node(5, ["adult"], "OPEN"),
      node(6, ["Blocked"], "OPEN"),
    ]),
    page([node(7, [], "OPEN")]),
  ];
  await assert.rejects(check(), {
    message: "2 missing ready now: #1, #7",
  });
  assert.deepEqual(calls[0].slice(0, 4), [
    "api",
    "graphql",
    "--paginate",
    "--slurp",
  ]);
  pages = [
    page(
      Array.from({ length: 13 }, (_, index) => node(20 + index, [], "OPEN")),
    ),
  ];
  await assert.rejects(check(), {
    message:
      "13 missing ready now: #20, #21, #22, #23, #24, #25, #26, #27, #28, #29 (+3 more)",
  });
  pages = [page([node(2, ["ready now"], "OPEN"), node(5, ["adult"], "OPEN")])];
  assert.equal(await check(), "1 open, all labelled ready now");
  pages = new Error("gh: rate limit exceeded");
  await assert.rejects(check(), /rate limit exceeded/);
  pages = [{ errors: [{ message: "Field 'parent' doesn't exist" }] }];
  await assert.rejects(check(), /Field 'parent' doesn't exist/);
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

test("GitHub forge fetches the base, finds open or merged requests and creates a request", async () => {
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
  // deliver pushes first; opening a request never pushes.
  assert.ok(!calls.some((call) => call.includes("push")));
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
  await forge.enableAutoMerge("url", "abc");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    ["pr", "merge", "url", "--auto", "--squash", "--match-head-commit", "abc"],
    ["pr", "merge", "url", "--squash", "--match-head-commit", "abc"],
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
  await forge.enableAutoMerge("https://example.com/pr/1", "abc");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    [
      "pr",
      "merge",
      "https://example.com/pr/1",
      "--auto",
      "--merge",
      "--match-head-commit",
      "abc",
    ],
    [
      "pr",
      "merge",
      "https://example.com/pr/1",
      "--merge",
      "--match-head-commit",
      "abc",
    ],
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
  await forge.enableAutoMerge("url", "abc");
  assert.deepEqual(calls, [
    ["api", "repos/owner/repo"],
    ["repo", "view", "owner/repo", "--json", "viewerDefaultMergeMethod"],
    ["pr", "merge", "url", "--auto", "--merge", "--match-head-commit", "abc"],
  ]);
  refuse = true;
  await assert.rejects(forge.enableAutoMerge("url", "abc"), /not allowed/);
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

// One raw `gh pr list --json` row per poll state, plus the precedence overlaps.
const open = {
  url: "pr",
  state: "OPEN",
  headRefOid: "abc",
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
  reviewDecision: "APPROVED",
  autoMergeRequest: { mergeMethod: "MERGE" },
  statusCheckRollup: [],
};
const actionsFailed = {
  __typename: "CheckRun",
  name: "test",
  status: "COMPLETED",
  conclusion: "FAILURE",
  detailsUrl: "https://github.com/owner/repo/actions/runs/7/job/42",
};
const otherFailed = {
  __typename: "StatusContext",
  context: "ci/external",
  state: "ERROR",
  targetUrl: "https://ci.example/build/9",
};
const running = { __typename: "CheckRun", name: "lint", status: "IN_PROGRESS" };
const passed = {
  __typename: "CheckRun",
  name: "lint",
  status: "COMPLETED",
  conclusion: "SUCCESS",
};
const failing = { statusCheckRollup: [passed, actionsFailed, otherFailed] };
// `gh run view --log-failed` output: job, step and timestamp prefix plus colour, both cut by logTail.
const rawLog =
  "test\tRun tests\t2026-11-26T10:00:00.0000000Z \x1b[31mnot ok 1 - adds\x1b[0m\n";
const ciFailed = {
  state: "ci-failed",
  checks: [
    {
      name: "test",
      link: actionsFailed.detailsUrl,
      tail: "not ok 1 - adds",
    },
    { name: "ci/external", link: otherFailed.targetUrl },
  ],
};
const pollRows: [string, object[], object][] = [
  ["no request", [], { state: "none" }],
  ["merged", [{ url: "pr", state: "MERGED" }], { state: "landed" }],
  [
    "merged beside a closed one",
    [
      { url: "old", state: "CLOSED" },
      { url: "pr", state: "MERGED" },
    ],
    { state: "landed" },
  ],
  ["closed", [{ ...open, state: "CLOSED" }], { state: "closed" }],
  [
    "closed + conflict",
    [{ ...open, state: "CLOSED", mergeable: "CONFLICTING" }],
    { state: "closed" },
  ],
  [
    "review required",
    [{ ...open, reviewDecision: "REVIEW_REQUIRED" }],
    { state: "review-required" },
  ],
  [
    "changes requested",
    [{ ...open, reviewDecision: "CHANGES_REQUESTED" }],
    { state: "review-required" },
  ],
  [
    "review required + ci-failed",
    [{ ...open, reviewDecision: "REVIEW_REQUIRED", ...failing }],
    { state: "review-required" },
  ],
  [
    "conflict",
    [{ ...open, mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }],
    { state: "conflict" },
  ],
  [
    "conflict + ci-failed",
    [{ ...open, mergeable: "CONFLICTING", ...failing }],
    { state: "conflict" },
  ],
  ["behind", [{ ...open, mergeStateStatus: "BEHIND" }], { state: "behind" }],
  [
    "behind + ci-failed",
    [{ ...open, mergeStateStatus: "BEHIND", ...failing }],
    { state: "behind" },
  ],
  ["ci-failed", [{ ...open, ...failing }], ciFailed],
  [
    "ci-failed with auto-merge off",
    [{ ...open, ...failing, autoMergeRequest: null }],
    ciFailed,
  ],
  [
    "a failed check while another still runs",
    [{ ...open, statusCheckRollup: [actionsFailed, running] }],
    { state: "waiting" },
  ],
  [
    "auto-merge off",
    [{ ...open, mergeStateStatus: "CLEAN", autoMergeRequest: null }],
    { state: "auto-merge-off" },
  ],
  [
    "CI pending",
    [{ ...open, statusCheckRollup: [running] }],
    { state: "waiting" },
  ],
  [
    "mergeable null",
    [{ ...open, mergeable: null, autoMergeRequest: null, ...failing }],
    { state: "waiting" },
  ],
  [
    "another head is reported, not judged",
    [{ ...open, headRefOid: "foreign", ...failing }],
    ciFailed,
  ],
  [
    "mergeable unknown",
    [{ ...open, mergeable: "UNKNOWN" }],
    { state: "waiting" },
  ],
];
for (const [name, requests, expected] of pollRows)
  test(`GitHub poll: ${name}`, async () => {
    const calls: string[] = [];
    const forge = new GitHubForge(
      "/repo",
      config,
      async () => "",
      async (_, args = []) => {
        calls.push(args.join(" "));
        if (args[0] === "run") return rawLog;
        return JSON.stringify(requests);
      },
    );
    const { head, ...polled } = await forge.poll({
      branch: "branch",
      sha: "abc",
      base: "main",
    });
    assert.deepEqual(polled, expected);
    // An open request reports its head; landing decides whether it is toddler's.
    const reported = requests as { state: string; headRefOid?: string }[];
    assert.equal(
      head,
      reported.some((item) => item.state === "MERGED")
        ? undefined
        : reported.find((item) => item.state === "OPEN")?.headRefOid,
    );
    assert.equal(
      calls[0],
      "pr list --repo owner/repo --head branch --state all --json url,state,headRefOid,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest,statusCheckRollup",
    );
    // Logs are read only for failing GitHub Actions jobs, only on ci-failed.
    assert.deepEqual(
      calls.slice(1),
      expected === ciFailed
        ? ["run view --repo owner/repo --job 42 --log-failed"]
        : [],
    );
  });
test("GitHub poll: an expired Actions log keeps name and link", async () => {
  const forge = new GitHubForge(
    "/repo",
    config,
    async () => "",
    async (_, args = []) => {
      if (args[0] === "run") throw new Error("log not found");
      return JSON.stringify([{ ...open, ...failing }]);
    },
  );
  assert.deepEqual(await forge.poll({ branch: "b", sha: "", base: "" }), {
    state: "ci-failed",
    checks: ciFailed.checks.map(({ name, link }) => ({ name, link })),
    head: "abc",
  });
});

const deliverRows: {
  name: string;
  autoMerge: boolean;
  requests: object[];
  push?: Error;
  auto?: Error;
  expected: object;
  calls: string[];
}[] = [
  {
    name: "a rejected push is refused and nothing else happens",
    autoMerge: true,
    requests: [{ url: "pr", state: "OPEN" }],
    push: new Error("! [rejected] abc -> branch (non-fast-forward)"),
    expected: {
      state: "refused",
      reason:
        "Push of abc to branch was rejected: ! [rejected] abc -> branch (non-fast-forward)",
    },
    calls: ["git push origin abc:refs/heads/branch"],
  },
  {
    name: "an open request is reused and auto-merge enabled again",
    autoMerge: true,
    requests: [{ url: "pr", state: "OPEN" }],
    expected: { state: "waiting", url: "pr" },
    calls: [
      "git push origin abc:refs/heads/branch",
      "gh pr list --repo owner/repo --head branch --state all --json url,state",
      "gh api repos/owner/repo",
      "gh repo view owner/repo --json viewerDefaultMergeMethod",
      "gh pr merge pr --auto --merge --match-head-commit abc",
    ],
  },
  {
    name: "autoMerge off opens the request and waits without enabling",
    autoMerge: false,
    requests: [{ url: "old", state: "CLOSED" }],
    expected: { state: "waiting", url: "created" },
    calls: [
      "git push origin abc:refs/heads/branch",
      "gh pr list --repo owner/repo --head branch --state all --json url,state",
      "gh pr create",
    ],
  },
  {
    name: "a clean PR GitHub refuses auto-merge on is merged at once, still waiting",
    autoMerge: true,
    requests: [{ url: "pr", state: "OPEN" }],
    auto: new Error("Pull request is in clean status"),
    expected: { state: "waiting", url: "pr" },
    calls: [
      "git push origin abc:refs/heads/branch",
      "gh pr list --repo owner/repo --head branch --state all --json url,state",
      "gh api repos/owner/repo",
      "gh repo view owner/repo --json viewerDefaultMergeMethod",
      "gh pr merge pr --auto --merge --match-head-commit abc",
      "gh pr merge pr --merge --match-head-commit abc",
    ],
  },
];
for (const row of deliverRows)
  test(`GitHub deliver: ${row.name}`, async () => {
    const calls: string[] = [];
    const forge = new GitHubForge(
      "/repo",
      { ...config, autoMerge: row.autoMerge },
      async (_, args = []) => {
        calls.push(["git", ...args].join(" "));
        if (row.push) throw row.push;
        return "";
      },
      async (_, args = []) => {
        // pr create's temp body file differs each run.
        calls.push(
          ["gh", ...(args[1] === "create" ? args.slice(0, 2) : args)].join(" "),
        );
        if (args[1] === "list") return JSON.stringify(row.requests);
        if (args[1] === "create") return "created";
        if (args[0] === "api")
          return JSON.stringify({ allow_merge_commit: true });
        if (args[0] === "repo")
          return JSON.stringify({ viewerDefaultMergeMethod: "MERGE" });
        if (args.includes("--auto") && row.auto) throw row.auto;
        return "";
      },
    );
    assert.deepEqual(
      await forge.deliver({
        branch: "branch",
        sha: "abc",
        base: "main",
        title: "t",
        body: "b",
      }),
      row.expected,
    );
    assert.deepEqual(calls, row.calls);
  });

test("an adult issue is never picked on any tracker, even with the issue label", async () => {
  const root = await mkdtemp(join(tmpdir(), "tracker-adult-"));
  try {
    const dir = join(root, ".sandcastle/specs/1-a/issues");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1-person.md"), "---\nlabels: [adult]\n---\n");
    await writeFile(join(dir, "2-toddler.md"), "Body");
    const files = await new FilesTracker(root).issues();
    assert.deepEqual(
      files.filter((issue) => ready(issue, config)).map((i) => i.number),
      [2],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const github = await new GitHubForge(
    ".",
    config,
    async () => "",
    async () =>
      JSON.stringify([
        [
          {
            number: 1,
            title: "Person",
            labels: [{ name: config.issueLabel }, { name: "adult" }],
          },
          {
            number: 2,
            title: "Toddler",
            labels: [{ name: config.issueLabel }],
          },
        ],
      ]),
  ).tracker.issues();
  assert.deepEqual(
    github.filter((issue) => ready(issue, config)).map((i) => i.number),
    [2],
  );
  const gitlabConfig = {
    ...config,
    forge: "gitlab",
    repository: "group/project",
  } as Config;
  const gitlab = await new GitLabForge(
    ".",
    gitlabConfig,
    async () => "",
    async () =>
      JSON.stringify([
        {
          iid: 1,
          title: "Person",
          description: "",
          labels: [config.issueLabel, "adult"],
        },
        {
          iid: 2,
          title: "Toddler",
          description: "",
          labels: [config.issueLabel],
        },
      ]),
  ).tracker.issues();
  assert.deepEqual(
    gitlab.filter((issue) => ready(issue, gitlabConfig)).map((i) => i.number),
    [2],
  );
});
