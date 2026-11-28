import test, { mock } from "node:test";
import assert from "node:assert/strict";
import balanced from "../src/rankers/balanced.ts";
import mostQuota from "../src/rankers/most-quota.ts";
import { loadRanker } from "../src/policy.ts";
import { defaults, type Provider } from "../src/config.ts";
import type { Reading } from "../src/quota.ts";

const reading = (
  weekly: number,
  fiveHour: number | null = 100,
  models: Record<string, number> = {},
): Reading => ({
  observedAt: Date.now(),
  allowed: null,
  weekly: { remainingPercent: weekly, resetsAt: null },
  fiveHour:
    fiveHour === null ? null : { remainingPercent: fiveHour, resetsAt: null },
  weeklyByModel: Object.fromEntries(
    Object.entries(models).map(([model, remainingPercent]) => [
      model,
      { remainingPercent, resetsAt: null },
    ]),
  ),
});
const candidate = (
  provider: Provider,
  r: Reading,
  running = 0,
  model = provider as string,
) => ({ provider, model, reading: r, running });
// Math.random returns these in turn: the first candidate's tie key, then the second's.
const flips = (...values: number[]) =>
  mock.method(Math, "random", () => values.shift() ?? 0);

test("balanced divides the tighter quota by running + 1", () => {
  assert.deepEqual(
    balanced({
      candidates: [
        candidate("codex", reading(80, 90), 1),
        candidate("claude", reading(50, 50), 0),
      ],
    }),
    ["claude", "codex"],
  );
  // Five-hour is the tighter window here; percentages round down.
  assert.deepEqual(
    balanced({
      candidates: [
        candidate("codex", reading(90, 40.9)),
        candidate("claude", reading(41.5, null)),
      ],
    }),
    ["claude", "codex"],
  );
  assert.deepEqual(
    balanced({
      candidates: [
        candidate("codex", reading(90, 40.9), 0),
        candidate("claude", reading(60, 100), 1),
      ],
    }),
    ["codex", "claude"],
  );
});

test("balanced uses the model's weekly quota and breaks ties with a coin flip", () => {
  assert.deepEqual(
    balanced({
      candidates: [
        candidate("codex", reading(90, 100, { "gpt-5": 10 }), 0, "gpt-5"),
        candidate("claude", reading(50), 0),
      ],
    }),
    ["claude", "codex"],
  );
  const tied = [
    candidate("codex", reading(50)),
    candidate("claude", reading(50)),
  ];
  const random = flips(0.2, 0.8);
  assert.deepEqual(balanced({ candidates: tied }), ["claude", "codex"]);
  random.mock.restore();
  flips(0.8, 0.2);
  assert.deepEqual(balanced({ candidates: tied }), ["codex", "claude"]);
  mock.restoreAll();
});

test("most-quota ignores running: weekly, then five-hour, then a coin flip", () => {
  const pair = (a: Reading, b: Reading) => ({
    candidates: [candidate("codex", a, 5), candidate("claude", b, 0)],
  });
  assert.deepEqual(mostQuota(pair(reading(62, 10), reading(61.9, 90))), [
    "codex",
    "claude",
  ]);
  assert.deepEqual(mostQuota(pair(reading(61.2, 90), reading(61.8, 10))), [
    "codex",
    "claude",
  ]);
  assert.deepEqual(mostQuota(pair(reading(60, 10), reading(60, 20))), [
    "claude",
    "codex",
  ]);
  const model = mostQuota({
    candidates: [
      candidate("codex", reading(90, 100, { "gpt-5": 10 }), 0, "gpt-5"),
      candidate("claude", reading(50)),
    ],
  });
  assert.deepEqual(model, ["claude", "codex"]);
  const tie = pair(reading(60, 50), reading(60, 50));
  flips(0.2, 0.8);
  assert.deepEqual(mostQuota(tie), ["claude", "codex"]);
  mock.restoreAll();
  flips(0.8, 0.2);
  assert.deepEqual(mostQuota(tie), ["codex", "claude"]);
  mock.restoreAll();
});

test("built-in names load the shipped files and ./path loads a project file", async () => {
  assert.equal(defaults.ranking, "balanced");
  const input = {
    candidates: [
      candidate("codex", reading(10)),
      candidate("claude", reading(90)),
    ],
  };
  for (const name of ["balanced", "most-quota"])
    assert.deepEqual(
      (await loadRanker(process.cwd(), { ...defaults, ranking: name }))(input),
      ["claude", "codex"],
    );
  // "./balanced" is a project path, not the built-in.
  await assert.rejects(
    loadRanker("tests/fixtures", { ...defaults, ranking: "./balanced" }),
    /Ranking module \.\/balanced/,
  );
  const project = await loadRanker(process.cwd(), {
    ...defaults,
    ranking: "./tests/fixtures/ranking/reverse.ts",
  });
  assert.deepEqual(project(input), ["claude", "codex"]);
});

test("old ranking values are plain paths that fail to load", async () => {
  for (const ranking of ["quota", "order"])
    await assert.rejects(
      loadRanker(process.cwd(), { ...defaults, ranking }),
      (error: Error) =>
        error.message.startsWith(`Ranking module ${ranking}:`) &&
        !/balanced|most-quota/.test(error.message),
    );
});
