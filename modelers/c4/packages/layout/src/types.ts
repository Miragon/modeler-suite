/*
 * The input and result of laying out one static view (SPEC 4.3). Frozen interface: a change goes
 * to every work package that depends on it.
 */
import type {
  AutoLayout,
  Box,
  ElementId,
  Point,
  Size,
  StoredLayout,
  ViewMembers,
} from "@miragon/c4-schema-model";

export interface LayoutInput {
  readonly members: ViewMembers;
  /** The stored `w,h`, else the style's width and height × 8/15, else the shape's default (SPEC 6.2). */
  readonly sizes: ReadonlyMap<ElementId, Size>;
  readonly stored: StoredLayout;
  /** Drafts and implicit views: tb, 300, 160, 50 (the values `NEW_VIEW_AUTO_LAYOUT` writes). */
  readonly autoLayout: AutoLayout | undefined;
  readonly relationshipEnds: ReadonlyMap<
    string,
    { readonly sourceId: ElementId; readonly destinationId: ElementId }
  >;
}

export interface ViewGeometry {
  readonly boxes: ReadonlyMap<ElementId, Box>;
  /** The elements with a stored box. */
  readonly placed: ReadonlySet<ElementId>;
  readonly vertices: ReadonlyMap<string, readonly Point[]>;
  readonly boundaries: ReadonlyMap<ElementId, Box>;
  /** By `groupKey(scopeId, path)`, as two scopes may hold a group of one name. */
  readonly groups: ReadonlyMap<string, Box>;
  /** Fixed 160 × 48 at the label anchor, never measured. */
  readonly labelBoxes: ReadonlyMap<string, Box>;
  /** The top-left corner of the title block. */
  readonly title: Point;
  readonly mode: "auto" | "stored" | "mixed";
}
