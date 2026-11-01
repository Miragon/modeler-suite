/**
 * The legend of the view on the canvas (SPEC 6.6, Structurizr's diagram key): one row per distinct
 * element look, per boundary kind, for the groups and per relationship look, read from the scene,
 * so it never drifts from what the canvas draws. DOM-free: `legendRows` is data, the previews are
 * markup strings, and `renderLegend` turns both into the shell's rows.
 */
import type { ElementKind } from "@miragon/c4-schema-model";
import {
  boundaryPreviewSvg,
  groupPreviewSvg,
  relationshipPreviewSvg,
  shapePreviewSvg,
} from "../draw/preview.js";
import type { Markup } from "../draw/markup.js";
import { drawnShape } from "../draw/shapes.js";
import type { LegendRow, Scene, SceneBoundary } from "../scene/types.js";

const KIND_WORDS: Readonly<Record<ElementKind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  custom: "Element",
};

function tagLabel(tags: readonly string[], without: string): string {
  return tags.filter((tag) => tag !== without).join(", ");
}

const OPENING_BRACKETS = new Set(["[", "(", "{", "<", "«"]);
const CLOSING_BRACKETS = new Set(["]", ")", "}", ">", "»"]);

/**
 * The text without its leading opening and trailing closing brackets. A scan, not a pattern:
 * `[…]+$` backtracks polynomially on a long run of brackets, and the text comes from the file.
 */
function withoutBrackets(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && OPENING_BRACKETS.has(text[start]!)) start += 1;
  while (end > start && CLOSING_BRACKETS.has(text[end - 1]!)) end -= 1;
  return text.slice(start, end);
}

/** "[Container: Java]" → "Container"; brackets of every `metadataSymbols` setting go. */
function typeWord(typeLine: string): string {
  const word = withoutBrackets(typeLine.trim()).split(":")[0]?.trim();
  return word === undefined || word === "" ? "Boundary" : word;
}

function boundaryLabel(boundary: SceneBoundary): string {
  return `${typeWord(boundary.typeLine)} boundary`;
}

/** The rows in reading order: elements, boundaries, groups, relationships, each by first use. */
export function legendRows(scene: Scene): LegendRow[] {
  const elementRows = new Map<
    string,
    { row: LegendRow & { kind: "element" }; kinds: Set<string> }
  >();
  for (const element of scene.elements) {
    const { style } = element;
    const tags = tagLabel(style.tags, "Element");
    const key = JSON.stringify([
      drawnShape(element.shape),
      style.fill,
      style.stroke,
      style.text,
      style.strokeWidth,
      style.border,
      tags,
    ]);
    const known = elementRows.get(key);
    if (known) {
      known.kinds.add(KIND_WORDS[element.kind]);
      continue;
    }
    elementRows.set(key, {
      row: { kind: "element", label: tags, shape: element.shape, style },
      kinds: new Set([KIND_WORDS[element.kind]]),
    });
  }

  const rows: LegendRow[] = [...elementRows.values()].map(({ row, kinds }) =>
    row.label === "" ? { ...row, label: [...kinds].join(", ") } : row,
  );

  const boundaryKeys = new Set<string>();
  for (const boundary of scene.boundaries) {
    const label = boundaryLabel(boundary);
    const { fill, stroke, text, strokeWidth, border } = boundary.style;
    const key = JSON.stringify([label, fill, stroke, text, strokeWidth, border]);
    if (boundaryKeys.has(key)) continue;
    boundaryKeys.add(key);
    rows.push({ kind: "boundary", label, style: boundary.style });
  }

  if (scene.groups.length > 0) rows.push({ kind: "group", label: "Group" });

  const relationshipKeys = new Set<string>();
  for (const relationship of scene.relationships) {
    const { style } = relationship;
    const label = ["Relationship", tagLabel(style.tags, "Relationship")].filter(Boolean).join(", ");
    const key = JSON.stringify([label, style.stroke, style.thickness, style.line]);
    if (relationshipKeys.has(key)) continue;
    relationshipKeys.add(key);
    rows.push({ kind: "relationship", label, style });
  }
  return rows;
}

/** The row's 24 px preview, the canvas's drawing in miniature. */
export function legendPreview(row: LegendRow): Markup {
  switch (row.kind) {
    case "element":
      return shapePreviewSvg(row.shape, row.style);
    case "boundary":
      return boundaryPreviewSvg(row.style);
    case "group":
      return groupPreviewSvg();
    case "relationship":
      return relationshipPreviewSvg(row.style);
  }
}
