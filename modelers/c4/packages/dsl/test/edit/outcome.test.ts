import { layoutView } from "@miragon/c4-layout";
import {
  C4_COLOUR_STYLES,
  defaultShape,
  defaultSize,
  viewCatalog,
  viewMembers,
  type ElementId,
  type Size,
  type ViewKey,
} from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { NEW_VIEW_AUTO_LAYOUT, newWorkspaceText } from "../../src/edit/skeleton.js";
import type { ParseResult } from "../../src/types.js";
import { box, dsl, edit, edited, parseWorkspace } from "./support/edit.js";

function ok(outcome: ReturnType<typeof edit>) {
  if (!outcome.ok)
    throw new Error(
      `${outcome.reason}: ${outcome.message} ${(outcome as { detail?: string }).detail ?? ""}`,
    );
  return outcome;
}

const LANDSCAPE = dsl`
  workspace {
      model {
          customer = person "Customer"
          softwareSystem_ab12 = softwareSystem "Software System" {
              web = container "Web"
          }
          customer -> softwareSystem_ab12
      }
      views {
          systemLandscape "Landscape" {
              include *
              properties {
                  "c4modeler.element.customer" "0,0"
                  "c4modeler.element.softwareSystem_ab12" "400,0"
                  "c4modeler.relationship.customer->softwareSystem_ab12" "200,300"
              }
          }
      }
  }
`;

describe("the outcome's view (SPEC 3.4 step 5)", () => {
  it("follows a draft whose scope's fresh identifier follows its first name (rekey)", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "softwareSystem_ab12", fields: { name: "Payments" } },
        {
          view: "Containers-softwareSystem_ab12",
          fresh: ["softwareSystem_ab12"],
        },
      ),
    );
    expect(outcome.view).toBe("Containers-payments");
    expect(outcome.fresh.has("payments")).toBe(false);
    expect(outcome.fresh.has("softwareSystem_ab12")).toBe(false);
  });

  it("reports the identifier, the relationship keys and the layout keys that follow a fresh name", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "softwareSystem_ab12", fields: { name: "Payments" } },
        {
          view: "Landscape",
          fresh: ["softwareSystem_ab12"],
        },
      ),
    );
    expect(outcome.idChanges).toEqual([
      { kind: "element", from: "softwareSystem_ab12", to: "payments" },
      { kind: "relationship", from: "customer->softwareSystem_ab12", to: "customer->payments" },
    ]);
    expect(outcome.text).toContain('"c4modeler.element.payments" "400,0"');
    expect(outcome.text).toContain('"c4modeler.relationship.customer->payments" "200,300"');
    expect(outcome.text).toContain("customer -> payments");
    expect(outcome.view).toBe("Landscape");
  });

  it("adds a random suffix to the followed identifier for collaborative hosts", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "softwareSystem_ab12", fields: { name: "Payments" } },
        {
          view: "Landscape",
          fresh: ["softwareSystem_ab12"],
          identifiers: "collision-free",
        },
      ),
    );
    expect(outcome.idChanges[0]?.to).toMatch(/^payments_[0-9a-z]{4}$/);
  });

  it("lets a software system share a person's name, as Structurizr does", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "softwareSystem_ab12", fields: { name: "Customer" } },
        { view: "Landscape" },
      ),
    );
    expect(outcome.text).toContain('softwareSystem_ab12 = softwareSystem "Customer"');
  });

  it("keeps a non-fresh identifier when the name changes", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "customer", fields: { name: "Buyer" } },
        { view: "Landscape" },
      ),
    );
    expect(outcome.idChanges).toEqual([]);
    expect(outcome.text).toContain('customer = person "Buyer"');
  });

  it("goes to the nearest parent that resolves when the scope of the current view goes", () => {
    const text = dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `;
    const outcome = ok(
      edit(
        text,
        { type: "deleteFromModel", ids: ["shop"], relationships: [] },
        { view: "ShopContainers" },
      ),
    );
    expect(outcome.view).toBe("Landscape");
    expect(outcome.text).not.toContain("ShopContainers");
  });

  it("names the created view after createView", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "createView", viewType: "container", scopeId: "softwareSystem_ab12" },
        { view: "Landscape" },
      ),
    );
    expect(outcome.view).toBe("Containers-softwareSystem_ab12");
  });
});

describe("the fresh set", () => {
  it("gains a palette element and loses a deleted one", () => {
    const created = ok(
      edit(
        LANDSCAPE,
        { type: "createElement", kind: "person", center: { x: 0, y: 400 } },
        { view: "Landscape" },
      ),
    );
    const id = created.created.elements[0] as ElementId;
    expect(id).toMatch(/^person_[0-9a-z]{4}$/);
    expect([...created.fresh]).toEqual([id]);
    const deleted = ok(
      edit(
        created.text,
        { type: "deleteFromModel", ids: [id], relationships: [] },
        { view: "Landscape", fresh: [id] },
      ),
    );
    expect([...deleted.fresh]).toEqual([]);
  });

  it("names a palette element after its placeholder, numbered in its namespace", () => {
    const created = ok(
      edit(
        LANDSCAPE,
        { type: "createElement", kind: "softwareSystem", center: { x: 0, y: 400 } },
        { view: "Landscape" },
      ),
    );
    expect(created.text).toMatch(/softwareSystem_[0-9a-z]{4} = softwareSystem "Software System 2"/);
  });
});

describe("notices", () => {
  it("says when deleting a relationship lets an implied one appear", () => {
    const text = dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> shop "Visits"
              customer -> web "Browses"
          }
      }
    `;
    const outcome = ok(
      edit(text, { type: "deleteFromModel", ids: [], relationships: ["customer->shop"] }),
    );
    expect(outcome.notices).toEqual(["implied-relationship-appears"]);
  });

  it("says that included files aren't updated, and that identifiers may collide there", () => {
    const text = dsl`
      workspace {
          !include other.dsl
          model {
              a = softwareSystem "A"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `;
    expect(
      ok(edit(text, { type: "deleteFromModel", ids: ["a"], relationships: [] })).notices,
    ).toEqual(["include-not-updated"]);
    expect(
      ok(
        edit(
          text,
          { type: "createElement", kind: "person", name: "Visitor", center: { x: 0, y: 0 } },
          { view: "Landscape" },
        ),
      ).notices,
    ).toEqual(["identifier-may-collide"]);
  });
});

describe("minimal edits", () => {
  it("renames with one token edit per occurrence", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "renameIdentifier", id: "customer", identifier: "buyer" },
        { view: "Landscape" },
      ),
    );
    expect(outcome.edits).toHaveLength(4);
    for (const change of outcome.edits) {
      expect(LANDSCAPE.slice(change.start, change.end)).toMatch(/^[a-z]+$/);
      expect(change.insert).toMatch(/^[a-z]+$/);
    }
    expect(outcome.text.match(/buyer/g)?.length).toBe(4);
    expect(outcome.text).not.toMatch(/\bcustomer\b/);
  });

  it("moves with one property line", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        {
          type: "setLayout",
          boxes: new Map([["customer", box(80, 40, 216, 216)]]),
          vertices: new Map(),
        },
        { view: "Landscape" },
      ),
    );
    expect(outcome.edits).toHaveLength(1);
    const [change] = outcome.edits;
    const line = LANDSCAPE.slice(
      LANDSCAPE.lastIndexOf("\n", change?.start) + 1,
      LANDSCAPE.indexOf("\n", change?.end),
    );
    expect(line.trim()).toBe('"c4modeler.element.customer" "0,0"');
    expect(outcome.text).toContain('"c4modeler.element.customer" "80,40"');
  });

  it("changes nothing for a value it already has", () => {
    const outcome = ok(
      edit(
        LANDSCAPE,
        { type: "updateElement", id: "customer", fields: { name: "Customer" } },
        { view: "Landscape" },
      ),
    );
    expect(outcome.text).toBe(LANDSCAPE);
    expect(outcome.edits).toEqual([]);
  });

  it("is idempotent for the colours, the automatic layout and the workspace name", () => {
    const coloured = edited(LANDSCAPE, { type: "applyC4Colours" });
    expect(edited(coloured, { type: "applyC4Colours" })).toBe(coloured);
    const cleared = edited(LANDSCAPE, { type: "clearLayout" }, { view: "Landscape" });
    expect(cleared).not.toContain("c4modeler.");
    expect(edited(cleared, { type: "clearLayout" }, { view: "Landscape" })).toBe(cleared);
  });
});

function boxesOf(parse: ParseResult, key: ViewKey) {
  const workspace = parse.workspace;
  const entry = viewCatalog(workspace).resolve(key);
  if (entry === undefined) throw new Error(`no view ${key}`);
  const members = viewMembers(workspace, entry);
  const sizes = new Map<ElementId, Size>();
  for (const id of members.elements) {
    const element = workspace.elements.find((candidate) => candidate.id === id);
    if (element) sizes.set(id, defaultSize(defaultShape(element.kind)));
  }
  const relationshipEnds = new Map(
    workspace.relationships.map((relationship) => [
      relationship.canvasKey,
      { sourceId: relationship.sourceId, destinationId: relationship.destinationId },
    ]),
  );
  const autoLayout =
    entry.state === "written"
      ? entry.definition?.autoLayout
      : {
          rankDirection: "tb" as const,
          rankSeparation: 300,
          nodeSeparation: 160,
          edgeSeparation: 50,
          vertices: false,
        };
  const stored = entry.definition?.layout ?? {
    elements: new Map(),
    relationships: new Map(),
    unmatched: [],
    malformed: [],
  };
  return layoutView({ members, sizes, stored, autoLayout, relationshipEnds }).boxes;
}

describe("writing a draft or the implicit views moves no box (SPEC 3.5 rule 5)", () => {
  const MODEL = dsl`
    workspace {
        model {
            customer = person "Customer"
            shop = softwareSystem "Shop" {
                web = container "Web"
                api = container "API"
            }
            mail = softwareSystem "Mail"
            customer -> web "Uses"
            web -> api "Calls"
            api -> mail "Sends with"
        }
    }
  `;

  it(`writes autoLayout ${NEW_VIEW_AUTO_LAYOUT}`, () => {
    const after = edited(
      MODEL,
      { type: "updateView", key: "SystemContext-shop", fields: { title: "The shop" } },
      { view: "SystemLandscape" },
    );
    expect(after).toContain(`autoLayout ${NEW_VIEW_AUTO_LAYOUT}`);
  });

  it("keeps every box of every implicit view written together with the first one", () => {
    const before = parseWorkspace(MODEL);
    const after = parseWorkspace(
      edited(
        MODEL,
        { type: "updateView", key: "SystemContext-shop", fields: { title: "The shop" } },
        { view: "SystemLandscape" },
      ),
    );
    const keys = viewCatalog(before.workspace)
      .list()
      .map((entry) => entry.key);
    expect(keys).toEqual([
      "SystemLandscape",
      "SystemContext-mail",
      "SystemContext-shop",
      "Containers-shop",
    ]);
    for (const key of keys) {
      expect(viewCatalog(after.workspace).resolve(key)?.state).toBe("written");
      expect([...boxesOf(after, key)]).toEqual([...boxesOf(before, key)]);
    }
  });

  it("keeps every box of a draft written by a title", () => {
    const text = edited(
      MODEL,
      { type: "createView", viewType: "systemLandscape" },
      { view: "SystemLandscape" },
    );
    const before = parseWorkspace(text);
    const after = parseWorkspace(
      edited(
        text,
        { type: "updateView", key: "Components-web", fields: { title: "Web" } },
        { view: "SystemLandscape" },
      ),
    );
    expect(viewCatalog(before.workspace).resolve("Components-web")?.state).toBe("draft");
    expect([...boxesOf(after, "Components-web")]).toEqual([...boxesOf(before, "Components-web")]);
  });
});

/** The tag styles of a text, as the colours of "Apply C4 colours" are compared. */
function colourStyles(text: string) {
  return parseWorkspace(text).workspace.styles.elements.map(
    ({ tag, background, color, stroke }) => ({ tag, background, color, stroke }),
  );
}

const C4_COLOURS = C4_COLOUR_STYLES.map(({ tag, background, color, stroke }) => ({
  tag,
  background: background.toLowerCase(),
  color: color.toLowerCase(),
  stroke: stroke.toLowerCase(),
}));

describe("a new workspace", () => {
  it("is empty and carries the C4 colours, written as Apply C4 colours writes them", () => {
    const text = newWorkspaceText();
    const result = parseWorkspace(text);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.workspace.elements).toEqual([]);
    expect(result.workspace.views).toEqual([]);
    expect(colourStyles(text)).toEqual(C4_COLOURS);
    const bare = "workspace {\n    model {\n    }\n    views {\n    }\n}\n";
    expect(edited(bare, { type: "applyC4Colours" })).toBe(text);
  });

  it("is a text Apply C4 colours leaves as it is", () => {
    const outcome = ok(edit(newWorkspaceText(), { type: "applyC4Colours" }));
    expect(outcome.text).toBe(newWorkspaceText());
    expect(outcome.edits).toEqual([]);
  });

  it("is what Apply C4 colours makes of a blank document: one styles block, each tag once", () => {
    for (const blank of ["", "  \n\n"]) {
      expect(edited(blank, { type: "applyC4Colours" }), JSON.stringify(blank)).toBe(
        newWorkspaceText(),
      );
    }
  });
});

describe("whole documents", () => {
  it("starts a blank document with the skeleton, the C4 colours included", () => {
    const outcome = ok(
      edit(
        "",
        { type: "createElement", kind: "person", name: "Visitor", center: { x: 108, y: 108 } },
        { view: "SystemLandscape" },
      ),
    );
    expect(outcome.text.startsWith(newWorkspaceText().slice(0, 23))).toBe(true);
    expect(outcome.text).toContain('visitor = person "Visitor"');
    expect(outcome.text).toContain('systemLandscape "SystemLandscape" {');
    expect(colourStyles(outcome.text)).toEqual(C4_COLOURS);
    expect(outcome.view).toBe("SystemLandscape");
    expect(edited(outcome.text, { type: "applyC4Colours" })).toBe(outcome.text);
  });

  it("keeps the C4 colours when the first element of a blank document is deleted again", () => {
    const created = edited(
      "",
      { type: "createElement", kind: "person", name: "Visitor", center: { x: 108, y: 108 } },
      { view: "SystemLandscape" },
    );
    const emptied = edited(
      created,
      { type: "smartDelete", ids: ["visitor"], relationships: [] },
      { view: "SystemLandscape" },
    );
    const result = parseWorkspace(emptied);
    expect(result.workspace.elements).toEqual([]);
    expect(colourStyles(emptied)).toEqual(C4_COLOURS);
  });

  it("inserts the example into a skeleton-only document and shows its default view", () => {
    const example = dsl`
      workspace "Example" {
          model {
              a = softwareSystem "A"
          }
          views {
              systemLandscape "Overview" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `;
    const outcome = ok(edit(newWorkspaceText(), { type: "insertExample", exampleText: example }));
    expect(outcome.text).toBe(example);
    expect(outcome.view).toBe("Overview");
    expect(ok(edit("", { type: "insertExample", exampleText: example })).text).toBe(example);
  });

  it("writes an !element re-open after a definition with a trailing comment", () => {
    const text = dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" // the shop
          }
          views {
              container shop "Containers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `;
    const after = edited(
      text,
      { type: "createElement", kind: "container", name: "Web", center: { x: 120, y: 80 } },
      { view: "Containers" },
    );
    expect(after).toContain(
      '        shop = softwareSystem "Shop" // the shop\n        !element shop {\n            web = container "Web"\n        }\n',
    );
  });

  it("doesn't add a second Database style", () => {
    const text = edited(
      LANDSCAPE,
      { type: "createElement", kind: "container", tags: ["Database"], center: { x: 0, y: 0 } },
      { view: "Containers-softwareSystem_ab12" },
    );
    const again = edited(
      text,
      { type: "createElement", kind: "container", tags: ["Database"], center: { x: 400, y: 0 } },
      { view: "Containers-softwareSystem_ab12" },
    );
    expect(again.match(/element "Database"/g)?.length).toBe(1);
    expect(again).toContain('"Database 2"');
  });
});

describe("sources in less common forms", () => {
  it("writes a keyless deployment view's key after its environment", () => {
    const text = dsl`
      workspace {
          model {
              s = softwareSystem "S" {
                  c = container "C"
              }
              live = deploymentEnvironment "Live" {
                  deploymentNode "N" {
                      containerInstance c
                  }
              }
          }
          views {
              deployment s "Live" {
                  include *
              }
              deployment s "Live" {
                  include *
              }
          }
      }
    `;
    const after = edited(text, { type: "deleteView", key: "Deployment-001" });
    expect(after).toContain('        deployment s "Live" "Deployment-002" {\n');
    expect(after.match(/deployment s/g)).toHaveLength(1);
  });

  const DEFAULTS = dsl`
    workspace {
        model {
            archetypes {
                -> {
                    description "Uses"
                    technology "HTTPS"
                }
            }
            a = softwareSystem "A"
            b = softwareSystem "B"
            b -> a "" "Java"
        }
        views {
            systemLandscape "L" {
                include *
            }
        }
    }
  `;

  it("lets a relationship archetype's defaults apply to a drawn relationship", () => {
    const outcome = ok(
      edit(DEFAULTS, { type: "createRelationship", sourceId: "a", destinationId: "b" }),
    );
    expect(outcome.text).toContain("        a -> b\n");
    const created = outcome.document.workspace.relationships.find(
      (relationship) => relationship.canvasKey === "a->b",
    );
    expect(created?.description).toBe("Uses");
    expect(created?.technology).toBe("HTTPS");
    const again = edit(outcome.text, {
      type: "createRelationship",
      sourceId: "a",
      destinationId: "b",
    });
    expect(again.ok ? undefined : again.reason).toBe("relationship-exists");
  });

  it("keeps a placeholder that holds an archetype default away when it clears the last value", () => {
    const after = edited(DEFAULTS, {
      type: "updateRelationship",
      key: "b->a",
      fields: { technology: "" },
    });
    expect(after).toContain('        b -> a "" ""\n');
  });

  const CONTINUED = dsl`
    workspace {
        model {
            a = softwareSystem "A"
            b = softwareSystem "B" "Receives" \\
                "Tag"
            a -> b "Uses" \\
                "HTTP"
        }
        views {
            systemLandscape "L" {
                include *
            }
        }
    }
  `;

  it("names an unnamed relationship that can't be opened and re-opens it for a URL", () => {
    const outcome = ok(
      edit(CONTINUED, {
        type: "updateRelationship",
        key: "a->b",
        fields: { url: "https://example.com" },
      }),
    );
    expect(outcome.text).toContain(
      '        aToB = a -> b "Uses" \\\n            "HTTP"\n        !relationship aToB {\n            url "https://example.com"\n        }\n',
    );
    expect(outcome.idChanges).toEqual([{ kind: "relationship", from: "a->b", to: "aToB" }]);
  });

  it("takes the line continuation along when the last value on a continued line goes", () => {
    const after = edited(CONTINUED, { type: "updateElement", id: "b", fields: { tags: [] } });
    expect(after).toContain('        b = softwareSystem "B" "Receives"\n        a -> b');
  });

  it("excludes each of an ambiguous pair and reports the renumbered canvas keys", () => {
    const text = dsl`
      workspace {
          model {
              a = softwareSystem "A"
              b = softwareSystem "B"
              a -> b "One"
              a -> b "Two"
              a -> b "Three"
          }
          views {
              systemLandscape "L" {
                  include *
              }
              systemContext a "C" {
                  include *
              }
          }
      }
    `;
    const outcome = ok(
      edit(text, { type: "removeFromView", ids: [], relationships: ["a->b#1", "a->b#2"] }),
    );
    expect(outcome.text).toContain('aToB = a -> b "One"');
    expect(outcome.text).toContain('aToB2 = a -> b "Two"');
    expect(outcome.text).toContain('        a -> b "Three"\n');
    expect(outcome.text).toContain("            exclude aToB\n            exclude aToB2\n");
    let key = "a->b#3";
    for (const change of outcome.idChanges) if (change.from === key) key = change.to;
    expect(key).toBe("a->b");
  });

  it("renames a layout key in place when its line keeps its sorted place", () => {
    const text = dsl`
      workspace {
          model {
              a = softwareSystem "A"
              b = softwareSystem "B"
          }
          views {
              systemLandscape "L" {
                  include *
                  properties {
                      "c4modeler.element.a" "0,0"
                      "c4modeler.element.b" "400,0"
                      "team" "orders"
                  }
              }
          }
      }
    `;
    const outcome = ok(
      edit(text, { type: "renameIdentifier", id: "a", identifier: "alpha" }, { view: "L" }),
    );
    expect(outcome.edits.every((change) => change.insert === "lpha")).toBe(true);
    expect(outcome.text).toContain(
      '"c4modeler.element.alpha" "0,0"\n                "c4modeler.element.b" "400,0"\n',
    );
  });

  it("removes a view term naming an outer group whose nested groups lose their last element", () => {
    const text = dsl`
      workspace {
          model {
              properties {
                  "structurizr.groupSeparator" "/"
              }
              d = group "D" {
                  t = group "T" {
                      a = softwareSystem "A"
                  }
              }
              b = softwareSystem "B"
          }
          views {
              systemLandscape "L" {
                  include d b
              }
          }
      }
    `;
    const after = edited(text, { type: "deleteFromModel", ids: ["a"], relationships: [] });
    expect(after).toContain("            include b\n");
  });

  it("writes no implicit identifier for a field other than the name", () => {
    const text = dsl`
      workspace {
          model {
              softwareSystem "Shop"
          }
      }
    `;
    const after = edited(text, {
      type: "updateElement",
      id: "shop",
      fields: { description: "Sells" },
    });
    expect(after).toContain('        softwareSystem "Shop" "Sells"\n');
  });
});
