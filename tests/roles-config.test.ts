import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaults, loadConfig, modelsForProvider } from "../src/config.ts";

test("role overrides merge by role, field and provider", () => {
  const root = mkdtempSync(join(tmpdir(), "roles-"));
  try {
    mkdirSync(join(root, ".sandcastle"));
    writeFileSync(
      join(root, ".sandcastle/config.json"),
      JSON.stringify({
        repository: "owner/repo",
        roles: { review: { models: { claude: "x" } } },
      }),
    );
    const config = loadConfig(root);
    assert.deepEqual(
      config.roles.implementation,
      defaults.roles.implementation,
    );
    assert.deepEqual(config.roles.review, {
      skills: defaults.roles.review.skills,
      models: { codex: "gpt-6.1-sol", claude: "x" },
    });
    assert.deepEqual(modelsForProvider(config, "claude"), [
      "claude-sonnet-5-5",
      "x",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("role prompt paths load from the project and reject invalid files", () => {
  const root = mkdtempSync(join(tmpdir(), "role-prompt-"));
  try {
    mkdirSync(join(root, ".sandcastle"));
    const write = (prompt: unknown) =>
      writeFileSync(
        join(root, ".sandcastle/config.json"),
        JSON.stringify({
          repository: "owner/repo",
          roles: { review: { prompt } },
        }),
      );
    writeFileSync(join(root, "review.md"), "Custom review");
    write("review.md");
    assert.equal(loadConfig(root).roles.review.prompt, "review.md");
    assert.equal(loadConfig(root).roles.implementation.prompt, undefined);
    writeFileSync(join(root, "empty.md"), " \n");
    for (const prompt of [null, 42, "", "  ", "missing.md", "empty.md"]) {
      write(prompt);
      assert.throws(() => loadConfig(root), /roles\.review\.prompt/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("role settings validate paths and reject obsolete keys", () => {
  const root = mkdtempSync(join(tmpdir(), "roles-"));
  try {
    mkdirSync(join(root, ".sandcastle"));
    const write = (settings: object) =>
      writeFileSync(
        join(root, ".sandcastle/config.json"),
        JSON.stringify({ repository: "owner/repo", ...settings }),
      );
    for (const [settings, path] of [
      [{ roles: { other: {} } }, /roles\.other/],
      [{ roles: { review: { prompt: "x" } } }, /roles\.review\.prompt/],
      [
        { roles: { review: { models: { claud: "x" } } } },
        /roles\.review\.models\.claud/,
      ],
      [
        { roles: { review: { models: { claude: " " } } } },
        /roles\.review\.models\.claude/,
      ],
      [
        { roles: { review: { models: { claude: 2 } } } },
        /roles\.review\.models\.claude/,
      ],
      [{ roles: { review: { skills: [2] } } }, /roles\.review\.skills/],
      [{ roles: { review: { skills: ["missing"] } } }, /roles\.review\.skills/],
      [{ models: {} }, /obsolete setting.*roles\.<role>.*README/],
      [{ skills: {} }, /obsolete setting.*roles\.<role>.*README/],
    ] as const) {
      write(settings);
      assert.throws(() => loadConfig(root), path);
    }
    write({
      roles: {
        implementation: { skills: [] },
        review: { models: { codex: "same", claude: "same" } },
      },
    });
    const config = loadConfig(root);
    assert.deepEqual(config.roles.implementation.skills, []);
    assert.deepEqual(config.roles.review.skills, defaults.roles.review.skills);
    assert.deepEqual(
      modelsForProvider(
        {
          roles: {
            ...config.roles,
            implementation: {
              ...config.roles.implementation,
              models: { codex: "same", claude: "same" },
            },
          },
        },
        "codex",
      ),
      ["same"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
