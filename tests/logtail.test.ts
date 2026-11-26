import test from "node:test";
import assert from "node:assert/strict";
import { logTail, logTails, fence } from "../src/logtail.ts";

const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

const secrets = [
  "ghp_" + "a".repeat(36),
  "gho_" + "a".repeat(36),
  "ghs_" + "a".repeat(36),
  "github_pat_" + "A1_".repeat(20),
  "glpat-" + "a1-".repeat(10),
  "sk-ant-api03-" + "aB1_-".repeat(6),
  "sk-" + "aB1".repeat(10),
  "AKIA" + "ABCDEFGH12345678",
  "xoxb-123456789012-abcdefghij",
  "xoxp-123456789012-abcdefghij",
  "Authorization: Bearer abc.def-ghi",
  "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
];

const cases: [string, string, (out: string) => void][] = [
  [
    "ANSI and control characters",
    "\x1b[31mred\x1b[0m\x07 a\tb\x00",
    (out) => assert.equal(out, "red a\tb"),
  ],
  [
    "\\r redraws keep the last text",
    "10%\r50%\r100% done\nnext",
    (out) => assert.equal(out, "100% done\nnext"),
  ],
  [
    "gh prefix",
    "build\tRun tests\t2024-05-01T10:11:12.1234567Z boom",
    (out) => assert.equal(out, "boom"),
  ],
  [
    "GitLab section markers",
    "section_start:1700000000:step_script\r\x1b[0K\x1b[36;1mRunning\x1b[0;m\nsection_end:1700000001:step_script\r\x1b[0K",
    (out) => assert.equal(out, "Running"),
  ],
  [
    "line cap",
    lines(250),
    (out) => {
      const rows = out.split("\n");
      assert.equal(rows[0], "[… 50 earlier lines cut]");
      assert.equal(rows.length, 201);
      assert.equal(rows[1], "line 51");
    },
  ],
  [
    "byte cap on a multibyte character",
    "é".repeat(10000),
    (out) => {
      assert.ok(Buffer.byteLength(out) <= 16 * 1024);
      assert.ok(!out.includes("�"));
      assert.match(out, /^é+$/);
    },
  ],
  [
    "byte cap drops whole lines",
    Array.from({ length: 200 }, () => "x".repeat(199)).join("\n"),
    (out) => {
      const [head, ...rest] = out.split("\n");
      assert.match(head!, /^\[… \d+ earlier lines cut\]$/);
      assert.ok(Buffer.byteLength(rest.join("\n")) <= 16 * 1024);
      assert.ok(rest.every((l) => l.length === 199));
    },
  ],
  ...secrets.map((secret): [string, string, (out: string) => void] => [
    `redacts ${secret.slice(0, 12).replace(/\n/g, " ")}`,
    `before ${secret} after`,
    (out) => assert.equal(out, "before [redacted] after"),
  ]),
  [
    "a SHA is not redacted",
    "commit 14ae03bd7dca15a104cb8e5b9b7afb6147e21551",
    (out) =>
      assert.equal(out, "commit 14ae03bd7dca15a104cb8e5b9b7afb6147e21551"),
  ],
];
for (const [name, input, check] of cases)
  test(`logTail: ${name}`, () => check(logTail(input)));

test("logTails: 48 KB total, then names only", () => {
  const big = Array.from({ length: 150 }, (_, i) => `${i} ${"y".repeat(100)}`);
  const { checks, note } = logTails(
    ["a", "b", "c", "d", "e"].map((name) => ({
      name,
      link: `u/${name}`,
      log: big.join("\n"),
    })),
  );
  const total = checks.reduce((n, c) => n + Buffer.byteLength(c.tail ?? ""), 0);
  assert.ok(total <= 48 * 1024);
  assert.ok(checks[0]!.tail && !checks.at(-1)!.tail);
  assert.equal(checks.at(-1)!.link, "u/e");
  assert.match(note!, /^\[\d+ more failing checks: names only\]$/);
  assert.equal(logTails([{ name: "x", link: "l" }]).note, undefined);
});

test("fence is longer than any backtick run inside", () => {
  assert.equal(fence("plain"), "```\nplain\n```");
  assert.equal(fence("a ```` b ``"), "`````\na ```` b ``\n`````");
});
