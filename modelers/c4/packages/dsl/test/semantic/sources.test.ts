import { describe, expect, it } from "vitest";
import { semanticSources, type SemanticSources } from "../../src/semantic/index.js";
import type { SourceIndex, Statement } from "../../src/types.js";
import { dsl, parse } from "./support/parse.js";

const TEXT = dsl`
  workspace "Shop" "Sells things." {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop" {
              web = container "Web"
              group "Back end" {
                  api = container "API"
              }
          }
          uses = customer -> web "Browses"
          customer -> shop "Buys from"
          !element shop {
              description "Reopened"
          }
          live = deploymentEnvironment "Live" {
              deploymentNode "Server" {
                  containerInstance web
              }
          }
      }
      views {
          systemContext shop "Context" "Who uses the shop" {
              include *
              exclude "customer->shop"
              animation {
                  customer
              }
              properties {
                  "c4modeler.element.shop" "0,0"
              }
          }
          container shop {
              include web customer
          }
          dynamic shop "Checkout" {
              customer -> web
              uses
          }
          styles {
              element "Person" {
                  shape Person
              }
          }
      }
  }
`;

const first = (text: string, statement: Statement | undefined) =>
  statement === undefined
    ? undefined
    : text.slice(statement.range.start, text.indexOf("\n", statement.range.start));

function sources(): SemanticSources {
  const found = semanticSources(parse(TEXT).sources);
  if (found === undefined) throw new Error("no semantic sources");
  return found;
}

describe("the source index (SPEC 11.2 WP3)", () => {
  it("finds each element's definition and re-opens", () => {
    const index = sources();
    expect(first(TEXT, index.element("shop")?.definition)).toBe(
      '        shop = softwareSystem "Shop" {',
    );
    expect(index.element("shop")?.reopens.map((statement) => first(TEXT, statement))).toEqual([
      "        !element shop {",
    ]);
    expect(index.element("missing")).toBeUndefined();
  });

  it("finds the effective source of a field", () => {
    const index = sources();
    const description = index.field("shop", "description");
    expect(first(TEXT, description?.statement)).toBe('            description "Reopened"');
    expect(description?.token).toBe(1);
    expect(index.field("customer", "name")?.token).toBe(1);
  });

  it("finds relationships by key and canvas key, views by key, and the blocks", () => {
    const index = sources();
    expect(first(TEXT, index.relationship("uses"))).toBe(
      '        uses = customer -> web "Browses"',
    );
    expect(first(TEXT, index.relationship("customer->shop"))).toBe(
      '        customer -> shop "Buys from"',
    );
    expect(first(TEXT, index.view("Container-001"))).toBe("        container shop {");
    expect(first(TEXT, index.modelBlock())).toBe("    model {");
    expect(first(TEXT, index.viewsBlock())).toBe("    views {");
    expect(first(TEXT, index.stylesBlock())).toBe("        styles {");
  });

  it("lists every reference to an element with its statement and token", () => {
    const index = sources();
    const references = index
      .references("customer")
      .map((site) => [first(TEXT, site.statement)?.trim(), site.token]);
    expect(references).toEqual([
      ['uses = customer -> web "Browses"', 0],
      ['customer -> shop "Buys from"', 0],
      ['exclude "customer->shop"', 1],
      ["customer", 0],
      ["include web customer", 2],
      ["customer -> web", 0],
    ]);
    const kinds = index.referencesTo({ kind: "element", id: "web" }).map((site) => site.kind);
    expect(kinds).toEqual(["relationship-destination", "instance", "view-term", "dynamic-step"]);
    expect(
      index.referencesTo({ kind: "element", id: "shop" }).map((site) => [site.kind, site.exact]),
    ).toEqual([
      ["relationship-destination", true],
      ["reopen", true],
      ["view-scope", true],
      ["view-term", false],
      ["view-scope", true],
      ["view-scope", true],
    ]);
    expect(
      index.referencesTo({ kind: "relationship", key: "uses" }).map((site) => site.kind),
    ).toEqual(["dynamic-step"]);
  });

  it("gives the edit layer the places it writes to", () => {
    const index = sources();
    const api = index.elementSite("api");
    expect(first(TEXT, api?.parentStatement)).toBe('            group "Back end" {');
    expect(first(TEXT, api?.groupStatement)).toBe('            group "Back end" {');
    expect(index.roleOf(api?.definition as Statement)).toBe("element");
    const context = index.viewSite("Context");
    expect(context).toMatchObject({
      keyGenerated: false,
      keyToken: 2,
      scopeToken: 1,
      positionalDescriptionToken: 3,
    });
    expect(
      context?.contents.map((content) => [content.kind, content.terms.map((term) => term.text)]),
    ).toEqual([
      ["include", ["*"]],
      ["exclude", ["customer->shop"]],
    ]);
    expect(context?.propertiesBlocks[0]?.entries.map((entry) => [entry.key, entry.value])).toEqual([
      ["c4modeler.element.shop", "0,0"],
    ]);
    expect(index.viewSite("Container-001")).toMatchObject({
      keyGenerated: true,
      keyToken: undefined,
    });
    expect(index.workspace()).toMatchObject({
      nameToken: 1,
      descriptionToken: 2,
      extendsSource: undefined,
    });
    expect(index.deploymentEnvironments().map((statement) => first(TEXT, statement))).toEqual([
      '        live = deploymentEnvironment "Live" {',
    ]);
    expect(
      index.dynamicSteps().map((step) => [step.view, step.elements, step.relationship]),
    ).toEqual([
      ["Checkout", ["customer", "web"], "uses"],
      ["Checkout", [], "uses"],
    ]);
    expect(index.styles().map((style) => [style.type, style.tag])).toEqual([
      ["elementStyle", "Person"],
    ]);
  });

  it("indexes every statement in document order, the index FieldSource.statement counts in", () => {
    const result = parse(TEXT);
    const index = sources();
    const customer = result.workspace.elements.find((element) => element.id === "customer");
    expect(index.statementAt(customer?.fields.name.statement ?? -1)).toBe(
      index.element("customer")?.definition,
    );
    for (const [position, statement] of index.statements.entries())
      expect(index.indexOf(statement)).toBe(position);
    expect(index.parentOf(index.element("web")?.definition as Statement)).toBe(
      index.element("shop")?.definition,
    );
  });

  it("marks references a hierarchical lookup resolved relative to an element", () => {
    const text = dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
                  api = container "API" {
                      -> web "Calls"
                  }
              }
          }
      }
    `;
    const index = semanticSources(parse(text).sources);
    expect(index?.references("shop.web").map((site) => [site.written, site.relativeTo])).toEqual([
      ["web", "shop"],
    ]);
  });

  it("is found only for a parse of this package", () => {
    const fake: SourceIndex = {
      element: () => undefined,
      field: () => undefined,
      relationship: () => undefined,
      view: () => undefined,
      modelBlock: () => undefined,
      viewsBlock: () => undefined,
      stylesBlock: () => undefined,
      identifierModeAt: () => "flat",
      references: () => [],
    };
    expect(semanticSources(fake)).toBeUndefined();
  });
});

describe("group identity (the scope-qualified group of WP1 and WP5's notes)", () => {
  it("keeps one definition per group statement, scoped by the element whose block holds it", () => {
    const text = dsl`
      workspace {
          model {
              group "Internal" {
                  ops = person "Ops"
              }
              a = softwareSystem "A" {
                  group "Internal" {
                      x = container "X"
                  }
              }
              b = softwareSystem "B" {
                  group "Internal" {
                      y = container "Y"
                  }
              }
              ops -> x "Runs"
          }
      }
    `;
    const groups = parse(text).workspace.groups;
    expect(groups.map((group) => [group.path, group.parentId, group.members])).toEqual([
      ["Internal", undefined, ["ops"]],
      ["Internal", "a", ["x"]],
      ["Internal", "b", ["y"]],
    ]);
  });
});
