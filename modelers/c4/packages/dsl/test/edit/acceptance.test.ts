/*
 * The written file stays valid Structurizr DSL (BRIEF decision 1, SPEC 9.1 "Edit acceptance"):
 * `edit-acceptance.json` records what Structurizr 6.2.4 made of every golden after-file and of
 * the seeded fuzz outputs. Regenerate it with the commands in `test/README.md` (needs Java).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { viewCatalog, viewMembers } from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_SEEDS,
  fuzzFileName,
  readBases,
  runFuzzSequence,
} from "../../scripts/write-fuzz-outputs.mjs";
import { applyEdit } from "../../src/edit/apply.js";
import { parseWorkspace } from "../../src/parse.js";

interface Result {
  readonly file: string;
  readonly sha256: string;
  readonly accepted: boolean;
  readonly error?: string;
}

const RECORD = JSON.parse(
  readFileSync(new URL("../fixtures/snapshots/edit-acceptance.json", import.meta.url), "utf8"),
) as { readonly structurizr: { readonly version: string }; readonly results: readonly Result[] };
const BY_FILE = new Map(RECORD.results.map((result) => [result.file, result]));
const GOLDEN = new URL("./golden/", import.meta.url);
const API = { parseWorkspace, applyEdit, viewCatalog, viewMembers };
const BASES = readBases(fileURLToPath(new URL("../fixtures/structurizr", import.meta.url)));

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function rejection(result: Result | undefined): string | undefined {
  if (result === undefined) return "missing from edit-acceptance.json";
  return result.accepted ? undefined : `rejected: ${result.error ?? ""}`;
}

describe("edit acceptance by Structurizr", () => {
  it("was recorded with Structurizr 6.2.4", () => {
    expect(RECORD.structurizr.version).toBe("6.2.4");
  });

  const goldens = readdirSync(GOLDEN)
    .filter((name) => name.endsWith(".after.dsl"))
    .sort();

  it("covers every golden after-file", () => {
    expect(goldens.length).toBeGreaterThan(0);
    const missing = goldens.filter((name) => !BY_FILE.has(`test/edit/golden/${name}`));
    expect(missing, "run the snapshot script's --edits mode (test/README.md)").toEqual([]);
  });

  for (const name of goldens) {
    it(`accepts ${name} as it is now`, () => {
      const result = BY_FILE.get(`test/edit/golden/${name}`);
      expect(rejection(result)).toBeUndefined();
      const text = readFileSync(new URL(name, GOLDEN), "utf8");
      expect(result?.sha256, "stale hash: run the snapshot script's --edits mode").toBe(
        sha256(text),
      );
    });
  }

  it(
    "accepts every recorded fuzz output, and each seed still produces it",
    { timeout: 60_000 },
    () => {
      const problems: string[] = [];
      for (let seed = 1; seed <= ACCEPTANCE_SEEDS; seed += 1) {
        const file = `fuzz/${fuzzFileName(seed)}`;
        const result = BY_FILE.get(file);
        const refused = rejection(result);
        if (refused !== undefined) {
          problems.push(`${file}: ${refused}`);
          continue;
        }
        if (sha256(runFuzzSequence(seed, API, BASES).text) !== result?.sha256) {
          problems.push(`${file}: the seed no longer reproduces the recorded text`);
        }
      }
      expect(problems).toEqual([]);
    },
  );
});
