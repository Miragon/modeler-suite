import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEdit, applyTextEdits, parseWorkspace, type ParseResult } from "@miragon/c4-dsl";
import { layoutView, viewFrames } from "@miragon/c4-layout";
import {
  viewCatalog,
  viewMembers,
  type FieldSource,
  type ModelElement,
  type Relationship,
  type Terminology,
  type Workspace,
} from "@miragon/c4-schema-model";
import type * as SchemaModel from "@miragon/c4-schema-model";
import { createC4Engine } from "../src/engine/C4Engine.js";
import {
  c4ReferenceOf,
  isBoundaryShape,
  isElementShape,
  isRelationshipConnection,
} from "../src/scene/types.js";

// The digest is the schema model's to get right: here it sees the name only, so every other
// difference has to be caught by the seam itself.
const digest = vi.hoisted(() => ({ equal: true, compared: [] as unknown[][] }));
vi.mock("@miragon/c4-schema-model", async (importOriginal) => ({
  ...(await importOriginal<typeof SchemaModel>()),
  semanticDigest: (workspace: Workspace) => workspace.name,
  sameDigest: (left: string, right: string) => {
    digest.compared.push([left, right]);
    return digest.equal && left === right;
  },
}));

const TERMINOLOGY: Terminology = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  deploymentNode: "Deployment Node",
  infrastructureNode: "Infrastructure Node",
  relationship: "Relationship",
  metadataSymbols: "square",
};

function source(statement: number, editable = true): FieldSource {
  return {
    form: "positional",
    statement,
    token: 2,
    editable,
    reason: editable ? undefined : "substitution",
  };
}

function system(
  id: string,
  statement: number,
  overrides: Partial<ModelElement> = {},
): ModelElement {
  return {
    id,
    identifier: id,
    implicit: false,
    kind: "softwareSystem",
    archetype: undefined,
    parentId: undefined,
    name: id,
    description: "",
    technology: "",
    metadata: "",
    tags: ["Element", "Software System"],
    ownTags: [],
    url: undefined,
    properties: {},
    group: undefined,
    fields: {
      name: source(statement),
      description: source(statement),
      technology: source(statement),
      metadata: source(statement),
      tags: source(statement),
      url: source(statement),
    },
    ...overrides,
  };
}

function relationship(
  sourceId: string,
  destinationId: string,
  statement: number,
  implied = false,
): Relationship {
  const key = `${implied ? "implied:" : ""}${sourceId}->${destinationId}`;
  return {
    key,
    canvasKey: key,
    identifier: undefined,
    sourceId,
    destinationId,
    description: "",
    technology: "",
    tags: ["Relationship"],
    url: undefined,
    implied,
    impliedBy: implied ? "customer->shop.web" : undefined,
    bulk: false,
    fields: {
      description: source(statement),
      technology: source(statement),
      tags: source(statement),
      url: source(statement),
    },
  };
}

/** The same workspace whose statements start `shift` lines lower, as after an added comment. */
function workspace(shift = 0, overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: "Shop",
    description: "",
    elements: [system("customer", shift + 1), system("shop", shift + 2)],
    relationships: [relationship("customer", "shop", shift + 3)],
    views: [],
    groups: [],
    styles: { elements: [], relationships: [], themes: [] },
    terminology: TERMINOLOGY,
    dynamicReferences: new Map(),
    instances: new Map(),
    openWorld: false,
    opaqueTexts: [],
    ...overrides,
  };
}

function parseOf(of: Workspace, ok = true): ParseResult {
  return { ok, workspace: of } as unknown as ParseResult;
}

describe("the engine seam", () => {
  beforeEach(() => {
    digest.equal = true;
    digest.compared = [];
  });

  it("hands every call to the DOM-free packages", () => {
    const engine = createC4Engine();
    expect(engine.parse).toBe(parseWorkspace);
    expect(engine.applyEdit).toBe(applyEdit);
    expect(engine.applyTextEdits).toBe(applyTextEdits);
    expect(engine.catalog).toBe(viewCatalog);
    expect(engine.members).toBe(viewMembers);
    expect(engine.layout).toBe(layoutView);
    expect(engine.frames).toBe(viewFrames);
  });

  it("takes a formatting-only change, whose statements only moved, as equal", () => {
    const engine = createC4Engine();
    expect(engine.semanticallyEqual(parseOf(workspace()), parseOf(workspace(3)))).toBe(true);
    expect(digest.compared).toEqual([["Shop", "Shop"]]);
  });

  it("compares the semantic digests of the two parses", () => {
    digest.equal = false;
    expect(createC4Engine().semanticallyEqual(parseOf(workspace()), parseOf(workspace()))).toBe(
      false,
    );
  });

  it.each<[string, Partial<Workspace>]>([
    [
      "an implied relationship (an !impliedRelationships switch)",
      {
        relationships: [
          relationship("customer", "shop", 4),
          relationship("customer", "shop", 4, true),
        ],
      },
    ],
    [
      "a tag an archetype cascades",
      {
        elements: [
          system("customer", 1),
          system("shop", 2, { tags: ["Element", "Software System", "Web"] }),
        ],
      },
    ],
    ["the terminology", { terminology: { ...TERMINOLOGY, softwareSystem: "Application" } }],
    ["the document order", { elements: [system("shop", 2), system("customer", 1)] }],
    [
      "whether a field is editable (a ${NAME} substitution)",
      {
        elements: [
          system("customer", 1),
          system("shop", 2, { fields: { ...system("shop", 2).fields, name: source(2, false) } }),
        ],
      },
    ],
    ["the deployment instances", { instances: new Map([["shop", ["shop-1"]]]) }],
  ])("draws a change of %s that the digest leaves out", (_change, change) => {
    const engine = createC4Engine();
    expect(engine.semanticallyEqual(parseOf(workspace()), parseOf(workspace(0, change)))).toBe(
      false,
    );
    expect(engine.semanticallyEqual(parseOf(workspace(0, change)), parseOf(workspace()))).toBe(
      false,
    );
  });

  it("finds a parse that rejects equal to none, so a rebase never takes it", () => {
    const engine = createC4Engine();
    expect(engine.semanticallyEqual(parseOf(workspace()), parseOf(workspace(), false))).toBe(false);
    expect(engine.semanticallyEqual(parseOf(workspace(), false), parseOf(workspace()))).toBe(false);
  });
});

describe("the reference a canvas element carries", () => {
  const element = { id: "shop", c4: { role: "element", id: "shop" } };
  const boundary = { id: "boundary:shop", c4: { role: "boundary", id: "shop" } };
  const relationship = {
    id: "rel:a->b",
    c4: { role: "relationship", key: "a->b", implied: false },
  };
  const preview = { id: "preview:1", c4: { role: "preview", kind: "person" } };

  it("tells the notation's roles apart", () => {
    expect([element, boundary, relationship, preview].map(isElementShape)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect([element, boundary, relationship, preview].map(isBoundaryShape)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect([element, boundary, relationship, preview].map(isRelationshipConnection)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(c4ReferenceOf(preview)).toEqual({ role: "preview", kind: "person" });
  });

  it("finds none on diagram-js's own elements and on other values", () => {
    for (const value of [
      { id: "c4:root" },
      { id: "label", c4: { role: "label" } },
      { c4: null },
      null,
      "shop",
    ]) {
      expect(c4ReferenceOf(value)).toBeUndefined();
    }
  });
});
