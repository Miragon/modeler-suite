/*
 * What the canvas draws for one view (SPEC 6.1) and the reference a diagram-js element carries
 * (SPEC 1.1). Frozen interface: a change goes to every work package that depends on it. The scene's
 * entry `buildScene` lives in `buildScene.ts`: the drawing and the legend, which the build uses,
 * import these types.
 */
import type { Connection, Shape } from "diagram-js/lib/model/Types";
import type { CreatableKind } from "@miragon/c4-dsl";
import type {
  Box,
  ElementId,
  ElementKind,
  FieldName,
  Point,
  RelationshipKey,
  ResolvedBoundaryStyle,
  ResolvedElementStyle,
  ResolvedRelationshipStyle,
  ShapeName,
  ViewEntry,
  ViewKey,
} from "@miragon/c4-schema-model";

export interface SceneElement {
  readonly id: ElementId;
  readonly kind: ElementKind;
  readonly box: Box;
  readonly shape: ShapeName;
  readonly name: string;
  readonly typeLine: string;
  readonly description: string;
  readonly technology: string;
  readonly style: ResolvedElementStyle;
  readonly editable: Readonly<Record<FieldName, boolean>>;
  readonly drill: { readonly target: ViewKey; readonly childCount: number } | undefined;
}

export interface SceneBoundary {
  readonly id: ElementId;
  readonly box: Box;
  readonly name: string;
  readonly typeLine: string;
  readonly style: ResolvedBoundaryStyle;
  readonly depth: number;
}

export interface SceneGroup {
  /** `groupKey(scopeId, path)`: a model-level group and a system's group may share a path. */
  readonly key: string;
  readonly path: string;
  /** The element whose block holds the group; absent at model level. */
  readonly scopeId?: ElementId;
  readonly name: string;
  readonly box: Box;
  readonly depth: number;
}

export interface SceneRelationship {
  readonly canvasKey: string;
  readonly key: RelationshipKey | undefined;
  readonly sourceId: ElementId;
  readonly destinationId: ElementId;
  /** The stored vertices: what an edit writes back. */
  readonly vertices: readonly Point[];
  /**
   * What the line is drawn through: `vertices`, or the bend that fans it out from the other lines
   * of its pair (the layout's `routes`), which no edit ever writes.
   */
  readonly route: readonly Point[];
  readonly description: string;
  readonly technology: string;
  readonly implied: boolean;
  /** The layout's fixed slot; the drawn label may grow past it to `LABEL_REACH`, centred. */
  readonly labelBox: Box;
  readonly style: ResolvedRelationshipStyle;
}

/** One row of the legend (SPEC 6.6); `label` is the contributing tags without `Element`. */
export type LegendRow =
  | {
      readonly kind: "element";
      readonly label: string;
      readonly shape: ShapeName;
      readonly style: ResolvedElementStyle;
    }
  | { readonly kind: "boundary"; readonly label: string; readonly style: ResolvedBoundaryStyle }
  | { readonly kind: "group"; readonly label: string }
  | {
      readonly kind: "relationship";
      readonly label: string;
      readonly style: ResolvedRelationshipStyle;
    };

export interface Scene {
  readonly view: ViewEntry;
  readonly title: { readonly text: string; readonly description: string; readonly box: Box };
  readonly boundaries: readonly SceneBoundary[];
  readonly groups: readonly SceneGroup[];
  readonly elements: readonly SceneElement[];
  readonly relationships: readonly SceneRelationship[];
  readonly boxes: ReadonlyMap<ElementId, Box>;
  readonly vertices: ReadonlyMap<string, readonly Point[]>;
  readonly contentBounds: Box | undefined;
  readonly legend: readonly LegendRow[];
}

/**
 * The `c4` property of a diagram-js element: a reference into the document, never its content.
 * Not `label`, which diagram-js reserves for an element's external label. The reconciler updates
 * `id` and `key` in place when an identifier is written (SPEC 1.5 step 1).
 */
export interface C4ElementReference {
  role: "element" | "boundary";
  id: ElementId;
}

/** `key` is the relationship's canvas key. */
export interface C4RelationshipReference {
  role: "relationship";
  key: RelationshipKey;
  implied: boolean;
}

/** A palette or harness preview, which the reconciler never registers (`preview:<n>`). */
export interface C4PreviewReference {
  readonly role: "preview";
  readonly kind: CreatableKind;
  readonly name?: string;
  readonly tags?: readonly string[];
}

/**
 * The line diagram-js draws while a connect or a bendpoint drag runs. The rules answer it as the
 * connection's attributes, since diagram-js draws the preview of whatever the rule returns.
 */
export interface C4RelationshipPreviewReference {
  readonly role: "relationshipPreview";
}

export const RELATIONSHIP_PREVIEW: { readonly c4: C4RelationshipPreviewReference } = Object.freeze({
  c4: Object.freeze({ role: "relationshipPreview" }),
});

export type C4Reference =
  | C4ElementReference
  | C4RelationshipReference
  | C4PreviewReference
  | C4RelationshipPreviewReference;

export type C4Shape = Shape & { c4: C4ElementReference | C4PreviewReference };
export type C4ElementShape = Shape & { c4: C4ElementReference & { role: "element" } };
export type C4BoundaryShape = Shape & { c4: C4ElementReference & { role: "boundary" } };
export type C4Connection = Connection & { c4: C4RelationshipReference };

/** The reference an element of the canvas carries, if it is one of the notation's. */
export function c4ReferenceOf(element: unknown): C4Reference | undefined {
  if (typeof element !== "object" || element === null) return undefined;
  const reference = (element as { c4?: unknown }).c4;
  if (typeof reference !== "object" || reference === null) return undefined;
  const role = (reference as { role?: unknown }).role;
  return role === "element" ||
    role === "boundary" ||
    role === "relationship" ||
    role === "preview" ||
    role === "relationshipPreview"
    ? (reference as C4Reference)
    : undefined;
}

export function isRelationshipPreview(element: unknown): boolean {
  return c4ReferenceOf(element)?.role === "relationshipPreview";
}

export function isElementShape(element: unknown): element is C4ElementShape {
  return c4ReferenceOf(element)?.role === "element";
}

export function isBoundaryShape(element: unknown): element is C4BoundaryShape {
  return c4ReferenceOf(element)?.role === "boundary";
}

export function isRelationshipConnection(element: unknown): element is C4Connection {
  return c4ReferenceOf(element)?.role === "relationship";
}
