import type { ParseResult } from "@miragon/c4-dsl";
import type { ViewGeometry } from "@miragon/c4-layout";
import {
  groupKey,
  type AutoLayout,
  type Box,
  type ElementId,
  type FieldName,
  type ModelElement,
  type Point,
  type Size,
  type StoredLayout,
  type ViewCatalog,
  type ViewKey,
  type ViewMembers,
  type Workspace,
} from "@miragon/c4-schema-model";
import type { C4Engine } from "../engine/C4Engine.js";
import { legendRows } from "../legend/legendContent.js";
import type { SceneNotation } from "./notation.js";
import type { Scene, SceneBoundary, SceneElement, SceneGroup, SceneRelationship } from "./types.js";

/** What a draft or an implicit view is drawn with: `autoLayout tb 300 160` (SPEC 4.2, 4.3). */
export const DRAFT_AUTO_LAYOUT: AutoLayout = {
  rankDirection: "tb",
  rankSeparation: 300,
  nodeSeparation: 160,
  edgeSeparation: 50,
  vertices: false,
};

/** Fixed, so the content bounds do not depend on the fonts (SPEC 6.5). */
export const TITLE_HEIGHT = 62;
export const TITLE_MIN_WIDTH = 320;
/** SPEC 4.3: fixed, never measured. */
const LABEL_SIZE: Size = { width: 160, height: 48 };

const EMPTY_LAYOUT: StoredLayout = {
  elements: new Map(),
  relationships: new Map(),
  unmatched: [],
  malformed: [],
};

const FIELDS: readonly FieldName[] = [
  "name",
  "description",
  "technology",
  "metadata",
  "tags",
  "url",
];

/** What the canvas draws for `view` of `parse`: a pure function of the two (SPEC 6.1). */
export function buildSceneWith(
  parse: ParseResult,
  viewKey: ViewKey,
  engine: C4Engine,
  notation: SceneNotation,
): Scene {
  const { workspace } = parse;
  const catalog = engine.catalog(workspace);
  const view = catalog.resolve(viewKey) ?? catalog.defaultView();
  const members = engine.members(workspace, view);
  const elementsById = new Map(workspace.elements.map((element) => [element.id, element]));
  const relationshipsByKey = new Map(
    workspace.relationships.map((relationship) => [relationship.canvasKey, relationship]),
  );
  const stored = view.definition?.layout ?? EMPTY_LAYOUT;
  const memberElements = members.elements.flatMap((id) => elementsById.get(id) ?? []);
  const styles = new Map(
    memberElements.map((element) => [element.id, notation.elementStyle(element, workspace.styles)]),
  );
  const sizes = new Map<ElementId, Size>();
  for (const element of memberElements) {
    const style = styles.get(element.id);
    if (!style) continue;
    const box = stored.elements.get(element.id);
    const fallback = notation.defaultSize(style.shape);
    sizes.set(element.id, {
      width: box?.width ?? style.width ?? fallback.width,
      height: box?.height ?? style.height ?? fallback.height,
    });
  }
  const memberRelationships = members.relationships.flatMap(
    (key) => relationshipsByKey.get(key) ?? [],
  );
  const geometry = engine.layout({
    members,
    sizes,
    stored,
    autoLayout: view.state === "written" ? view.definition?.autoLayout : DRAFT_AUTO_LAYOUT,
    relationshipEnds: new Map(
      memberRelationships.map((relationship) => [
        relationship.canvasKey,
        { sourceId: relationship.sourceId, destinationId: relationship.destinationId },
      ]),
    ),
  });

  const elements = memberElements.flatMap((element): SceneElement[] => {
    const box = geometry.boxes.get(element.id);
    const style = styles.get(element.id);
    if (!box || !style) return [];
    return [
      {
        id: element.id,
        kind: element.kind,
        box,
        shape: style.shape,
        name: element.name,
        typeLine: notation.typeLine(element, workspace.terminology),
        description: element.description,
        technology: element.technology,
        style,
        editable: editableFields(element),
        drill: drillOf(element, catalog, workspace),
      },
    ];
  });
  const boundaries = boundariesOf(members, geometry, elementsById, workspace, notation);
  const groups = members.groups.flatMap((group): SceneGroup[] => {
    const key = groupKey(group.scopeId, group.path);
    const box = geometry.groups.get(key);
    if (!box) return [];
    const scope = group.scopeId === undefined ? {} : { scopeId: group.scopeId };
    return [{ key, path: group.path, ...scope, name: group.name, box, depth: group.depth }];
  });
  const boxes = new Map(elements.map((element) => [element.id, element.box]));
  const relationships = memberRelationships.flatMap((relationship): SceneRelationship[] => {
    const source = boxes.get(relationship.sourceId);
    const destination = boxes.get(relationship.destinationId);
    if (!source || !destination) return [];
    return [
      {
        canvasKey: relationship.canvasKey,
        key: relationship.key,
        sourceId: relationship.sourceId,
        destinationId: relationship.destinationId,
        vertices: geometry.vertices.get(relationship.canvasKey) ?? [],
        description: relationship.description,
        technology: relationship.technology,
        implied: relationship.implied,
        labelBox:
          geometry.labelBoxes.get(relationship.canvasKey) ?? labelBoxBetween(source, destination),
        style: notation.relationshipStyle(relationship, workspace.styles),
      },
    ];
  });
  const vertices = new Map(
    relationships.map((relationship) => [relationship.canvasKey, relationship.vertices]),
  );
  const drawn = [...elements.map(({ box }) => box), ...boundaries.map(({ box }) => box)];
  const title = {
    text: view.title,
    description: view.definition?.description ?? "",
    box: titleBox(geometry.title, drawn),
  };
  const scene: Scene = {
    view,
    title,
    boundaries,
    groups,
    elements,
    relationships,
    boxes,
    vertices,
    contentBounds:
      drawn.length === 0
        ? undefined
        : unionOf([
            ...drawn,
            ...groups.map(({ box }) => box),
            ...relationships.flatMap(({ vertices: points, labelBox }) => [
              labelBox,
              ...points.map(pointBox),
            ]),
            title.box,
          ]),
    legend: [],
  };
  // The legend reads the scene it describes, so it never drifts from what the canvas draws.
  return { ...scene, legend: legendRows(scene) };
}

function editableFields(element: ModelElement): Readonly<Record<FieldName, boolean>> {
  return Object.fromEntries(
    FIELDS.map((field) => [field, element.fields[field].editable]),
  ) as Record<FieldName, boolean>;
}

function drillOf(
  element: ModelElement,
  catalog: ViewCatalog,
  workspace: Workspace,
): SceneElement["drill"] {
  if (element.kind !== "softwareSystem" && element.kind !== "container") return undefined;
  const target = catalog.childOf(element.id);
  if (!target) return undefined;
  const childCount = workspace.elements.filter((child) => child.parentId === element.id).length;
  return { target: target.key, childCount };
}

function boundariesOf(
  members: ViewMembers,
  geometry: ViewGeometry,
  elementsById: ReadonlyMap<ElementId, ModelElement>,
  workspace: Workspace,
  notation: SceneNotation,
): SceneBoundary[] {
  return members.boundaries.flatMap((boundary): SceneBoundary[] => {
    const element = elementsById.get(boundary.elementId);
    const box = geometry.boundaries.get(boundary.elementId);
    if (!element || !box) return [];
    if (element.kind !== "softwareSystem" && element.kind !== "container") return [];
    return [
      {
        id: element.id,
        box,
        name: element.name,
        typeLine: notation.typeLine(element, workspace.terminology),
        style: notation.boundaryStyle(element.kind, workspace.styles),
        depth: boundary.depth,
      },
    ];
  });
}

/** At the layout's anchor, as wide as the content and at least `TITLE_MIN_WIDTH`. */
function titleBox(anchor: Point, drawn: readonly Box[]): Box {
  const content = drawn.length === 0 ? undefined : unionOf(drawn);
  return {
    x: anchor.x,
    y: anchor.y,
    width: Math.max(TITLE_MIN_WIDTH, content?.width ?? 0),
    height: TITLE_HEIGHT,
  };
}

function labelBoxBetween(source: Box, destination: Box): Box {
  const x = (source.x + source.width / 2 + destination.x + destination.width / 2) / 2;
  const y = (source.y + source.height / 2 + destination.y + destination.height / 2) / 2;
  return { x: x - LABEL_SIZE.width / 2, y: y - LABEL_SIZE.height / 2, ...LABEL_SIZE };
}

function pointBox(point: Point): Box {
  return { x: point.x, y: point.y, width: 0, height: 0 };
}

export function unionOf(boxes: readonly Box[]): Box {
  const left = Math.min(...boxes.map(({ x }) => x));
  const top = Math.min(...boxes.map(({ y }) => y));
  const right = Math.max(...boxes.map(({ x, width }) => x + width));
  const bottom = Math.max(...boxes.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
