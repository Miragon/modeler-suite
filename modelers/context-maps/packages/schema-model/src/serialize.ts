/**
 * Deterministic serialisation of the document model.
 *
 * Producing byte-stable JSON (sorted arrays, fixed key order, rounded
 * coordinates) makes context maps diff-friendly in version control and gives
 * stable share URLs / embedded payloads.
 */

import { DOCUMENT_VERSION } from "./types";
import type { BoundedContext, Position, Relationship, Size, CmDocument } from "./types";
import { CONTEXT_KEYS, DOCUMENT_KEYS, RELATIONSHIP_KEYS, withForeignFields } from "./foreign";

/** Round to 2 decimals to strip floating-point drift from drag operations. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function normPosition(p: Position): Position {
  return { x: round(p.x), y: round(p.y) };
}

function normSize(s: Size): Size {
  return { width: round(s.width), height: round(s.height) };
}

/** Drops undefined fields and applies a fixed key order to a context, its foreign keys last. */
function normContext(c: BoundedContext): BoundedContext {
  const out: BoundedContext = {
    id: c.id,
    label: c.label,
    position: normPosition(c.position),
    size: normSize(c.size),
  };
  if (c.subdomainType) out.subdomainType = c.subdomainType;
  if (c.team) out.team = c.team;
  if (c.description) out.description = c.description;
  if (c.fill) out.fill = c.fill;
  if (c.stroke) out.stroke = c.stroke;
  return withForeignFields(out, c, CONTEXT_KEYS);
}

function normRelationship(r: Relationship): Relationship {
  const out: Relationship = {
    id: r.id,
    from: r.from,
    to: r.to,
    pattern: r.pattern,
  };
  if (r.upstreamRoles?.length) out.upstreamRoles = [...r.upstreamRoles].sort();
  if (r.downstreamRoles?.length) out.downstreamRoles = [...r.downstreamRoles].sort();
  if (r.label) out.label = r.label;
  if (r.description) out.description = r.description;
  if (r.implementationTechnology) out.implementationTechnology = r.implementationTechnology;
  return withForeignFields(out, r, RELATIONSHIP_KEYS);
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Returns a canonicalised copy of a document (sorted, rounded, version-stamped). Keys this version
 * does not know follow the known keys of their object, sorted by name; their values stay as they
 * are.
 */
export function canonicalize(doc: CmDocument): CmDocument {
  return withForeignFields(
    {
      version: DOCUMENT_VERSION,
      title: doc.title,
      contexts: [...doc.contexts].map(normContext).sort(byId),
      relationships: [...doc.relationships].map(normRelationship).sort(byId),
    },
    doc,
    DOCUMENT_KEYS,
  );
}

/**
 * `JSON.stringify` writes an object or array that sits in several places at each of them. A value
 * of an unknown key that holds the level below twice would need memory doubling with every level,
 * and a wide one held a thousand times would need a thousand copies of it. So each time the
 * serializer would write a container again, it counts that container's entries; no real document
 * repeats this many. A document that shares nothing counts none, however large it is.
 */
const MAX_REPEATED_ENTRIES = 1_000_000;

/**
 * Throws before `JSON.stringify` writes `canonical` when its shared objects and arrays would repeat
 * more than {@link MAX_REPEATED_ENTRIES} entries. A value that contains itself is left to
 * `JSON.stringify`, which names the cycle.
 */
function refuseTooManyRepeatedEntries(canonical: CmDocument): void {
  // Only the containers on the current path: one object in several places is no cycle.
  const ancestors = new Set<object>();
  const writtenContainers = new WeakSet<object>();
  let repeatedEntries = 0;
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || ancestors.has(value)) return;
    if (writtenContainers.has(value)) {
      repeatedEntries += Array.isArray(value) ? value.length : Object.keys(value).length;
      if (repeatedEntries > MAX_REPEATED_ENTRIES) {
        throw new Error(
          `Cannot serialize a document whose shared objects and arrays would repeat more than ${MAX_REPEATED_ENTRIES} entries.`,
        );
      }
    } else {
      writtenContainers.add(value);
    }
    ancestors.add(value);
    for (const entry of Array.isArray(value) ? value : Object.values(value)) visit(entry);
    ancestors.delete(value);
  };
  visit(canonical);
}

/**
 * Serialises a document to deterministic, pretty-printed JSON. A value of an unknown key that sits
 * in several places is written at each of them, and its entries count at every place after the
 * first: past 1,000,000 such repeated entries it throws. A document that shares nothing has no
 * such limit.
 */
export function serializeDocument(doc: CmDocument, pretty = true): string {
  const canonical = canonicalize(doc);
  refuseTooManyRepeatedEntries(canonical);
  return JSON.stringify(canonical, null, pretty ? 2 : 0);
}

/**
 * The canonical text of a `.cm`/`.cm.json` file: the pretty-printed canonical JSON ending in one
 * line break, as editors (and `insertFinalNewline`) write text files. The text lane of the
 * collaborative-modeler contract.
 */
export function serializeDocumentText(doc: CmDocument): string {
  return `${serializeDocument(doc, true)}\n`;
}
