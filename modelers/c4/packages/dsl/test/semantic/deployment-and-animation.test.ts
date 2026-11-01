import { viewCatalog, viewMembers } from "@miragon/c4-schema-model";
import { describe, expect, it } from "vitest";
import { semanticSources } from "../../src/semantic/index.js";
import { codes, diagnostics, dsl, errors, parse } from "./support/parse.js";

const NO_RELATIONSHIP = dsl`
  workspace {
      model {
          shop = softwareSystem "Shop" {
              web = container "Web"
              api = container "API"
          }
          web -> api "Calls"
          live = deploymentEnvironment "Live" {
              deploymentNode "Server" {
                  webInstance = containerInstance web
                  containerInstance api
              }
              web -/> api {
              }
          }
      }
  }
`;

function sources(text: string) {
  const result = semanticSources(parse(text).sources);
  if (result === undefined) throw new Error("no source index");
  return result;
}

describe("-/> in a deployment environment (R-DSL §6.5)", () => {
  it("reads `a -/> b {` with its references, though the syntax tree leaves the brace out", () => {
    const index = sources(NO_RELATIONSHIP);
    const statement = index.statements.find((candidate) => candidate.tokens[1]?.value === "-/>");
    expect(statement && index.roleOf(statement)).toBe("noRelationship");
    expect(
      index.references("web").filter((reference) => reference.kind === "no-relationship"),
    ).toHaveLength(1);
    expect(codes(NO_RELATIONSHIP)).toEqual([]);
  });

  it("reports a -/> that finds no relationship to remove, as Structurizr refuses it", () => {
    const text = NO_RELATIONSHIP.replace('        web -> api "Calls"\n', "");
    expect(codes(text)).toEqual(["error:invalid-statement"]);
    expect(diagnostics(text, "invalid-statement")[0]?.line).toBe(12);
  });

  it("matches the description when the -/> names one", () => {
    expect(codes(NO_RELATIONSHIP.replace("web -/> api {", 'web -/> api "Calls" {'))).toEqual([]);
    expect(codes(NO_RELATIONSHIP.replace("web -/> api {", 'web -/> api "Polls" {'))).toEqual([
      "error:invalid-statement",
    ]);
  });

  it("takes an instance for its element and refuses an end without an instance", () => {
    expect(codes(NO_RELATIONSHIP.replace("web -/> api {", "webInstance -/> api {"))).toEqual([]);
    expect(codes(NO_RELATIONSHIP.replace("web -/> api {", "shop -/> api {"))).toEqual([
      "error:invalid-statement",
    ]);
  });

  it("counts only relationships written above it", () => {
    const text = NO_RELATIONSHIP.replace('        web -> api "Calls"\n', "").replace(
      "    }\n}",
      '        web -> api "Calls"\n    }\n}',
    );
    expect(codes(text)).toEqual(["error:invalid-statement"]);
  });
});

describe("animation steps (StaticView, CustomView and DeploymentView addAnimation)", () => {
  const animated = (steps: string, extra = "") => dsl`
    workspace {
        model {
            a = softwareSystem "A"
            b = softwareSystem "B"
            c = softwareSystem "C"
            a -> b
        }
        views {
            systemLandscape "Landscape" {
                include *
                ${extra}
                animation {
                    ${steps}
                }
            }
        }
    }
  `;

  it("follows coupling expressions: a step that adds nothing new is refused", () => {
    expect(errors(animated("a->\n                    c"))).toEqual([]);
    expect(errors(animated("a->\n                    b"))).toEqual(["invalid-statement"]);
  });

  it("refuses a step whose elements an exclude took out of the view", () => {
    expect(errors(animated("a\n                    b", "exclude b"))).toEqual([
      "invalid-statement",
    ]);
  });

  it("refuses `*`, which names no element", () => {
    expect(errors(animated("*\n                    a"))).toEqual(["invalid-statement"]);
  });

  it("checks custom views against the custom elements they show", () => {
    const text = (steps: string) => dsl`
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
                      ${steps}
                  }
              }
          }
      }
    `;
    expect(errors(text("a\n                      a->"))).toEqual([]);
    expect(errors(text("a->\n                      b"))).toEqual(["invalid-statement"]);
  });

  const deployment = (steps: string) => dsl`
    workspace {
        model {
            shop = softwareSystem "Shop" {
                web = container "Web"
                db = container "Database"
            }
            web -> db
            live = deploymentEnvironment "Live" {
                deploymentNode "Server" {
                    webInstance = containerInstance web
                    dbInstance = containerInstance db
                }
            }
        }
        views {
            deployment shop live "Live" {
                include *
                animation {
                    ${steps}
                }
            }
        }
    }
  `;

  it("checks identifier steps of a deployment view: a container names its instances", () => {
    expect(errors(deployment("web\n                    dbInstance"))).toEqual([]);
    expect(errors(deployment("webInstance\n                    web"))).toEqual([
      "invalid-statement",
    ]);
  });

  it("leaves expression steps of a deployment view unchecked, for the edit layer to guard", () => {
    const text = deployment("web\n                    webInstance->");
    expect(errors(text)).toEqual([]);
    expect(
      sources(text)
        .uncheckedAnimationSteps()
        .map((step) => step.view),
    ).toEqual(["Live"]);
    expect(sources(animated("a->\n                    c")).uncheckedAnimationSteps()).toEqual([]);
  });

  it("leaves identifier steps unchecked when an expression decides what the deployment view shows", () => {
    const text = deployment("web\n                    dbInstance").replace(
      "            include *\n",
      "            include *\n            exclude element.tag==Retired\n",
    );
    expect(text).toContain("exclude element.tag==Retired");
    expect(errors(text)).toEqual([]);
    expect(
      sources(text)
        .uncheckedAnimationSteps()
        .map((step) => step.view),
    ).toEqual(["Live", "Live"]);
  });

  it("checks nothing in an open world, where included content may hold what a step names", () => {
    const text = animated("a->\n                    b").replace(
      "workspace {",
      "workspace {\n    !include more.dsl",
    );
    expect(errors(text)).toEqual([]);
    expect(sources(text).uncheckedAnimationSteps()).toEqual([]);
  });
});

describe("groups named by a view term (ElementGroup.getElements)", () => {
  const text = dsl`
    workspace {
        model {
            properties {
                "structurizr.groupSeparator" "/"
            }
            shop = softwareSystem "Shop"
            team = group "Team" {
                inner = group "Inner" {
                    api = softwareSystem "API"
                }
                bank = element "Bank"
                !element shop {
                    description "Moved into the group"
                }
            }
        }
        views {
            systemLandscape "Team" {
                include team
            }
        }
    }
  `;

  it("holds the elements written in the group's block and its inner groups, no custom element", () => {
    const { workspace } = parse(text);
    expect(workspace.groups.map((group) => [group.path, group.members])).toEqual([
      ["Team", ["api"]],
      ["Team/Inner", ["api"]],
    ]);
    const entry = viewCatalog(workspace).resolve("Team");
    expect(entry && viewMembers(workspace, entry).elements).toEqual(["api"]);
  });

  it("still frames a custom or moved element by its group name", () => {
    const { workspace } = parse(text);
    expect(workspace.elements.map((element) => [element.id, element.group])).toEqual([
      ["shop", "Team"],
      ["api", "Team/Inner"],
      ["bank", "Team"],
    ]);
  });
});

describe("a views block above the model", () => {
  it("keeps a view whose `*` or expression Structurizr runs before any element exists read-only", () => {
    const text = dsl`
      workspace {
          views {
              systemLandscape "All" {
                  include *
              }
              systemLandscape "People" {
                  include element.type==Person
              }
          }
          model {
              user = person "User"
              shop = softwareSystem "Shop"
          }
      }
    `;
    const { workspace } = parse(text);
    expect(workspace.views.map((view) => [view.key, view.editable, view.readOnlyReason])).toEqual([
      ["All", false, "expression"],
      ["People", false, "expression"],
    ]);
    expect(diagnostics(text, "unsupported-expression").map((item) => item.severity)).toEqual([
      "warning",
      "warning",
    ]);
  });
});
