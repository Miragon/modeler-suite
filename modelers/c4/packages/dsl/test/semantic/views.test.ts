import { generateViewKey } from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { codes, diagnostics, dsl, model, parse } from "./support/parse.js";

const SYSTEMS =
  'a = softwareSystem "A" {\n    c = container "C" {\n        k = component "K"\n    }\n}\nb = softwareSystem "B"\na -> b "Uses"';

describe("views (SPEC 3.6, 4.2, 4.4)", () => {
  it("gives a keyless view the key generateViewKey gives it, first unused per type in document order", () => {
    const text = model(
      SYSTEMS,
      dsl`
        systemLandscape {
            include *
        }
        systemLandscape "SystemLandscape-002" {
            include *
        }
        systemLandscape {
            include *
        }
        systemContext a {
            include *
        }
        container a {
            include *
        }
        component c {
            include *
        }
        dynamic a {
            c -> b
        }
        deployment * live {
            include *
        }
      `,
    ).replace(
      "    }\n    views",
      '        live = deploymentEnvironment "Live" {\n            deploymentNode "N" {\n                softwareSystemInstance a\n            }\n        }\n    }\n    views',
    );
    const views = parse(text).workspace.views;
    expect(views.map((view) => [view.key, view.keyGenerated])).toEqual([
      ["SystemLandscape-001", true],
      ["SystemLandscape-002", false],
      ["SystemLandscape-003", true],
      ["SystemContext-001", true],
      ["Container-001", true],
      ["Component-001", true],
      ["Dynamic-001", true],
      ["Deployment-001", true],
    ]);
    expect(
      generateViewKey("systemLandscape", new Set(["SystemLandscape-001", "SystemLandscape-002"])),
    ).toBe("SystemLandscape-003");
  });

  it("reads the head's description, which a description statement overrides, and the last title", () => {
    const text = model(
      SYSTEMS,
      'systemContext a "Ctx" "Head description" {\n    include *\n    title "First"\n    title "Second"\n}\nsystemLandscape "L" "Only the head" {\n    include *\n    description "Statement"\n}',
    );
    const [context, landscape] = parse(text).workspace.views;
    expect(context).toMatchObject({ title: "Second", description: "Head description" });
    expect(landscape).toMatchObject({ title: undefined, description: "Statement" });
  });

  it("reads autoLayout with the 6.2.4 code defaults and keeps the last one", () => {
    const text = model(
      SYSTEMS,
      'systemLandscape "A" {\n    include *\n    autoLayout\n}\nsystemLandscape "B" {\n    include *\n    autoLayout tb 300 160\n}\nsystemLandscape "C" {\n    include *\n    autoLayout rl\n    autoLayout bt 10 20 30 false\n}\nsystemLandscape "D" {\n    include *\n}',
    );
    expect(parse(text).workspace.views.map((view) => view.autoLayout)).toEqual([
      {
        rankDirection: "lr",
        rankSeparation: 100,
        nodeSeparation: 50,
        edgeSeparation: 50,
        vertices: true,
      },
      {
        rankDirection: "tb",
        rankSeparation: 300,
        nodeSeparation: 160,
        edgeSeparation: 50,
        vertices: true,
      },
      {
        rankDirection: "bt",
        rankSeparation: 10,
        nodeSeparation: 20,
        edgeSeparation: 30,
        vertices: false,
      },
      undefined,
    ]);
  });

  it("refuses an upper-case rank direction as Structurizr does", () => {
    expect(
      codes(model(SYSTEMS, 'systemLandscape "A" {\n    include *\n    autoLayout TB\n}')),
    ).toEqual(["error:invalid-statement"]);
  });

  it("reads the stored layout from the view's properties, a later block winning per key", () => {
    const text = model(
      SYSTEMS,
      dsl`
        systemLandscape "L" {
            include *
            properties {
                "c4modeler.element.a" "0,0"
            }
            properties {
                "c4modeler.element.a" "10,-20"
                "c4modeler.element.b" "300,0,320,200"
                "c4modeler.relationship.a->b" "150,40 150,80"
                "x-vendor.owner" "team"
            }
        }
      `,
    );
    const view = parse(text).workspace.views[0];
    expect(view?.properties).toEqual({
      "c4modeler.element.a": "10,-20",
      "c4modeler.element.b": "300,0,320,200",
      "c4modeler.relationship.a->b": "150,40 150,80",
      "x-vendor.owner": "team",
    });
    expect([...(view?.layout.elements ?? [])]).toEqual([
      ["a", { x: 10, y: -20 }],
      ["b", { x: 300, y: 0, width: 320, height: 200 }],
    ]);
    expect([...(view?.layout.relationships ?? [])]).toEqual([
      [
        "a->b",
        [
          { x: 150, y: 40 },
          { x: 150, y: 80 },
        ],
      ],
    ]);
    expect(codes(text)).toEqual([]);
  });

  it("keeps a layout key naming nothing in the view and a malformed value, and reports both", () => {
    const text = model(
      SYSTEMS,
      'systemContext b "Ctx" {\n    include b\n    properties {\n        "c4modeler.element.a" "1,2"\n        "c4modeler.element.ghost" "1,2"\n        "c4modeler.element.b" "12,x"\n    }\n}',
    );
    const view = parse(text).workspace.views[0];
    expect(view?.layout).toEqual({
      elements: new Map(),
      relationships: new Map(),
      unmatched: ["c4modeler.element.a", "c4modeler.element.ghost"],
      malformed: ["c4modeler.element.b"],
    });
    expect(codes(text)).toEqual([
      "info:layout-unmatched",
      "info:layout-unmatched",
      "warning:layout-malformed",
    ]);
    expect(diagnostics(text, "layout-malformed")[0]?.line).toBe(
      text.slice(0, text.indexOf('"c4modeler.element.b"')).split("\n").length,
    );
  });

  it("matches layout keys to ids case-insensitively, storing them under the defining spelling", () => {
    const text = model(
      'Shop = softwareSystem "Shop"',
      'systemLandscape "L" {\n    include *\n    properties {\n        "c4modeler.element.shop" "5,5"\n    }\n}',
    );
    expect([...(parse(text).workspace.views[0]?.layout.elements ?? [])]).toEqual([
      ["Shop", { x: 5, y: 5 }],
    ]);
  });

  it("marks default views and ignores a default on a view the canvas can't edit, with an info", () => {
    const text = model(
      SYSTEMS,
      'systemLandscape "L" {\n    include *\n}\ndynamic * "D" {\n    a -> b\n    default\n}\nsystemContext a "Ctx" {\n    include *\n    default\n}',
    );
    const result = parse(text);
    expect(result.workspace.views.map((view) => [view.key, view.isDefault])).toEqual([
      ["L", false],
      ["D", true],
      ["Ctx", true],
    ]);
    expect(codes(text)).toEqual(["info:view-type-not-editable", "info:default-not-editable"]);
  });

  it("reads include and exclude statements in order with their supported expressions", () => {
    const text = model(
      SYSTEMS,
      'container a "Cs" {\n    include * "element.type==Person"\n    exclude "a -> b" b\n}',
    );
    const view = parse(text).workspace.views[0];
    expect(view?.statements).toEqual([
      {
        kind: "include",
        terms: [
          { text: "*", expression: { kind: "all", reluctant: false } },
          {
            text: "element.type==Person",
            expression: { kind: "elementType", elementKind: "person" },
          },
        ],
      },
      {
        kind: "exclude",
        terms: [
          { text: "a -> b", expression: { kind: "relationship", source: "a", destination: "b" } },
          { text: "b", expression: { kind: "reference", identifier: "b" } },
        ],
      },
    ]);
    expect(view?.editable).toBe(true);
  });

  it("resolves terms where the view is written, and checks the terms of views it never projects", () => {
    const before = dsl`
      workspace {
          views {
              systemLandscape "L" {
                  include user
              }
          }
          model {
              user = person "User"
          }
      }
    `;
    expect(codes(before)).toEqual(["error:unresolved-reference"]);
    const terms = (deployment: string, custom: string) =>
      model(
        dsl`
          s = softwareSystem "S" {
              c = container "C"
          }
          e = element "E"
          live = deploymentEnvironment "Live" {
              n = deploymentNode "N" {
                  containerInstance c
              }
          }
        `,
        `deployment * live "D" {\n    include ${deployment}\n}\ncustom "X" {\n    include ${custom}\n}`,
      );
    expect(codes(terms("n", "e"))).toEqual(["info:view-type-not-editable"]);
    expect(codes(terms("nope", "**"))).toEqual([
      "info:view-type-not-editable",
      "error:unresolved-reference",
      "error:unresolved-reference",
    ]);
  });

  it("refuses a filtered view on a base that lays itself out", () => {
    const text = model(
      SYSTEMS,
      'systemLandscape "L" {\n    include *\n    autoLayout\n}\nfiltered "L" include "Element" "F"',
    );
    expect(codes(text)).toEqual(["info:view-type-not-editable", "error:invalid-statement"]);
  });
});
