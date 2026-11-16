/**
 * Which files of a repository the suite's modelers show, as plain data without an import: a VS
 * Code extension host reads it in Node, where no renderer loads. `notation` is the `meta.notation`
 * of the renderer's contract. `.dsl` (C4) and the `.png` editors are left out until it is decided
 * whether a board shows them.
 */
export interface SuiteSuffixes {
  readonly notation: string;
  /** Beside a node's title. */
  readonly kind: string;
  /** With the dot, lower case. */
  readonly suffixes: readonly string[];
}

export const SUITE_SUFFIXES: readonly SuiteSuffixes[] = [
  { notation: "wardley", kind: "Wardley Map", suffixes: [".wmap", ".owm"] },
  { notation: "event-storming", kind: "Event Storming", suffixes: [".storm"] },
  { notation: "team-topologies", kind: "Team Topology", suffixes: [".tt", ".ttm.json"] },
  { notation: "context-maps", kind: "Context Map", suffixes: [".cm", ".cm.json"] },
  { notation: "value-chain", kind: "Value Chain", suffixes: [".vc", ".vc.json"] },
  { notation: "c4", kind: "C4 model", suffixes: [".c4"] },
  { notation: "business-model-canvas", kind: "Business Model Canvas", suffixes: [".bmc"] },
];
