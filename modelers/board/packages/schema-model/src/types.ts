/**
 * What a board is made of. A board is a canvas of a repository's own files: models shown in
 * place, images, notes, groups, and arrows between them. It stores WHERE a file sits, never what
 * is in it: a model node holds the path of its model and nothing else.
 */

/** a point in board coordinates, or on screen where a function says so */
export interface Point {
  x: number;
  y: number;
}

/** an element's box in board coordinates */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NODE_TYPES = ["model", "text", "image", "group"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** the four sides of a node an arrow can leave or reach */
export const SIDES = ["top", "right", "bottom", "left"] as const;
export type Side = (typeof SIDES)[number];

// type aliases, not interfaces: an alias fits a snapshot's Record<string, unknown> as it is
export type NodeAttrs = {
  kind: "node";
  type: NodeType;
  /** relative to `parent` where set, else board coordinates; integers */
  x: number;
  y: number;
  width: number;
  height: number;
  /** element id of a group node */
  parent?: string;
  /** fractional index (fractionalIndexBetween): plain string order, ties broken by element id */
  z: string;
  /** model, image: repository-relative path of the file */
  file?: string;
  /** text: Markdown; group: its label */
  text?: string;
};

export type EdgeAttrs = {
  kind: "edge";
  source: string;
  target: string;
  sourceHandle?: Side;
  targetHandle?: Side;
  label?: string;
};

export type ElementAttrs = NodeAttrs | EdgeAttrs;

/**
 * A whole board as plain data: element id to its attributes (the id is not repeated inside
 * them) and the document's own values (the title). Attributes and element kinds a build does
 * not know are kept as they are: they stay in the document, off the canvas, and are written back.
 */
export interface BoardSnapshot {
  elements: Record<string, Record<string, unknown>>;
  meta: Record<string, unknown>;
}

export interface BoardNode {
  id: string;
  attrs: NodeAttrs;
  /** `attrs.parent` where that element exists, is a node and closes no cycle */
  parentId: string | undefined;
}

export interface BoardEdge {
  id: string;
  attrs: EdgeAttrs;
}

/** a board as a canvas draws it */
export interface BoardView {
  /** in z order, every parent before its children */
  nodes: readonly BoardNode[];
  edges: readonly BoardEdge[];
  meta: Readonly<Record<string, unknown>>;
}
