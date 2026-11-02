import {
  defaultShape,
  defaultSize,
  resolveBoundaryStyle,
  resolveElementStyle,
  resolveRelationshipStyle,
  typeLine,
  type ElementKind,
  type ModelElement,
  type Relationship,
  type ResolvedBoundaryStyle,
  type ResolvedElementStyle,
  type ResolvedRelationshipStyle,
  type ShapeName,
  type Size,
  type Styles,
  type Terminology,
} from "@miragon/c4-schema-model";

/**
 * What the scene takes from the notation besides the engine: styles, type lines and default
 * sizes. A service of its own (`c4Notation`), so a browser test on a fake engine draws without
 * the schema model's cascade.
 */
export interface SceneNotation {
  elementStyle(element: ModelElement, styles: Styles): ResolvedElementStyle;
  relationshipStyle(relationship: Relationship, styles: Styles): ResolvedRelationshipStyle;
  boundaryStyle(
    kind: Extract<ElementKind, "softwareSystem" | "container">,
    styles: Styles,
  ): ResolvedBoundaryStyle;
  typeLine(element: ModelElement, terminology: Terminology): string;
  defaultShape(kind: ElementKind): ShapeName;
  defaultSize(shape: ShapeName): Size;
}

export const schemaModelNotation: SceneNotation = {
  elementStyle: resolveElementStyle,
  relationshipStyle: resolveRelationshipStyle,
  boundaryStyle: resolveBoundaryStyle,
  typeLine,
  defaultShape,
  defaultSize,
};
