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

test("GitLab doctor fails on open spec children missing the issue label", async () => {
  const issue = (iid: number, labels: string[], description = "") => ({
    iid,
    labels,
    description,
  });
  const states: Record<string, string> = {
    1: "opened",
    2: "opened",
    9: "closed",
  };
  let pages: unknown[][] | Error = [];
  const gets: string[] = [];
  const forge = new GitLabForge(
    ".",
    config,
    async () => "",
    async (_, args = []) => {
      if (pages instanceof Error) throw pages;
      if (args.includes("--paginate"))
        return pages.map((page) => JSON.stringify(page)).join("\n");
      gets.push(args[1]);
      return JSON.stringify({ state: states[args[1].split("/").pop()!] });
    },
  );
  const [name, check] = forge.doctorChecks(config)[2];
  assert.equal(name, "Spec children");
  pages = [
    [
      issue(2, [], "Spec: #1"), // nested: its spec is a child of #1
      issue(3, [], "Text\nSpec: #2"),
      issue(4, ["workflow::ready"], "Spec: #1"),
      issue(5, [], "Spec: #9"), // closed spec
      issue(6, [], "No spec"),
      issue(7, ["adult"], "Spec: #1"),
    ],
    [issue(8, ["on-hold"], "Spec: #2"), issue(10, [], "Spec: #1")],
  ];
  await assert.rejects(check(), {
    message: "3 missing workflow::ready: #2, #3, #10",
  });
  assert.deepEqual(gets.sort(), [
    "projects/group%2Fsub%2Fproject/issues/1",
    "projects/group%2Fsub%2Fproject/issues/2",
    "projects/group%2Fsub%2Fproject/issues/9",
  ]);
  pages = [
    Array.from({ length: 11 }, (_, index) => issue(20 + index, [], "Spec: #1")),
  ];
  await assert.rejects(check(), {
    message:
      "11 missing workflow::ready: #20, #21, #22, #23, #24, #25, #26, #27, #28, #29 (+1 more)",
  });
  pages = [
    [issue(4, ["workflow::ready"], "Spec: #1"), issue(5, [], "Spec: #9")],
  ];
  assert.equal(await check(), "1 open, all labelled workflow::ready");
  pages = new Error("glab: 401 Unauthorized");
  await assert.rejects(check(), /401 Unauthorized/);
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
      clock: { now: () => Date.now(), wait: async () => {} },
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
          "api projects/group%2Fsub%2Fproject/merge_requests/42/merge --method PUT --field auto_merge=true --raw-field sha=reviewed",
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

// One raw merge request per poll state, plus the precedence overlaps; matches GitHub's rows.
const project = "projects/group%2Fsub%2Fproject";
const listCall = `api ${project}/merge_requests?source_branch=branch&per_page=100 --paginate --output ndjson`;
const open = {
  iid: 42,
  web_url: "mr",
  state: "opened",
  sha: "abc",
  detailed_merge_status: "ci_still_running",
  has_conflicts: false,
  merge_when_pipeline_succeeds: true,
  head_pipeline: { id: 7, status: "running", web_url: "pipeline" },
};
const failing = {
  head_pipeline: { id: 7, status: "failed", web_url: "pipeline" },
};
const jobs = [
  { id: 1, name: "test", allow_failure: false, web_url: "job/1" },
  { id: 2, name: "flaky", allow_failure: true, web_url: "job/2" },
];
// A job trace: section markers and colour, cut by logTail.
const trace =
  "section_start:1:step_script\r\x1b[0K\x1b[31mnot ok 1 - adds\x1b[0m\n";
const ciFailed = {
  state: "ci-failed",
  checks: [{ name: "test", link: "job/1", tail: "not ok 1 - adds" }],
};
const pollRows: [string, object[], object][] = [
  ["no request", [], { state: "none" }],
  ["merged", [{ iid: 1, web_url: "mr", state: "merged" }], { state: "landed" }],
  [
    "merged beside a closed one",
    [
      { iid: 1, web_url: "old", state: "closed" },
      { iid: 2, web_url: "mr", state: "merged" },
    ],
    { state: "landed" },
  ],
  ["closed", [{ ...open, state: "closed" }], { state: "closed" }],
  [
    "closed + conflict",
    [{ ...open, state: "closed", detailed_merge_status: "conflict" }],
    { state: "closed" },
  ],
  [
    "not approved",
    [{ ...open, detailed_merge_status: "not_approved" }],
    { state: "review-required" },
  ],
  [
    "changes requested",
    [{ ...open, detailed_merge_status: "requested_changes" }],
    { state: "review-required" },
  ],
  [
    "review required + ci-failed",
    [{ ...open, detailed_merge_status: "not_approved", ...failing }],
    { state: "review-required" },
  ],
  [
    "conflict",
    [{ ...open, detailed_merge_status: "conflict", has_conflicts: true }],
    { state: "conflict" },
  ],
  [
    "conflict + ci-failed",
    [{ ...open, detailed_merge_status: "conflict", ...failing }],
    { state: "conflict" },
  ],
  [
    "need_rebase",
    [{ ...open, detailed_merge_status: "need_rebase" }],
    { state: "behind" },
  ],
  [
    "need_rebase + ci-failed",
    [{ ...open, detailed_merge_status: "need_rebase", ...failing }],
    { state: "behind" },
  ],
  [
    "ci-failed drops allow_failure jobs",
    [{ ...open, detailed_merge_status: "ci_must_pass", ...failing }],
    ciFailed,
  ],
  [
    "ci-failed with auto-merge off",
    [{ ...open, ...failing, merge_when_pipeline_succeeds: false }],
    ciFailed,
  ],
  [
    "auto-merge off",
    [
      {
        ...open,
        detailed_merge_status: "mergeable",
        merge_when_pipeline_succeeds: false,
        head_pipeline: { id: 7, status: "success" },
      },
    ],
    { state: "auto-merge-off" },
  ],
  ["CI pending", [open], { state: "waiting" }],
  [
    "mergeability still being checked",
    [
      {
        ...open,
        detailed_merge_status: "checking",
        merge_when_pipeline_succeeds: false,
        ...failing,
      },
    ],
    { state: "waiting" },
  ],
  [
    "locked while GitLab merges it",
    [{ ...open, state: "locked" }],
    { state: "waiting" },
  ],
  [
    "a canceled pipeline is ci-failed, not waiting forever",
    [
      {
        ...open,
        head_pipeline: { id: 7, status: "canceled", web_url: "pipeline" },
      },
    ],
    ciFailed,
  ],
  [
    "another head is reported, not judged",
    [{ ...open, sha: "foreign", ...failing }],
    ciFailed,
  ],
];
for (const [name, requests, expected] of pollRows)
  test(`GitLab poll: ${name}`, async () => {
    const calls: string[] = [];
    const forge = new GitLabForge(
      "/repo",
      config,
      async () => "",
      async (_, args = []) => {
        calls.push(args.join(" "));
        if (args[1].endsWith("/trace")) return trace;
        if (args[1].includes("/jobs?")) return JSON.stringify(jobs);
        if (args[1].endsWith("/merge_requests/42"))
          return JSON.stringify(requests[0]);
        return JSON.stringify(requests);
      },
    );
    const { head, ...polled } = await forge.poll({
      branch: "branch",
      sha: "abc",
      base: "main",
    });
    assert.deepEqual(polled, expected);
    const reported = requests as { state: string; sha?: string }[];
    const opened = !reported.some((item) => item.state === "merged")
      ? reported.find((item) => item.state === "opened")
      : undefined;
    // An open request reports its head; landing decides whether it is toddler's.
    assert.equal(head, opened?.sha);
    // The open request is read again for its pipeline; jobs and traces only on ci-failed.
    assert.deepEqual(calls, [
      listCall,
      ...(opened ? [`api ${project}/merge_requests/42`] : []),
      ...(expected === ciFailed
        ? [
            `api ${project}/pipelines/7/jobs?scope[]=failed&per_page=100 --paginate --output ndjson`,
            `api ${project}/jobs/1/trace`,
          ]
        : []),
    ]);
  });

test("GitLab poll: a long trace is cut to its tail, a missing one keeps name and link", async () => {
  const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
  for (const log of [long, undefined]) {
    const forge = new GitLabForge(
      "/repo",
      config,
      async () => "",
      async (_, args = []) => {
        if (args[1].endsWith("/trace")) {
          if (log === undefined) throw new Error("404 Not Found");
          return log;
        }
        if (args[1].includes("/jobs?")) return JSON.stringify(jobs);
        if (args[1].endsWith("/merge_requests/42"))
          return JSON.stringify({ ...open, ...failing });
        return JSON.stringify([open]);
      },
    );
    const polled = await forge.poll({
      branch: "branch",
      sha: "abc",
      base: "main",
    });
    assert.equal(polled.state, "ci-failed");
    const [check] = (
      polled as { checks: { name: string; link: string; tail?: string }[] }
    ).checks;
    if (log === undefined)
      assert.deepEqual(check, { name: "test", link: "job/1" });
    else {
      assert.match(check.tail!, /^\[… 300 earlier lines cut\]\nline 300\n/);
      assert.match(check.tail!, /line 499$/);
    }
  }
});

test("GitLab poll: external CI gives name and link, an unnamed failure the pipeline", async () => {
  for (const statuses of [
    [
      {
        name: "ci/external",
        status: "failed",
        allow_failure: false,
        target_url: "https://ci.example/9",
      },
      {
        name: "ci/optional",
        status: "failed",
        allow_failure: true,
        target_url: "x",
      },
      { name: "ci/ok", status: "success", target_url: "y" },
    ],
    [],
  ]) {
    const calls: string[] = [];
    const forge = new GitLabForge(
      "/repo",
      config,
      async () => "",
      async (_, args = []) => {
        calls.push(args[1]);
        if (args[1].includes("/jobs?")) return "[]";
        if (args[1].includes("/statuses?")) return JSON.stringify(statuses);
        if (args[1].endsWith("/merge_requests/42"))
          return JSON.stringify({ ...open, ...failing });
        return JSON.stringify([open]);
      },
    );
    assert.deepEqual(
      await forge.poll({ branch: "branch", sha: "abc", base: "main" }),
      {
        state: "ci-failed",
        checks: statuses.length
          ? [{ name: "ci/external", link: "https://ci.example/9" }]
          : [{ name: "pipeline", link: "pipeline" }],
        head: "abc",
      },
    );
    assert.ok(
      calls.includes(
        `${project}/repository/commits/abc/statuses?pipeline_id=7&per_page=100`,
      ),
    );
  }
});

const merge = (sha: string) =>
  `glab api ${project}/merge_requests/42/merge --method PUT --field auto_merge=true --raw-field sha=${sha}`;
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
    requests: [{ iid: 42, web_url: "mr/-/merge_requests/42", state: "opened" }],
    push: new Error("! [rejected] abc -> branch (non-fast-forward)"),
    expected: {
      state: "refused",
      reason:
        "Push of abc to branch was rejected: ! [rejected] abc -> branch (non-fast-forward)",
    },
    calls: ["git push origin abc:refs/heads/branch"],
  },
  {
    name: "an open request is reused and auto-merge enabled again on the pushed SHA",
    autoMerge: true,
    requests: [{ iid: 42, web_url: "mr/-/merge_requests/42", state: "opened" }],
    expected: { state: "waiting", url: "mr/-/merge_requests/42" },
    calls: [
      "git push origin abc:refs/heads/branch",
      `glab ${listCall}`,
      merge("abc"),
    ],
  },
  {
    name: "autoMerge off opens the request and waits without enabling",
    autoMerge: false,
    requests: [{ iid: 1, web_url: "old", state: "closed" }],
    expected: { state: "waiting", url: "mr/-/merge_requests/42" },
    calls: [
      "git push origin abc:refs/heads/branch",
      `glab ${listCall}`,
      `glab api ${project}/merge_requests --method POST`,
    ],
  },
  {
    name: "a rebase-only project refusing the merge commit is refused",
    autoMerge: true,
    requests: [{ iid: 42, web_url: "mr/-/merge_requests/42", state: "opened" }],
    auto: new Error("HTTP 406: Branch cannot be merged"),
    expected: {
      state: "refused",
      reason:
        "Could not enable auto-merge on mr/-/merge_requests/42: HTTP 406: Branch cannot be merged",
    },
    calls: [
      "git push origin abc:refs/heads/branch",
      `glab ${listCall}`,
      merge("abc"),
    ],
  },
];
for (const row of deliverRows)
  test(`GitLab deliver: ${row.name}`, async () => {
    const calls: string[] = [];
    const forge = new GitLabForge(
      "/repo",
      { ...config, autoMerge: row.autoMerge },
      async (_, args = []) => {
        calls.push(["git", ...args].join(" "));
        if (row.push) throw row.push;
        return "";
      },
      async (_, args = []) => {
        // The POST's fields carry the title and body.
        calls.push(
          ["glab", ...(args.includes("POST") ? args.slice(0, 4) : args)].join(
            " ",
          ),
        );
        if (args.includes("POST"))
          return JSON.stringify({ web_url: "mr/-/merge_requests/42" });
        if (args.includes("PUT")) {
          if (row.auto) throw row.auto;
          return "{}";
        }
        return JSON.stringify(row.requests);
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

test("GitLab deliver re-enables auto-merge after every push, each time on the SHA just pushed", async () => {
  const calls: string[] = [];
  const forge = new GitLabForge(
    "/repo",
    { ...config, autoMerge: true },
    async (_, args = []) => {
      calls.push(["git", ...args].join(" "));
      return "";
    },
    async (_, args = []) => {
      calls.push(["glab", ...args].join(" "));
      return args.includes("PUT")
        ? "{}"
        : JSON.stringify([
            { iid: 42, web_url: "mr/-/merge_requests/42", state: "opened" },
          ]);
    },
  );
  for (const sha of ["abc", "def"])
    await forge.deliver({
      branch: "branch",
      sha,
      base: "main",
      title: "t",
      body: "b",
    });
  assert.deepEqual(
    calls.filter((call) => call.includes("push") || call.includes("PUT")),
    [
      "git push origin abc:refs/heads/branch",
      merge("abc"),
      "git push origin def:refs/heads/branch",
      merge("def"),
    ],
  );
});
