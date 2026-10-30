/**
 * Fields a document carries that this modeler does not know, such as a vendor's `"x-vendor"` on a
 * team. They are kept through open and save, written after the known fields and sorted, so another
 * tool's data survives an edit in the modeler and the output stays deterministic.
 */

import { appendForeignFields, canonicalCopier, copyForeignFields } from "./canonical-copy";

export const DOCUMENT_FIELDS = [
  "version",
  "title",
  "nodes",
  "interactions",
  "flows",
  "annotations",
] as const;
export const TEAM_NODE_FIELDS = [
  "id",
  "type",
  "label",
  "description",
  "position",
  "size",
  "fill",
  "stroke",
] as const;
export const INTERACTION_FIELDS = [
  "id",
  "mode",
  "label",
  "position",
  "size",
  "fill",
  "stroke",
] as const;
export const FLOW_FIELDS = ["id", "label", "position", "size"] as const;
export const ANNOTATION_FIELDS = ["id", "text", "position", "size", "attachedTo"] as const;

/** Unknown fields by name, sorted, with their values in canonical form. */
export type ForeignFields = Readonly<Record<string, unknown>>;

/**
 * The fields of `value` outside `knownFields`, or undefined when there are none. A value that
 * sits in several places of `value` is copied at each of them; past 1,000,000 entries repeated
 * that way it throws, and so does a value that contains itself.
 */
export function foreignFields(
  value: object,
  knownFields: readonly string[],
): ForeignFields | undefined {
  return copyForeignFields(value, knownFields, canonicalCopier());
}

/**
 * `known` followed by the foreign fields of `source`. Built from entries, never by assignment, so
 * a field named `__proto__` stays a field instead of replacing the prototype. A value that sits in
 * several places of `source` is copied at each of them; past 1,000,000 entries repeated that way
 * it throws, and so does a value that contains itself.
 */
export function withForeignFields<T extends object>(
  known: T,
  source: object | undefined,
  knownFields: readonly string[],
): T {
  return appendForeignFields(known, source, knownFields, canonicalCopier());
}
