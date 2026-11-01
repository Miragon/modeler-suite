import type { Injector } from "didi";
import type { CreatableKind } from "@miragon/c4-dsl";
import {
  C4_COLOUR_STYLES,
  type Box,
  type ElementKind,
  type FieldName,
  type FieldSource,
  type ModelElement,
  type ResolvedElementStyle,
  type Styles,
  type Terminology,
} from "@miragon/c4-schema-model";
import type DocumentStore from "../document/DocumentStore.js";
import type { SceneNotation } from "../scene/notation.js";
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

/** The tag Structurizr gives every element of a kind, after `Element` (SPEC 6.4). */
const KIND_TAGS: Readonly<Record<CreatableKind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
};

const DATABASE_TAG = "Database";

const ABSENT_FIELD: FieldSource = {
  form: "absent",
  statement: -1,
  token: undefined,
  editable: false,
  reason: undefined,
};
const FIELD_NAMES: readonly FieldName[] = [
  "name",
  "description",
  "technology",
  "metadata",
  "tags",
  "url",
];

/** The element a create of `kind` with `tags` writes, as the style cascade and the type line read it. */
function draftElement(kind: CreatableKind, tags: readonly string[], name: string): ModelElement {
  const ownTags = tags.filter((tag) => tag !== "Element" && tag !== KIND_TAGS[kind]);
  return {
    id: "",
    identifier: undefined,
    implicit: true,
    kind,
    archetype: undefined,
    parentId: undefined,
    name,
    description: "",
    technology: "",
    metadata: "",
    tags: ["Element", KIND_TAGS[kind], ...ownTags],
    ownTags,
    url: undefined,
    properties: {},
    group: undefined,
    fields: Object.fromEntries(FIELD_NAMES.map((field) => [field, ABSENT_FIELD])) as Record<
      FieldName,
      FieldSource
    >,
  };
}

/**
 * The styles after a create of an element with `tags`: the Database entry adds its cylinder when
 * the workspace has no style for the tag yet (SPEC 5.1), and nothing else writes a style.
 */
function stylesAfterCreate(styles: Styles, tags: readonly string[]): Styles {
  if (!tags.includes(DATABASE_TAG)) return styles;
  if (styles.elements.some((style) => style.tag === DATABASE_TAG)) return styles;
  return { ...styles, elements: [...styles.elements, { tag: DATABASE_TAG, shape: "Cylinder" }] };
}

/**
 * The styles of the skeleton the first edit of a blank file writes (`newWorkspaceText()`, SPEC
 * 3.5): its first element lands in the C4 colours.
 */
const NEW_WORKSPACE_STYLES: Styles = {
  elements: C4_COLOUR_STYLES.map(({ tag, background, color, stroke }) => ({
    tag,
    background: background.toLowerCase(),
    color: color.toLowerCase(),
    stroke: stroke.toLowerCase(),
  })),
  relationships: [],
  themes: [],
};

/** The look a create of `kind` with `tags` lands in: the workspace's styles, as the canvas resolves them. */
export function createdElementStyle(
  kind: CreatableKind,
  tags: readonly string[],
  styles: Styles,
  notation: Pick<SceneNotation, "elementStyle">,
): ResolvedElementStyle {
  return notation.elementStyle(draftElement(kind, tags, ""), stylesAfterCreate(styles, tags));
}

/**
 * What a palette or harness preview draws: the element the create drops, with its name and type
 * line, in `style` (the look `createdElementStyle` resolves), else in the default look with the
 * kind's default shape (a person, the Database entry's cylinder, a box).
 */
export function previewElement(
  id: string,
  box: Box,
  reference: C4PreviewReference,
  style?: ResolvedElementStyle,
  typeLine?: string,
): SceneElement {
  const database = reference.tags?.includes(DATABASE_TAG) === true;
  const shape = reference.kind === "person" ? "Person" : database ? "Cylinder" : "Box";
  const label = KIND_LABELS[reference.kind];
  return {
    id,
    kind: reference.kind,
    box,
    shape: style?.shape ?? shape,
    name: reference.name ?? (database ? DATABASE_TAG : label),
    typeLine: typeLine ?? `[${label}]`,
    description: "",
    technology: "",
    style: style ?? defaultElementStyle(shape),
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
    if (reference?.role === "preview") return this.preview(shape.id, boxOf(shape), reference);
    if (reference?.role !== "element") return undefined;
    const scene = this.scene();
    const element = scene && indexOf(scene).elements.get(reference.id);
    if (!element) return undefined;
    const box = boxOf(shape);
    return sameBox(element.box, box) ? element : { ...element, box };
  }

  /**
   * The look a create of `kind` with `tags` lands in, from the current workspace's styles; the
   * default look without a document (a harness).
   */
  createdStyle(
    kind: CreatableKind,
    tags: readonly string[] = [],
  ): ResolvedElementStyle | undefined {
    const target = this.createTarget();
    if (!target) return undefined;
    return createdElementStyle(kind, tags, target.styles, target.notation);
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

  private preview(id: string, box: Box, reference: C4PreviewReference): SceneElement {
    const target = this.createTarget();
    if (!target) return previewElement(id, box, reference);
    const tags = reference.tags ?? [];
    const element = draftElement(reference.kind, tags, reference.name ?? "");
    return previewElement(
      id,
      box,
      reference,
      createdElementStyle(reference.kind, tags, target.styles, target.notation),
      target.notation.typeLine(element, target.terminology),
    );
  }

  /** What a create resolves against; none without a document and a notation (a harness). */
  private createTarget():
    { styles: Styles; terminology: Terminology; notation: SceneNotation } | undefined {
    const parse = this.injector.get<DocumentStore>("c4Document", false)?.current().parse;
    const notation = this.injector.get<SceneNotation>("c4Notation", false);
    if (!parse || !notation) return undefined;
    const { styles, terminology } = parse.workspace;
    const blank = parse.text.trim() === "";
    return { styles: blank ? NEW_WORKSPACE_STYLES : styles, terminology, notation };
  }
}
