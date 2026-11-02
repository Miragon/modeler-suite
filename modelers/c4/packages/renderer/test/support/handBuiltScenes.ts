/**
 * Hand-built scenes for the drawing's tests (SPEC 11.2 WP7): the drawing reads a `Scene` only, so
 * its tests need neither the parser nor the layout. DOM-free, for the unit and the browser tests.
 */
import {
  C4_COLOUR_STYLES,
  groupKey,
  type Box,
  type ElementKind,
  type Point,
  type ResolvedBoundaryStyle,
  type ResolvedElementStyle,
  type ResolvedRelationshipStyle,
  type ShapeName,
} from "@miragon/c4-schema-model";
import { labelReach } from "../../src/text/typography.js";
import type {
  Scene,
  SceneBoundary,
  SceneElement,
  SceneGroup,
  SceneRelationship,
} from "../../src/scene/types.js";

export const DEFAULT_SIZE: Readonly<Record<string, { width: number; height: number }>> = {
  Person: { width: 216, height: 216 },
  Hexagon: { width: 240, height: 208 },
  MobileDevicePortrait: { width: 160, height: 240 },
  Circle: { width: 208, height: 208 },
  Diamond: { width: 216, height: 216 },
};

export function elementStyle(overrides: Partial<ResolvedElementStyle> = {}): ResolvedElementStyle {
  return {
    shape: "Box",
    width: undefined,
    height: undefined,
    fill: undefined,
    stroke: undefined,
    text: undefined,
    strokeWidth: 2,
    border: "solid",
    metadata: true,
    description: true,
    tags: [],
    ...overrides,
  };
}

export function boundaryStyle(
  overrides: Partial<ResolvedBoundaryStyle> = {},
): ResolvedBoundaryStyle {
  return {
    fill: undefined,
    stroke: undefined,
    text: undefined,
    strokeWidth: 2,
    border: "dashed",
    tags: [],
    ...overrides,
  };
}

export function relationshipStyle(
  overrides: Partial<ResolvedRelationshipStyle> = {},
): ResolvedRelationshipStyle {
  return {
    stroke: undefined,
    text: undefined,
    thickness: 1.5,
    line: "dashed",
    routing: "direct",
    position: 50,
    metadata: true,
    description: true,
    tags: [],
    ...overrides,
  };
}

/** The "Apply C4 colours" look of a tag (SPEC 6.4), as the style cascade resolves it. */
export function c4Colours(tag: string): Partial<ResolvedElementStyle> {
  const style = C4_COLOUR_STYLES.find((candidate) => candidate.tag === tag);
  if (!style) throw new Error(`No C4 colour style for ${tag}.`);
  return {
    fill: style.background,
    stroke: style.stroke,
    text: style.color,
    tags: ["Element", tag],
  };
}

const TYPE_LINES: Readonly<Record<ElementKind, string>> = {
  person: "[Person]",
  softwareSystem: "[Software System]",
  container: "[Container]",
  component: "[Component]",
  custom: "[Element]",
};

export interface ElementSpec {
  readonly kind?: ElementKind;
  readonly shape?: ShapeName;
  readonly at?: Point;
  readonly size?: { width: number; height: number };
  readonly name?: string;
  readonly typeLine?: string;
  readonly description?: string;
  readonly technology?: string;
  readonly style?: Partial<ResolvedElementStyle>;
  readonly drill?: SceneElement["drill"];
}

export function element(id: string, spec: ElementSpec = {}): SceneElement {
  const kind = spec.kind ?? "softwareSystem";
  const shape = spec.shape ?? (kind === "person" ? "Person" : "Box");
  const size = spec.size ?? DEFAULT_SIZE[shape] ?? { width: 240, height: 160 };
  const technology = spec.technology ?? "";
  return {
    id,
    kind,
    box: { x: spec.at?.x ?? 0, y: spec.at?.y ?? 0, ...size },
    shape,
    name: spec.name ?? id,
    typeLine:
      spec.typeLine ??
      (technology !== "" && (kind === "container" || kind === "component")
        ? `[${kind === "container" ? "Container" : "Component"}: ${technology}]`
        : TYPE_LINES[kind]),
    description: spec.description ?? "",
    technology,
    style: elementStyle({ shape, ...spec.style }),
    editable: {
      name: true,
      description: true,
      technology: true,
      metadata: true,
      tags: true,
      url: true,
    },
    drill: spec.drill,
  };
}

export function boundary(
  id: string,
  box: Box,
  spec: {
    name?: string;
    typeLine?: string;
    style?: Partial<ResolvedBoundaryStyle>;
    depth?: number;
  } = {},
): SceneBoundary {
  return {
    id,
    box,
    name: spec.name ?? id,
    typeLine: spec.typeLine ?? "[Software System]",
    style: boundaryStyle(spec.style),
    depth: spec.depth ?? 0,
  };
}

export function group(path: string, box: Box, depth = 0): SceneGroup {
  return { key: groupKey(undefined, path), path, name: path.split("/").at(-1) ?? path, box, depth };
}

function centre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the line from the centre of `box` toward `toward` leaves the box. */
export function exitPoint(box: Box, toward: Point): Point {
  const from = centre(box);
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy),
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export const LABEL_SIZE = { width: 160, height: 48 } as const;

export function relationship(
  source: SceneElement,
  destination: SceneElement,
  spec: {
    description?: string;
    technology?: string;
    style?: Partial<ResolvedRelationshipStyle>;
    implied?: boolean;
    vertices?: readonly Point[];
  } = {},
): SceneRelationship {
  const key = `${source.id}->${destination.id}`;
  const vertices = spec.vertices ?? [];
  const path = [centre(source.box), ...vertices, centre(destination.box)];
  const middle = path[Math.floor((path.length - 1) / 2)]!;
  const next = path[Math.floor((path.length - 1) / 2) + 1]!;
  const anchor = { x: (middle.x + next.x) / 2, y: (middle.y + next.y) / 2 };
  return {
    canvasKey: key,
    key,
    sourceId: source.id,
    destinationId: destination.id,
    vertices,
    route: vertices,
    description: spec.description ?? "",
    technology: spec.technology ?? "",
    implied: spec.implied ?? false,
    labelBox: {
      x: anchor.x - LABEL_SIZE.width / 2,
      y: anchor.y - LABEL_SIZE.height / 2,
      ...LABEL_SIZE,
    },
    style: relationshipStyle(spec.style),
  };
}

/** The docked waypoints a relationship's connection carries (the layouter's job in the renderer). */
export function waypointsOf(scene: Scene, item: SceneRelationship): Point[] {
  const source = scene.boxes.get(item.sourceId)!;
  const destination = scene.boxes.get(item.destinationId)!;
  const first = item.route[0] ?? centre(destination);
  const last = item.route.at(-1) ?? centre(source);
  return [exitPoint(source, first), ...item.route, exitPoint(destination, last)];
}

function union(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface SceneSpec {
  readonly elements?: readonly SceneElement[];
  readonly boundaries?: readonly SceneBoundary[];
  readonly groups?: readonly SceneGroup[];
  readonly relationships?: readonly SceneRelationship[];
  readonly title?: string;
  readonly description?: string;
}

/** A landscape view of the given parts, its title block 32 below the lowest box (SPEC 4.3). */
export function scene(spec: SceneSpec): Scene {
  const elements = spec.elements ?? [];
  const boundaries = spec.boundaries ?? [];
  const groups = spec.groups ?? [];
  const relationships = spec.relationships ?? [];
  const frames = [
    ...elements.map((item) => item.box),
    ...boundaries.map((item) => item.box),
    ...groups.map((item) => item.box),
  ];
  const drawn = union(frames);
  const titleBox = {
    x: drawn?.x ?? 0,
    y: (drawn ? drawn.y + drawn.height : 0) + 32,
    width: Math.max(320, drawn?.width ?? 0),
    height: 62,
  };
  const content = union([
    ...frames,
    ...relationships.flatMap((item) => [
      item.labelBox,
      ...(item.description.trim() !== "" || item.technology.trim() !== ""
        ? [labelReach(item.labelBox)]
        : []),
      ...item.route.map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
    ]),
    ...(elements.length + boundaries.length > 0 ? [titleBox] : []),
  ]);
  return {
    view: {
      key: "Landscape",
      state: "written",
      type: "systemLandscape",
      scopeId: undefined,
      editable: true,
      title: spec.title ?? "System Landscape diagram",
      definition: undefined,
    },
    title: {
      text: spec.title ?? "System Landscape diagram",
      description: spec.description ?? "",
      box: titleBox,
    },
    boundaries,
    groups,
    elements,
    relationships,
    boxes: new Map(elements.map((item) => [item.id, item.box])),
    vertices: new Map(relationships.map((item) => [item.canvasKey, item.vertices])),
    contentBounds: content,
    legend: [],
  };
}

/** Every shape of SPEC 6.2 once, in a grid, each with a name, a type line and a description. */
export const EVERY_SHAPE: readonly ShapeName[] = [
  "Box",
  "RoundedBox",
  "Person",
  "Cylinder",
  "Pipe",
  "WebBrowser",
  "Window",
  "MobileDevicePortrait",
  "MobileDeviceLandscape",
  "Hexagon",
  "Folder",
  "Component",
  "Ellipse",
  "Circle",
  "Diamond",
  "Robot",
  "Bucket",
  "Terminal",
  "Shell",
];

export const LONG_DESCRIPTION =
  "Allows customers to view information about their bank accounts, and make payments, " +
  "from any device they happen to have at hand, at any time of the day or night.";
