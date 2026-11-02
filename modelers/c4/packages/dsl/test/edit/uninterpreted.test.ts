import { describe, expect, it } from "vitest";
import { uninterpretedDifference } from "../../src/edit/uninterpreted.js";
import { Intent } from "../../src/edit/verify.js";
import type { IdChange } from "../../src/types.js";
import { dsl, edit, edited, parseWorkspace } from "./support/edit.js";

const DEPLOYED = dsl`
  workspace {
      model {
          shop = softwareSystem "Shop" {
              web = container "Web"
              api = container "API"
          }
          web -> api "Calls"
          live = deploymentEnvironment "Live" {
              server = deploymentNode "Server" {
                  webInstance = containerInstance web
                  apiInstance = containerInstance api
              }
              edge = deploymentNode "Edge" {
                  proxy = infrastructureNode "Proxy"
              }
              proxy -> apiInstance "Forwards to"
          }
      }
      views {
          container shop "Containers" {
              include *
              autoLayout tb 300 160
          }
          dynamic shop "Flow" {
              web -> api "Calls"
          }
          deployment shop live "Live" {
              include *
              animation {
                  webInstance
                  apiInstance proxy
              }
          }
      }
  }
`;

function difference(
  after: string,
  intent: Intent = new Intent(),
  changes: readonly IdChange[] = [],
): string | undefined {
  return uninterpretedDifference(parseWorkspace(DEPLOYED), parseWorkspace(after), intent, changes);
}

describe("the frame condition over content the modeler doesn't draw (SPEC 3.4 step 4)", () => {
  it("holds for the text itself", () => {
    expect(difference(DEPLOYED)).toBeUndefined();
  });

  it("fails when a deployment statement changes, or moves into another block", () => {
    expect(difference(DEPLOYED.replace('"Forwards to"', '"Sends to"'))).toMatch(/Forwards to/);
    const moved = DEPLOYED.replace(
      '            }\n            proxy -> apiInstance "Forwards to"\n',
      '                proxy -> apiInstance "Forwards to"\n            }\n',
    );
    expect(parseWorkspace(moved).ok).toBe(true);
    expect(difference(moved)).toBeDefined();
  });

  it("fails when a dynamic step or an animation term changes", () => {
    expect(
      difference(DEPLOYED.replace('web -> api "Calls"\n        }', 'web -> api "Asks"\n        }')),
    ).toBeDefined();
    expect(difference(DEPLOYED.replace("apiInstance proxy", "apiInstance"))).toMatch(/proxy/);
  });

  it("reads references as the ids they resolve to, so a rename is no change", () => {
    const renamed = DEPLOYED.replace("web = container", "frontend = container")
      .replace("containerInstance web", "containerInstance frontend")
      .replace("web -> api", "frontend -> api")
      .replace("web -> api", "frontend -> api");
    expect(
      difference(renamed, new Intent(), [{ kind: "element", from: "web", to: "frontend" }]),
    ).toBeUndefined();
    expect(difference(renamed)).toBeDefined();
  });

  it("expects what names a removed element to go, with the deployment items it defines", () => {
    const intent = new Intent();
    intent.removedElements.add("api");
    const after = edited(
      DEPLOYED,
      { type: "deleteFromModel", ids: ["api"], relationships: [] },
      {
        view: "Containers",
      },
    );
    expect(after).not.toMatch(/apiInstance/);
    expect(after).toMatch(/proxy\n/);
    expect(
      uninterpretedDifference(parseWorkspace(DEPLOYED), parseWorkspace(after), intent, []),
    ).toBeUndefined();
    expect(difference(after)).toBeDefined();
  });
});

describe("animation steps the builder can't check", () => {
  const animated = DEPLOYED.replace(
    "                webInstance\n                apiInstance proxy",
    "                webInstance\n                webInstance->",
  );

  it("refuses an edit that changes what they may depend on", () => {
    for (const change of [
      { type: "deleteFromModel", ids: [], relationships: ["web->api"] },
      { type: "updateElement", id: "api", fields: { tags: ["Queue"] } },
      { type: "deleteFromModel", ids: ["api"], relationships: [] },
    ] as const) {
      const outcome = edit(animated, change, { view: "Containers" });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toBe("referenced-by-opaque");
        expect(outcome.message).toMatch(/animation step on line 31/);
      }
    }
  });

  it("allows the edits they don't depend on", () => {
    expect(
      edit(
        animated,
        { type: "updateElement", id: "api", fields: { name: "Backend" } },
        { view: "Containers" },
      ).ok,
    ).toBe(true);
    expect(
      edit(
        animated,
        { type: "renameIdentifier", id: "api", identifier: "backend" },
        { view: "Containers" },
      ).ok,
    ).toBe(true);
  });
});

describe("animation steps the builder checks", () => {
  const custom = dsl`
    workspace {
        model {
            a = element "A"
            b = element "B"
            a -> b
        }
        views {
            custom "Custom" {
                include *
                animation {
                    a
                    a->
                }
            }
        }
    }
  `;

  it("refuses an edit after which a step adds no element, as Structurizr would refuse the file", () => {
    const outcome = edit(custom, { type: "deleteFromModel", ids: [], relationships: ["a->b"] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("not-allowed");
      expect(outcome.message).toMatch(/animation step on line 11/);
    }
  });
});

describe("a workspace that includes a file", () => {
  it("refuses to add a model block, which the included file may already hold", () => {
    const text = "workspace {\n    !include model.dsl\n    views {\n    }\n}\n";
    const outcome = edit(text, {
      type: "createElement",
      kind: "person",
      name: "Customer",
      center: { x: 0, y: 0 },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("not-allowed");
  });
});

describe("identifier steps of a deployment view with an expression in its content", () => {
  const excluding = DEPLOYED.replace(
    '        deployment shop live "Live" {\n            include *\n',
    '        deployment shop live "Live" {\n            include *\n            exclude element.tag==Retired\n',
  );

  it("guards them, since an edit can change what the expression takes out of the view", () => {
    expect(excluding).toContain("exclude element.tag==Retired");
    const outcome = edit(
      excluding,
      { type: "updateElement", id: "api", fields: { tags: ["Retired"] } },
      { view: "Containers" },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("referenced-by-opaque");
    expect(
      edit(
        excluding,
        { type: "updateElement", id: "api", fields: { name: "Backend" } },
        { view: "Containers" },
      ).ok,
    ).toBe(true);
  });
});

describe("statements that name a relationship by its description or technology", () => {
  it("refuses a description edit that leaves a -/> nothing to remove", () => {
    const text = dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
                  api = container "API"
              }
              web -> api "Calls"
              live = deploymentEnvironment "Live" {
                  deploymentNode "Server" {
                      containerInstance web
                      containerInstance api
                  }
                  web -/> api "Calls" {
                  }
              }
          }
          views {
              container shop "Containers" {
                  include *
              }
          }
      }
    `;
    const outcome = edit(text, {
      type: "updateRelationship",
      key: "web->api",
      fields: { description: "Polls" },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("not-allowed");
      expect(outcome.message).toMatch(/“-\/>” on line 13/);
    }
    expect(
      edit(text, { type: "updateRelationship", key: "web->api", fields: { technology: "HTTPS" } })
        .ok,
    ).toBe(true);
  });

  it("refuses a technology edit that leaves a dynamic step without its relationship", () => {
    const text = dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
                  api = container "API"
              }
              web -> api "Streams" "gRPC"
          }
          views {
              container shop "Containers" {
                  include *
              }
              dynamic shop "Flow" {
                  web -> api "Streams" "gRPC"
              }
          }
      }
    `;
    const outcome = edit(
      text,
      { type: "updateRelationship", key: "web->api", fields: { technology: "HTTPS" } },
      { view: "Containers" },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("not-allowed");
      expect(outcome.message).toMatch(/dynamic step on line 14/);
    }
  });
});

describe("renaming an element in hierarchical mode", () => {
  it("rewrites the references to a group in its block, which is keyed under it", () => {
    const text = dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  backend = group "Backend" {
                      api = container "API"
                  }
                  web = container "Web"
              }
              shop.web -> shop.api "Calls"
          }
          views {
              container shop "Backend" {
                  include shop.backend
                  animation {
                      shop.web
                      shop.backend
                  }
              }
          }
      }
    `;
    const after = edited(text, { type: "renameIdentifier", id: "shop", identifier: "store" });
    expect(after).toContain("            include store.backend\n");
    expect(after).toContain("                store.backend\n");
    expect(after).not.toMatch(/shop\./);
  });
});
