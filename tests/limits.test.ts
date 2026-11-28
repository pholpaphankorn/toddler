import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { limitModel, limitSignal, type LimitSignal } from "../src/limits.ts";

const dir = fileURLToPath(new URL("fixtures/limits/", import.meta.url));
const local = (a: number[]) =>
  new Date(a[0], a[1] - 1, a[2], a[3], a[4]).getTime();

for (const name of readdirSync(dir)) {
  test(`limit recogniser: ${name}`, () => {
    const fixture = JSON.parse(readFileSync(join(dir, name), "utf8"));
    assert.match(fixture.note, /source reading/);
    const now = fixture.now ? local(fixture.now) : Date.now();
    const found = fixture.lines
      .map((line: unknown) =>
        limitSignal(fixture.provider, JSON.stringify(line), now),
      )
      .filter(Boolean) as LimitSignal[];
    const { expect } = fixture;
    if (!expect) return assert.deepEqual(found, []);
    assert.ok(found.length);
    // The first signal on the stream is the one with the detail.
    assert.deepEqual(JSON.parse(JSON.stringify(found[0])), {
      ...(expect.type && { type: expect.type }),
      ...((expect.resetsLocal || expect.resetsAt) && {
        resetsAt: expect.resetsLocal
          ? local(expect.resetsLocal)
          : expect.resetsAt,
      }),
    });
  });
}

test("codex date form with an ordinal parses, and garbage lines are ignored", () => {
  const line = JSON.stringify({
    type: "error",
    message: "You’ve hit your usage limit. Try again at Dec 5th, 2030 3:04 PM.",
  });
  assert.equal(
    limitSignal("codex", line)?.resetsAt,
    local([2030, 12, 5, 15, 4]),
  );
  assert.equal(limitSignal("codex", "not json"), undefined);
  assert.equal(limitSignal("claude", line), undefined);
});

test("which stop: per-model buckets stop the model, everything else the provider", () => {
  assert.equal(
    limitModel("claude", "seven_day_opus", "claude-opus-4"),
    "claude-opus-4",
  );
  assert.equal(
    limitModel("claude", "seven_day_opus", "claude-sonnet-4"),
    undefined,
  );
  for (const type of [
    "five_hour",
    "seven_day",
    "seven_day_overage_included",
    "overage",
    "new_thing",
    undefined,
  ])
    assert.equal(limitModel("claude", type, "claude-opus-4"), undefined);
  assert.equal(limitModel("codex", "seven_day_opus", "opus"), undefined);
});
