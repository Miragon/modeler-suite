/**
 * A board as a live document: one Y.Map per element under one Y.Map of all elements, and a flat
 * Y.Map of the document's own values. Two people who change two elements at the same time, or two
 * attributes of one element, both keep their change. The shape and the two keys are designIQ's
 * element-wise live document, so a host that shares such a document hands it in as it is.
 */
import type { BoardSnapshot } from "@miragon/board-schema-model";
import * as Y from "yjs";

/** element id to its attributes, each a Y.Map */
export const ELEMENTS_KEY = "elements";
/** the document's own values (the title) */
export const META_KEY = "meta";

export const elementsOf = (doc: Y.Doc): Y.Map<Y.Map<unknown>> => doc.getMap(ELEMENTS_KEY);
export const metaOf = (doc: Y.Doc): Y.Map<unknown> => doc.getMap(META_KEY);

/** the document's content as plain data */
export function readSnapshot(doc: Y.Doc): BoardSnapshot {
  // null prototype: an element id like "__proto__" is an own key, never a prototype assignment
  const elements = Object.create(null) as BoardSnapshot["elements"];
  elementsOf(doc).forEach((attrs, id) => {
    elements[id] = attrs instanceof Y.Map ? (attrs.toJSON() as Record<string, unknown>) : {};
  });
  return { elements: { ...elements }, meta: metaOf(doc).toJSON() as Record<string, unknown> };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

function reconcileMap(target: Y.Map<unknown>, next: Record<string, unknown>): void {
  for (const key of [...target.keys()]) {
    if (!Object.hasOwn(next, key)) target.delete(key);
  }
  for (const [key, value] of Object.entries(next)) {
    if (!target.has(key) || !sameValue(target.get(key), value)) target.set(key, value);
  }
}

/**
 * Brings the document to `next` in one transaction and touches only what differs: an element or
 * an attribute that is the same stays as it is, so whatever a peer changes there meanwhile is
 * kept. For a seed and for a whole-board write (an import of the file's text).
 */
export function reconcileSnapshot(doc: Y.Doc, next: BoardSnapshot, origin?: unknown): void {
  doc.transact(() => {
    const elements = elementsOf(doc);
    // Object.hasOwn, not `in`: an element named after a member of Object.prototype stays deletable
    for (const id of [...elements.keys()]) {
      if (!Object.hasOwn(next.elements, id)) elements.delete(id);
    }
    for (const [id, attrs] of Object.entries(next.elements)) {
      let target = elements.get(id);
      if (!(target instanceof Y.Map)) {
        target = new Y.Map();
        elements.set(id, target);
      }
      reconcileMap(target, attrs);
    }
    reconcileMap(metaOf(doc), next.meta);
  }, origin);
}
