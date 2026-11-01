import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTextEdits } from "../../src/edit/apply.js";
import { parseWorkspace } from "../../src/parse.js";
import { GOLDEN_CASES } from "./golden/cases.js";
import { edit } from "./support/edit.js";

const UPDATE = process.env["UPDATE_GOLDENS"] === "1";

function afterFile(name: string): URL {
  return new URL(`./golden/${name}.after.dsl`, import.meta.url);
}

describe("golden edits", () => {
  it("has unique case names", () => {
    const names = GOLDEN_CASES.map((golden) => golden.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const golden of GOLDEN_CASES) {
    it(golden.name, () => {
      expect(parseWorkspace(golden.before).ok).toBe(true);
      const outcome = edit(golden.before, golden.edit, golden.options);
      if (!outcome.ok)
        throw new Error(
          `${outcome.reason}: ${outcome.message} ${(outcome as { detail?: string }).detail ?? ""}`,
        );
      const file = afterFile(golden.name);
      if (UPDATE) writeFileSync(file, outcome.text);
      expect(
        existsSync(file),
        `${golden.name}.after.dsl is missing: run with UPDATE_GOLDENS=1`,
      ).toBe(true);
      expect(outcome.text).toBe(readFileSync(file, "utf8"));
      expect(applyTextEdits(golden.before, outcome.edits)).toBe(outcome.text);
      expect(applyTextEdits(outcome.text, outcome.inverse)).toBe(golden.before);
      expect(outcome.document.ok).toBe(true);
      expect([...outcome.notices].sort()).toEqual([...(golden.notices ?? [])].sort());
      if (golden.view !== undefined) expect(outcome.view).toBe(golden.view);
    });
  }
});
