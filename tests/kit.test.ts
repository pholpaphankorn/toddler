import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaults, type Config } from "../src/config.ts";
import { end, spliceBlock, start, templates } from "../src/kit.ts";

const block = spliceBlock("AGENTS.md", "").trimEnd();

test("spliceBlock: appends, replaces between markers, refuses bad markers", () => {
  assert.equal(spliceBlock("AGENTS.md", ""), `${block}\n`);
  assert.equal(spliceBlock("AGENTS.md", "# Notes\n"), `# Notes\n\n${block}\n`);
  assert.equal(spliceBlock("AGENTS.md", "# Notes"), `# Notes\n\n${block}\n`);
  assert.equal(
    spliceBlock("AGENTS.md", `before\n${start}\nold text\n${end}\nafter\n`),
    `before\n${block}\nafter\n`,
  );
  for (const text of [
    `${start}\nold`,
    `old\n${end}\n`,
    `${start}\n${end}\n${start}\n${end}\n`,
    `${end}\n${start}\n`,
  ])
    assert.throws(() => spliceBlock("CLAUDE.md", text), /^Error: CLAUDE\.md:/);
});

test("templates carry the configured label names for each tracker", () => {
  const config = {
    ...defaults,
    issueLabel: "Toddle",
    parallelLabel: "side-by-side",
    blockedLabels: ["stuck", "later"],
    adultLabel: "grown-up",
  } as Config;
  for (const [forge, issues] of [
    ["none", "files"],
    ["github", "forge"],
    ["gitlab", "forge"],
  ] as const) {
    const { spec, issue } = templates({ ...config, forge, issues });
    for (const label of ["Toddle", "side-by-side", "stuck", "later"])
      assert.ok(issue.includes(`\`${label}\``), `${forge} issue: ${label}`);
    assert.match(issue, /`grown-up` when a person, not toddler, should do it/);
    assert.ok(!issue.includes("Sandcastle") && !issue.includes("`adult`"));
    assert.match(spec, /## Problem Statement/);
    if (issues === "forge") {
      assert.match(issue, /--label Toddle /);
      assert.match(spec, /WITHOUT the `Toddle` label/);
    }
  }
  assert.match(
    templates({ ...config, forge: "gitlab", issues: "forge" }).issue,
    /glab issue create/,
  );
  assert.match(
    templates({ ...config, forge: "github", issues: "forge" }).issue,
    /gh api -X POST/,
  );
  assert.match(
    templates({ ...config, forge: "none", issues: "files" }).issue,
    /^---\ntitle: <Issue title>/,
  );
});

const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));

function repo(config: object = {}) {
  const root = mkdtempSync(join(tmpdir(), "setup-kit-"));
  const bin = join(root, ".bin");
  mkdirSync(bin);
  for (const name of ["gh", "glab", "codex", "claude"]) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
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
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const setConfig = (value: object) =>
    write(
      ".sandcastle/config.json",
      JSON.stringify({ forge: "none", providers: ["codex"], ...value }),
    );
  git("init", "-q", "-b", "main");
  write(".gitignore", ".bin/\n");
  setConfig(config);
  git("add", ".");
  git("commit", "-q", "-m", "init");
  const setup = () => {
    const result = spawnSync(process.execPath, [main, "setup"], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ...result, lines: result.stdout.split("\n") };
  };
  const commits = () => Number(git("rev-list", "--count", "HEAD"));
  const status = () => git("status", "--porcelain", "--untracked-files=all");
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  return { root, git, write, read, setConfig, setup, commits, status, cleanup };
}

const kit = [
  ".sandcastle/templates/spec.md",
  ".sandcastle/templates/issue.md",
  "AGENTS.md",
  "CLAUDE.md",
];

test("setup without a config says to run init first", () => {
  const r = repo();
  try {
    r.git("rm", "-q", ".sandcastle/config.json");
    const result = r.setup();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /run `toddler init` first/);
  } finally {
    r.cleanup();
  }
});

test("setup writes and commits the kit once, then is up to date", () => {
  const r = repo();
  try {
    const first = r.setup();
    for (const path of kit)
      assert.ok(first.lines.includes(`kit: wrote ${path}`));
    const sha = r.git("rev-parse", "--short", "HEAD");
    assert.ok(
      first.lines.includes(
        `kit: committed ${sha} (toddler: set up planning kit)`,
      ),
      first.stdout,
    );
    assert.equal(
      r.git("log", "-1", "--format=%s"),
      "toddler: set up planning kit",
    );
    assert.equal(r.status(), "");
    assert.equal(r.read("CLAUDE.md"), "@AGENTS.md\n");
    assert.match(r.read("AGENTS.md"), /^<!-- toddler:start -->\n/);
    assert.match(r.read(".sandcastle/templates/issue.md"), /`adult`/);
    // Logins and doctor still run after the kit.
    assert.match(first.stdout, /Codex/);

    const second = r.setup();
    assert.ok(second.lines.includes("kit: up to date"), second.stdout);
    assert.ok(!second.stdout.includes("kit: wrote"));
    assert.equal(r.commits(), 2);
  } finally {
    r.cleanup();
  }
});

test("a label change re-renders and commits only the changed templates", () => {
  const r = repo();
  try {
    r.setup();
    r.setConfig({ adultLabel: "grown-up", issueLabel: "Toddle" });
    r.git("commit", "-q", "-am", "labels");
    const result = r.setup();
    assert.deepEqual(
      result.lines.filter((line) => line.startsWith("kit:")),
      [
        "kit: wrote .sandcastle/templates/issue.md",
        `kit: committed ${r.git("rev-parse", "--short", "HEAD")} (toddler: set up planning kit)`,
      ],
    );
    assert.equal(
      r.git("show", "--name-only", "--format=", "HEAD"),
      ".sandcastle/templates/issue.md",
    );
    assert.match(r.read(".sandcastle/templates/issue.md"), /`grown-up`/);
    assert.match(r.read(".sandcastle/templates/issue.md"), /`Toddle`/);
  } finally {
    r.cleanup();
  }
});

test("uncommitted edits stay out of the commit, as do other staged changes", () => {
  const r = repo();
  try {
    r.write("AGENTS.md", "# Agents\n");
    r.git("add", "AGENTS.md");
    r.git("commit", "-q", "-m", "agents");
    r.write("AGENTS.md", "# Agents\nmy edit\n");
    r.write("other.txt", "staged\n");
    r.git("add", "other.txt");
    const result = r.setup();
    assert.ok(
      result.lines.includes(
        "AGENTS.md: has your uncommitted edits, commit it yourself",
      ),
      result.stdout,
    );
    assert.ok(result.lines.includes("kit: wrote AGENTS.md"));
    assert.equal(
      r.git("show", "--name-only", "--format=", "HEAD"),
      ".sandcastle/templates/issue.md\n.sandcastle/templates/spec.md",
    );
    assert.equal(r.read("AGENTS.md"), `# Agents\nmy edit\n\n${block}\n`);
    assert.equal(r.status(), "M AGENTS.md\nA  other.txt");
    assert.ok(!existsSync(join(r.root, "CLAUDE.md")));
  } finally {
    r.cleanup();
  }
});

test("detached HEAD writes the kit without committing", () => {
  const r = repo();
  try {
    r.git("checkout", "-q", "--detach");
    const result = r.setup();
    assert.ok(
      result.lines.includes("detached HEAD: kit written, not committed"),
      result.stdout,
    );
    assert.ok(result.lines.includes("kit: wrote AGENTS.md"));
    assert.equal(r.commits(), 1);
  } finally {
    r.cleanup();
  }
});

test("the next run finishes a run whose commit was interrupted", () => {
  const r = repo();
  try {
    r.git("checkout", "-q", "--detach");
    r.setup();
    r.git("checkout", "-q", "main");
    const result = r.setup();
    assert.ok(!result.stdout.includes("kit: wrote"), result.stdout);
    assert.ok(!result.stdout.includes("uncommitted edits"), result.stdout);
    assert.ok(result.lines.some((line) => line.startsWith("kit: committed")));
    assert.equal(r.status(), "");
  } finally {
    r.cleanup();
  }
});

test("both agent files get the block", () => {
  const r = repo();
  try {
    r.write("AGENTS.md", "a\n");
    r.write("CLAUDE.md", "c\n");
    r.git("add", ".");
    r.git("commit", "-q", "-m", "agent files");
    r.setup();
    assert.equal(r.read("AGENTS.md"), `a\n\n${block}\n`);
    assert.equal(r.read("CLAUDE.md"), `c\n\n${block}\n`);
    assert.equal(r.status(), "");
  } finally {
    r.cleanup();
  }
});

test("bad markers stop setup before anything is written", () => {
  const r = repo();
  try {
    r.write("CLAUDE.md", `${start}\nno end\n`);
    r.git("add", ".");
    r.git("commit", "-q", "-m", "claude");
    const result = r.setup();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^CLAUDE\.md:/);
    assert.ok(!existsSync(join(r.root, ".sandcastle/templates")));
    assert.ok(!existsSync(join(r.root, "AGENTS.md")));
    assert.equal(r.status(), "");
    assert.equal(r.commits(), 2);
  } finally {
    r.cleanup();
  }
});
