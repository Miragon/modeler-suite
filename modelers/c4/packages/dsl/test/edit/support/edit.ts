import type { Box, ElementId, Point, ViewKey } from "@miragon/c4-schema-model";
import { viewCatalog } from "@miragon/c4-schema-model";
import { applyEdit, applyTextEdits } from "../../../src/edit/apply.js";
import { parseWorkspace } from "../../../src/parse.js";
import type { C4Edit, EditContext, EditOutcome, ParseResult } from "../../../src/types.js";

/** A seeded generator of the 4-character suffixes `EditContext.random` hands out. */
export function seededRandom(seed: number): () => string {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  return () => Array.from({ length: 4 }, () => alphabet[next() % alphabet.length]).join("");
}

export interface ContextOptions {
  readonly view?: ViewKey;
  readonly boxes?: ReadonlyMap<ElementId, Box> | Readonly<Record<ElementId, Box>>;
  readonly vertices?: ReadonlyMap<string, readonly Point[]>;
  readonly fresh?: Iterable<ElementId>;
  readonly identifiers?: "readable" | "collision-free";
  readonly seed?: number;
}

export function contextFor(document: ParseResult, options: ContextOptions = {}): EditContext {
  const boxes =
    options.boxes instanceof Map
      ? options.boxes
      : new Map(Object.entries((options.boxes as Record<ElementId, Box> | undefined) ?? {}));
  return {
    view: options.view ?? viewCatalog(document.workspace).defaultView().key,
    boxes,
    vertices: options.vertices ?? new Map(),
    fresh: new Set(options.fresh ?? []),
    identifiers: options.identifiers ?? "readable",
    random: seededRandom(options.seed ?? 7),
  };
}

export function edit(text: string, change: C4Edit, options: ContextOptions = {}): EditOutcome {
  const document = parseWorkspace(text);
  return applyEdit(document, change, contextFor(document, options));
}

/** The outcome's text, failing with the refusal when the edit was refused. */
export function edited(text: string, change: C4Edit, options: ContextOptions = {}): string {
  const outcome = edit(text, change, options);
  if (!outcome.ok) {
    const detail = (outcome as { detail?: string }).detail;
    throw new Error(
      `refused: ${outcome.reason}: ${outcome.message}${detail ? ` (${detail})` : ""}`,
    );
  }
  if (applyTextEdits(text, outcome.edits) !== outcome.text)
    throw new Error("edits don't produce the text");
  if (applyTextEdits(outcome.text, outcome.inverse) !== text)
    throw new Error("the inverse doesn't restore the text");
  return outcome.text;
}

export { parseWorkspace };

/** A DSL text from an indented template literal: the common indentation and the first line break go. */
export function dsl(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  const raw = strings.reduce(
    (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
    "",
  );
  const lines = raw
    .replace(/^\n/, "")
    .replace(/\n[ \t]*$/, "\n")
    .split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^[ ]*/.exec(line)?.[0].length ?? 0);
  const cut = Math.min(...indents);
  return lines.map((line) => line.slice(cut)).join("\n");
}

export function box(x: number, y: number, width = 240, height = 160): Box {
  return { x, y, width, height };
}
