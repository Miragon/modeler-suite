import type { ElementId, Point, RelationshipKey, StoredBox } from "./types.js";

const ELEMENT_KEY_PREFIX = "c4modeler.element.";
const RELATIONSHIP_KEY_PREFIX = "c4modeler.relationship.";
const NUMBER = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * `"x,y"` or `"x,y,w,h"`, integers rounded half away from zero (SPEC 3.6). The size is written only
 * when both `width` and `height` are given: the caller leaves them out for the shape's default.
 */
export function encodeElementLayout(box: StoredBox): string {
  const corner = `${integer(box.x)},${integer(box.y)}`;
  if (box.width === undefined || box.height === undefined) return corner;
  return `${corner},${integer(box.width)},${integer(box.height)}`;
}

/** Undefined for a malformed value (SPEC 3.6: ignored with a warning, rewritten by the next edit). */
export function decodeElementLayout(value: string): StoredBox | undefined {
  const numbers = readNumbers(value, ",");
  if (numbers === undefined) return undefined;
  const [x, y, width, height] = numbers;
  if (x === undefined || y === undefined) return undefined;
  if (numbers.length === 2) return { x, y };
  if (numbers.length !== 4 || width === undefined || height === undefined) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/** `"x1,y1 x2,y2 …"`; no points is the empty string. */
export function encodeVertices(points: readonly Point[]): string {
  return points.map((point) => `${integer(point.x)},${integer(point.y)}`).join(" ");
}

/** Undefined for a malformed value; an empty value is a straight line. */
export function decodeVertices(value: string): Point[] | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return [];
  const points: Point[] = [];
  for (const pair of trimmed.split(/\s+/)) {
    const numbers = readNumbers(pair, ",");
    const [x, y] = numbers ?? [];
    if (numbers?.length !== 2 || x === undefined || y === undefined) return undefined;
    points.push({ x, y });
  }
  return points;
}

/** `c4modeler.element.<id>` */
export function elementLayoutKey(id: ElementId): string {
  return `${ELEMENT_KEY_PREFIX}${id}`;
}

/** `c4modeler.relationship.<key>` */
export function relationshipLayoutKey(key: RelationshipKey): string {
  return `${RELATIONSHIP_KEY_PREFIX}${key}`;
}

function integer(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

function readNumbers(value: string, separator: string): number[] | undefined {
  const parts = value.split(separator).map((part) => part.trim());
  if (parts.some((part) => !NUMBER.test(part))) return undefined;
  return parts.map((part) => integer(Number(part)));
}
