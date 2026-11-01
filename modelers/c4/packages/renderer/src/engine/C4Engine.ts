/*
 * The renderer's one seam to the DOM-free packages (SPEC 1.2): the WP6 spike runs on a fake
 * engine before the parser and the edit layer land, and every browser test can swap it. Frozen
 * interface: a change goes to every work package that depends on it.
 */
import {
  applyEdit,
  applyTextEdits,
  parseWorkspace,
  type C4Edit,
  type EditContext,
  type EditOutcome,
  type ParseResult,
  type TextEdit,
} from "@miragon/c4-dsl";
import {
  layoutView,
  viewFrames,
  type LayoutInput,
  type ViewFrames,
  type ViewGeometry,
} from "@miragon/c4-layout";
import {
  sameDigest,
  semanticDigest,
  viewCatalog,
  viewMembers,
  type Box,
  type ElementId,
  type FieldSource,
  type ViewCatalog,
  type ViewEntry,
  type ViewMembers,
  type Workspace,
} from "@miragon/c4-schema-model";

export interface C4Engine {
  parse(text: string): ParseResult;
  applyEdit(document: ParseResult, edit: C4Edit, context: EditContext): EditOutcome;
  applyTextEdits(text: string, edits: readonly TextEdit[]): string;
  /**
   * Two importable parses the canvas draws alike: a formatting-only or comment-only difference
   * (SPEC 1.7 rebase). Equal semantic digests are not enough: the digest of the edit layer's frame
   * condition leaves out implied relationships, cascaded tags, terminology and the elements'
   * order, and a rebase must leave the canvas equal to a fresh import (SPEC 1.1, 9.4). A parse
   * that rejects equals nothing, so a rebase never stores a text the import would refuse.
   */
  semanticallyEqual(left: ParseResult, right: ParseResult): boolean;
  catalog(workspace: Workspace): ViewCatalog;
  members(workspace: Workspace, view: ViewEntry): ViewMembers;
  layout(input: LayoutInput): ViewGeometry;
  /**
   * The boundary and group frames around `boxes`, without a layout: what a drag previews on every
   * pointer move. A boundary that frames nothing drawn keeps its box from `leafBoundaries`.
   */
  frames(
    members: ViewMembers,
    boxes: ReadonlyMap<ElementId, Box>,
    leafBoundaries?: ReadonlyMap<ElementId, Box>,
  ): ViewFrames;
}

/** The real engine; the renderer registers it as `c4Engine: ["value", createC4Engine()]`. */
export function createC4Engine(): C4Engine {
  return {
    parse: parseWorkspace,
    applyEdit,
    applyTextEdits,
    semanticallyEqual: (left, right) =>
      left.ok &&
      right.ok &&
      sameDigest(semanticDigest(left.workspace), semanticDigest(right.workspace)) &&
      samePlainData(
        withoutSourcePositions(left.workspace),
        withoutSourcePositions(right.workspace),
      ),
    catalog: viewCatalog,
    members: viewMembers,
    layout: layoutView,
    frames: viewFrames,
  };
}

/** Statement and token indices shift with a line added above; editability shows in the inspector. */
function withoutSourcePositions(workspace: Workspace): unknown {
  return {
    ...workspace,
    elements: workspace.elements.map((element) => ({
      ...element,
      fields: fieldsWithoutPositions(element.fields),
    })),
    relationships: workspace.relationships.map((relationship) => ({
      ...relationship,
      fields: fieldsWithoutPositions(relationship.fields),
    })),
  };
}

function fieldsWithoutPositions(fields: Readonly<Record<string, FieldSource>>): unknown {
  return Object.fromEntries(
    Object.entries(fields).map(([name, { form, editable, reason }]) => [
      name,
      { form, editable, reason },
    ]),
  );
}

/** Deep equality of the parser's plain data; maps and sets compare in insertion order. */
function samePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Map || left instanceof Set) {
    return (
      right instanceof left.constructor &&
      left.size === (right as typeof left).size &&
      samePlainData([...left], [...(right as typeof left)])
    );
  }
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => samePlainData(item, right[index]))
    );
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (Array.isArray(right) || right instanceof Map || right instanceof Set) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every(
      (key) => Object.hasOwn(rightRecord, key) && samePlainData(leftRecord[key], rightRecord[key]),
    )
  );
}
