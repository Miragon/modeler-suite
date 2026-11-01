import type { Injector } from "didi";
import type { Box, ElementKind, ResolvedElementStyle } from "@miragon/c4-schema-model";
import type { C4SceneService } from "../services.js";
import {
  c4ReferenceOf,
  type C4PreviewReference,
  type Scene,
  type SceneBoundary,
  type SceneElement,
  type SceneRelationship,
} from "../scene/types.js";

interface SceneIndex {
  readonly elements: ReadonlyMap<string, SceneElement>;
  readonly boundaries: ReadonlyMap<string, SceneBoundary>;
  readonly relationships: ReadonlyMap<string, SceneRelationship>;
}

const indexes = new WeakMap<Scene, SceneIndex>();

function indexOf(scene: Scene): SceneIndex {
  let index = indexes.get(scene);
  if (!index) {
    index = {
      elements: new Map(scene.elements.map((element) => [element.id, element])),
      boundaries: new Map(scene.boundaries.map((boundary) => [boundary.id, boundary])),
      relationships: new Map(scene.relationships.map((item) => [item.canvasKey, item])),
    };
    indexes.set(scene, index);
  }
  return index;
}

interface Bounded {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function boxOf(shape: Bounded): Box {
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The kind's words for a preview, which the scene has not resolved a type line for yet. */
export const KIND_LABELS: Readonly<Record<ElementKind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  custom: "Element",
};

/** The default look (SPEC 6.4): roles only, a 2-unit outline. */
export function defaultElementStyle(shape: ResolvedElementStyle["shape"]): ResolvedElementStyle {
  return {
    shape,
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
  };
}

/**
 * What a palette or harness preview draws: the kind's default shape (a person, the Database entry's
 * cylinder, a box) with its name and type line, in the default look.
 */
export function previewElement(id: string, box: Box, reference: C4PreviewReference): SceneElement {
  const shape =
    reference.kind === "person"
      ? "Person"
      : reference.tags?.includes("Database")
        ? "Cylinder"
        : "Box";
  const label = KIND_LABELS[reference.kind];
  return {
    id,
    kind: reference.kind,
    box,
    shape,
    name: reference.name ?? label,
    typeLine: `[${label}]`,
    description: "",
    technology: "",
    style: defaultElementStyle(shape),
    editable: {
      name: false,
      description: false,
      technology: false,
      metadata: false,
      tags: false,
      url: false,
    },
    drill: undefined,
  };
}

/**
 * The scene item a canvas element draws. A shape carries a reference only (SPEC 1.1); its content
 * comes from the current scene, with the shape's own box, so a drawing always matches its shape.
 */
export default class SceneLookup {
  static $inject = ["injector"];

  constructor(private readonly injector: Injector) {}

  scene(): Scene | undefined {
    return this.injector.get<C4SceneService>("c4Scene", false)?.current() ?? undefined;
  }

  element(shape: Bounded & { id: string }): SceneElement | undefined {
    const reference = c4ReferenceOf(shape);
    if (reference?.role === "preview") return previewElement(shape.id, boxOf(shape), reference);
    if (reference?.role !== "element") return undefined;
    const scene = this.scene();
    const element = scene && indexOf(scene).elements.get(reference.id);
    if (!element) return undefined;
    const box = boxOf(shape);
    return sameBox(element.box, box) ? element : { ...element, box };
  }

  boundary(shape: Bounded): SceneBoundary | undefined {
    const reference = c4ReferenceOf(shape);
    if (reference?.role !== "boundary") return undefined;
    const scene = this.scene();
    const boundary = scene && indexOf(scene).boundaries.get(reference.id);
    if (!boundary) return undefined;
    const box = boxOf(shape);
    return sameBox(boundary.box, box) ? boundary : { ...boundary, box };
  }

  relationship(connection: unknown): SceneRelationship | undefined {
    const reference = c4ReferenceOf(connection);
    if (reference?.role !== "relationship") return undefined;
    const scene = this.scene();
    return scene && indexOf(scene).relationships.get(reference.key);
  }
}
