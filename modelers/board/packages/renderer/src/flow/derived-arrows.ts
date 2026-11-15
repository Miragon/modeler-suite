/**
 * Derived arrows: what the models on a board say about each other, as the host lists it
 * (`host.references`), drawn and never stored. The board parses no model: it maps the references
 * between files to the nodes that show those files.
 */
import type { BoardReference } from "../host/types.js";

/** an arrow between two NODES of a board, drawn and not stored */
export interface DerivedArrow {
  /** stable for the pair and the relation, so React Flow keeps the edge across recomputations */
  id: string;
  source: string;
  target: string;
  rel: string;
}

/** from every node of the calling file to every node of the called file, once per pair and relation */
export function derivedArrows(
  references: readonly BoardReference[],
  nodes: ReadonlyArray<{ id: string; file?: string | undefined }>,
): DerivedArrow[] {
  const arrows = new Map<string, DerivedArrow>();
  for (const ref of references) {
    for (const source of nodes) {
      if (source.file !== ref.from) continue;
      for (const target of nodes) {
        if (target.file !== ref.to) continue;
        const id = `derived:${ref.relation}:${source.id}:${target.id}`;
        arrows.set(id, { id, source: source.id, target: target.id, rel: ref.relation });
      }
    }
  }
  return [...arrows.values()];
}
