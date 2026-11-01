import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCst } from "../../src/syntax/index.js";
import { cstProblems } from "./support/invariants.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "structurizr");
const MUTATIONS = 10_000;
const BATCHES = 10;

function dslTexts(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        return dslTexts(path);
      }
      return entry.name.endsWith(".dsl") ? [readFileSync(path, "utf8")] : [];
    });
}

const TEXTS = dslTexts(FIXTURES);

/** mulberry32: a seeded generator, so a failing mutation reproduces from its seed. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const INSERTS = [
  "{",
  "}",
  '"',
  "\\",
  '"""',
  "\u0000",
  "\n",
  "\r\n",
  "\r",
  "/*",
  "*/",
  "//",
  " {",
  "\uFEFF",
  " ",
  "\\\n",
];

type Mutation = (text: string, random: () => number) => string;

function at(text: string, random: () => number): number {
  return Math.floor(random() * (text.length + 1));
}

function linesOf(text: string): string[] {
  return text.split("\n");
}

const MUTATORS: readonly Mutation[] = [
  (text, random) => text.slice(0, at(text, random)),
  (text, random) => {
    const start = at(text, random);
    const copy = text.slice(start, start + Math.floor(random() * 200));
    const where = at(text, random);
    return text.slice(0, where) + copy + text.slice(where);
  },
  (text, random) => {
    const where = at(text, random);
    return text.slice(0, where) + text.slice(where + 1);
  },
  (text, random) => {
    const lines = linesOf(text);
    const first = Math.floor(random() * lines.length);
    const second = Math.floor(random() * lines.length);
    [lines[first], lines[second]] = [lines[second] ?? "", lines[first] ?? ""];
    return lines.join("\n");
  },
  (text, random) => {
    const where = at(text, random);
    const insert = INSERTS[Math.floor(random() * INSERTS.length)] ?? "{";
    return text.slice(0, where) + insert + text.slice(where);
  },
  (text, random) => {
    const lines = linesOf(text);
    const where = Math.floor(random() * lines.length);
    lines[where] = `${lines[where] ?? ""}${INSERTS[Math.floor(random() * INSERTS.length)] ?? "\\"}`;
    return lines.join("\n");
  },
];

function mutate(seed: number): string {
  const random = generator(seed);
  let text = TEXTS[Math.floor(random() * TEXTS.length)] ?? "";
  const count = 1 + Math.floor(random() * 4);
  for (let step = 0; step < count; step += 1) {
    const mutator = MUTATORS[Math.floor(random() * MUTATORS.length)] ?? MUTATORS[0];
    text = mutator ? mutator(text, random) : text;
  }
  return text;
}

function check(seed: number): { failure: string | undefined; diagnosed: boolean } {
  const text = mutate(seed);
  try {
    const cst = parseCst(text);
    const problems = cstProblems(text, cst);
    return {
      failure: problems.length > 0 ? `seed ${seed}: ${problems.slice(0, 3).join("; ")}` : undefined,
      diagnosed: cst.syntaxDiagnostics.length > 0,
    };
  } catch (error) {
    return { failure: `seed ${seed}: throws ${String(error)}`, diagnosed: false };
  }
}

describe(`${MUTATIONS} seeded mutations of the fixtures`, () => {
  const perBatch = MUTATIONS / BATCHES;
  it.each(Array.from({ length: BATCHES }, (_, batch) => batch))(
    "batch %i: parses without throwing, prints back byte for byte, covers every line once",
    (batch) => {
      const failures: string[] = [];
      let diagnosed = 0;
      for (let seed = batch * perBatch + 1; seed <= (batch + 1) * perBatch; seed += 1) {
        const outcome = check(seed);
        if (outcome.failure) {
          failures.push(outcome.failure);
        }
        diagnosed += outcome.diagnosed ? 1 : 0;
      }
      expect(failures.slice(0, 5)).toEqual([]);
      // Most mutations break the structure; if they stopped doing so, the fuzz would test little.
      expect(diagnosed).toBeGreaterThan(perBatch / 4);
    },
    20_000,
  );
});
