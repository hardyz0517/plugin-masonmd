import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileMarkdown, createMarkdownRuntime } from "../pipeline";
import type { MarkdownFeature } from "../types";

type FixtureExpectation = {
  profile: "legacy" | "bytemd-v1";
  features: MarkdownFeature[];
  diagnostics: string[];
  htmlSnapshot: {
    contains?: string[];
    notContains?: string[];
  };
};

const fixtureRoot = join(__dirname, "../fixtures");
const fixtureNames = readdirSync(fixtureRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("Mason Markdown fixture inventory", () => {
  it.each(fixtureNames)("renders %s according to its contract", async (name) => {
    const directory = join(fixtureRoot, name);
    const input = readFileSync(join(directory, "input.md"), "utf8");
    const expected = JSON.parse(
      readFileSync(join(directory, "expected.json"), "utf8"),
    ) as FixtureExpectation;
    const result = await compileMarkdown({
      raw: input,
      profile: expected.profile,
      target: "save-html",
      runtime: createMarkdownRuntime(expected.profile),
    });

    for (const feature of expected.features) expect(result.features.has(feature)).toBe(true);
    for (const message of expected.diagnostics) {
      expect(result.diagnostics.some((item) => item.message.includes(message))).toBe(true);
    }
    for (const fragment of expected.htmlSnapshot.contains || []) {
      expect(result.canonicalHtml).toContain(fragment);
    }
    for (const fragment of expected.htmlSnapshot.notContains || []) {
      expect(result.canonicalHtml).not.toContain(fragment);
    }
  });
});
