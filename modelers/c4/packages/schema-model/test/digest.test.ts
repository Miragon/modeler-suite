import { describe, expect, it } from "vitest";
import { sameDigest, semanticDigest } from "../src/digest.js";
import type { ModelElement, Workspace } from "../src/types.js";
import { BANK_ELEMENTS, BANK_RELATIONSHIPS, bank } from "./support/bank.js";
import { relationship, system, view, workspace } from "./support/model.js";

const VIEWS = [
  view("Landscape", "systemLandscape", {
    statements: ["include *", "exclude loner"],
    properties: { "c4modeler.element.customer": "0,0" },
  }),
  view("Containers", "container", { scope: "banking", title: "Banking" }),
];

const base = () => bank(VIEWS);
const same = (left: Workspace, right: Workspace) =>
  sameDigest(semanticDigest(left), semanticDigest(right));

function withElement(model: Workspace, id: string, change: Partial<ModelElement>): Workspace {
  return {
    ...model,
    elements: model.elements.map((element) =>
      element.id === id ? { ...element, ...change } : element,
    ),
  };
}

describe("semanticDigest (SPEC 3.4 step 4)", () => {
  it("is stable: the same model gives the same digest, also built twice", () => {
    expect(same(base(), base())).toBe(true);
    const model = base();
    expect(sameDigest(semanticDigest(model), semanticDigest(model))).toBe(true);
  });

  it("keys elements by id and holds only explicit relationships and written views", () => {
    const digest = semanticDigest(base());
    expect([...digest.elements.keys()]).toEqual(BANK_ELEMENTS.map((element) => element.id));
    expect(digest.relationships).toHaveLength(BANK_RELATIONSHIPS.length);
    expect([...digest.views.keys()]).toEqual(["Landscape", "Containers"]);
    expect(digest.elements.get("banking.web")).toEqual({
      kind: "container",
      parentId: "banking",
      name: "Web App",
      description: "",
      technology: "Java",
      metadata: "",
      ownTags: [],
      url: undefined,
      properties: {},
      group: undefined,
    });
    expect(digest.views.get("Landscape")?.statements).toEqual([
      { kind: "include", terms: ["*"] },
      { kind: "exclude", terms: ["loner"] },
    ]);
  });

  it("ignores source positions, cascaded tags and implied relationships", () => {
    const model = base();
    const moved: Workspace = {
      ...model,
      elements: model.elements.map((element) => ({
        ...element,
        tags: ["Element", "Cascaded", ...element.ownTags],
        fields: { ...element.fields, name: { ...element.fields.name, statement: 99, token: 7 } },
      })),
      relationships: model.relationships.filter((item) => !item.implied),
    };
    expect(same(model, moved)).toBe(true);
  });

  it("compares elements and views by key and relationships as a multiset, not by position", () => {
    const model = base();
    const reordered: Workspace = {
      ...model,
      elements: [...model.elements].reverse(),
      relationships: [...model.relationships].reverse(),
      views: [...model.views].reverse(),
    };
    expect(same(model, reordered)).toBe(true);
  });

  it.each<[string, (model: Workspace) => Workspace]>([
    ["the workspace name", (model) => ({ ...model, name: "Other" })],
    ["the workspace description", (model) => ({ ...model, description: "Other" })],
    ["an element's name", (model) => withElement(model, "customer", { name: "Client" })],
    ["an element's description", (model) => withElement(model, "customer", { description: "x" })],
    ["an element's technology", (model) => withElement(model, "banking.web", { technology: "Go" })],
    ["an element's own tags", (model) => withElement(model, "customer", { ownTags: ["VIP"] })],
    ["an element's url", (model) => withElement(model, "customer", { url: "https://example.com" })],
    [
      "an element's properties",
      (model) => withElement(model, "customer", { properties: { a: "b" } }),
    ],
    ["an element's group", (model) => withElement(model, "customer", { group: "Bank" })],
    ["an element's parent", (model) => withElement(model, "banking.db", { parentId: "mainframe" })],
    ["an element's kind", (model) => withElement(model, "printer", { kind: "person" })],
    ["an element's id", (model) => withElement(model, "loner", { id: "loner2" })],
    ["a missing element", (model) => ({ ...model, elements: model.elements.slice(1) })],
    [
      "a relationship's description",
      (model) => ({
        ...model,
        relationships: model.relationships.map((item, index) =>
          index === 0 ? { ...item, description: "Pays" } : item,
        ),
      }),
    ],
    [
      "an added relationship",
      (model) => ({
        ...model,
        relationships: [...model.relationships, relationship("customer", "loner")],
      }),
    ],
    [
      "a view's title",
      (model) => ({ ...model, views: [VIEWS[0]!, { ...VIEWS[1]!, title: "Other" }] }),
    ],
    [
      "a view's terms",
      (model) => ({
        ...model,
        views: [
          view("Landscape", "systemLandscape", { properties: VIEWS[0]!.properties }),
          VIEWS[1]!,
        ],
      }),
    ],
    [
      "a layout entry",
      (model) => ({
        ...model,
        views: [{ ...VIEWS[0]!, properties: { "c4modeler.element.customer": "8,0" } }, VIEWS[1]!],
      }),
    ],
    ["a view key", (model) => ({ ...model, views: [VIEWS[0]!, { ...VIEWS[1]!, key: "Other" }] })],
    [
      "the styles",
      (model) => ({
        ...model,
        styles: { ...model.styles, elements: [{ tag: "Person", shape: "Person" }] },
      }),
    ],
    ["the opaque texts", (model) => ({ ...model, opaqueTexts: ["!script groovy { x }"] })],
    [
      "a dynamic view's steps",
      (model) => ({
        ...model,
        dynamicReferences: new Map([["Steps", { elements: ["customer"], relationships: [] }]]),
      }),
    ],
    [
      "deployment instances",
      (model) => ({ ...model, instances: new Map([["banking", ["live.banking"]]]) }),
    ],
  ])("changes with %s", (_change, transform) => {
    const model = base();
    expect(same(model, transform(model))).toBe(false);
  });

  it("counts the order of own tags, which decides the style cascade", () => {
    const model = withElement(base(), "customer", { ownTags: ["A", "B"] });
    expect(same(model, withElement(model, "customer", { ownTags: ["B", "A"] }))).toBe(false);
  });

  it("normalises the whitespace of opaque texts", () => {
    const model = base();
    expect(
      same(
        { ...model, opaqueTexts: ["!script  groovy {\n  x\n}"] },
        { ...model, opaqueTexts: [" !script groovy { x } "] },
      ),
    ).toBe(true);
  });

  it("lets an edit state its expected digest as a transformation of the one before", () => {
    const before = workspace({ elements: [system("a")] });
    const after = workspace({ elements: [system("a", { name: "Renamed" })] });
    const expected = semanticDigest(before);
    const elements = new Map(expected.elements);
    elements.set("a", { ...elements.get("a")!, name: "Renamed" });
    expect(sameDigest({ ...expected, elements }, semanticDigest(after))).toBe(true);
  });
});
