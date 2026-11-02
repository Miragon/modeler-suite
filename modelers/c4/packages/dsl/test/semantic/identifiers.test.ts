import { describe, expect, it } from "vitest";
import { semanticSources } from "../../src/semantic/index.js";
import { codes, dsl, model, parse } from "./support/parse.js";

const ids = (text: string) => parse(text).workspace.elements.map((element) => element.id);

describe("element ids (SPEC 3.3)", () => {
  it("keeps an explicit identifier as defined, its spelling included", () => {
    const result = parse(model('PaymentApi = softwareSystem "Payments"'));
    expect(result.workspace.elements[0]).toMatchObject({
      id: "PaymentApi",
      identifier: "PaymentApi",
      implicit: false,
    });
  });

  it("derives an implicit identifier for an anonymous element after every explicit one is registered", () => {
    const text = model(dsl`
      softwareSystem "Payments"
      payments = person "Payment clerk"
      person "Payments"
      softwareSystem "Model"
      softwareSystem "3D Viewer"
    `);
    expect(ids(text)).toEqual([
      "payments2",
      "payments",
      "payments3",
      "model2",
      "softwareSystem3dViewer",
    ]);
    expect(parse(text).workspace.elements[0]).toMatchObject({
      identifier: undefined,
      implicit: true,
    });
  });

  it("avoids archetype names, group, relationship and deployment identifiers", () => {
    const text = model(dsl`
      archetypes {
          service = softwareSystem
      }
      grp = group "G" {
      }
      a = person "A"
      b = person "B"
      uses = a -> b
      live = deploymentEnvironment "Live" {
      }
      softwareSystem "Service"
      softwareSystem "Grp"
      softwareSystem "Uses"
      softwareSystem "Live"
    `);
    expect(ids(text).slice(2)).toEqual(["service2", "grp2", "uses2", "live2"]);
  });

  it("is stable when an element is added below, and shifts only for a same-named one above", () => {
    const base = model('softwareSystem "Payments"\nsoftwareSystem "Orders"');
    const below = model('softwareSystem "Payments"\nsoftwareSystem "Orders"\nperson "Payments"');
    expect(ids(base)).toEqual(["payments", "orders"]);
    expect(ids(below)).toEqual(["payments", "orders", "payments2"]);
  });

  it("keys hierarchical identifiers under the parent's id, implicit ones included", () => {
    const text = dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web" {
                      component "Login"
                  }
                  container "API"
              }
              softwareSystem "Anonymous" {
                  inner = container "Inner"
                  container "Web"
              }
          }
      }
    `;
    expect(ids(text)).toEqual([
      "shop",
      "shop.web",
      "shop.web.login",
      "shop.api",
      "anonymous",
      "anonymous.inner",
      "anonymous.web",
    ]);
  });

  it("resolves a relative reference inside an element block by walking up the parents", () => {
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
              user = person "User"
              user -> shop.web "Uses"
          }
      }
    `;
    const result = parse(text);
    expect(codes(text)).toEqual([]);
    expect(
      result.workspace.relationships
        .filter((relationship) => !relationship.implied)
        .map((relationship) => relationship.key),
    ).toEqual(["shop.api->shop.web", "user->shop.web"]);
  });

  it("needs the full key outside the element blocks in hierarchical mode", () => {
    const text = dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              user = person "User"
              user -> web "Uses"
          }
      }
    `;
    expect(codes(text)).toEqual(["error:unresolved-reference"]);
  });

  it("keys a system's or a container's group under its parent in hierarchical mode, a model-level one flat", () => {
    const text = dsl`
      workspace {
          !identifiers hierarchical
          model {
              team = group "Team" {
                  user = person "User"
              }
              Shop = softwareSystem "Shop" {
                  Backend = group "Backend" {
                      api = container "API"
                  }
              }
          }
          views {
              container shop "Backend" {
                  include shop.backend
              }
              systemLandscape "Landscape" {
                  include team
              }
          }
      }
    `;
    const result = parse(text);
    expect(codes(text)).toEqual([]);
    expect(result.workspace.groups.map((group) => group.identifier)).toEqual([
      "team",
      "Shop.Backend",
    ]);
    const sources = semanticSources(result.sources);
    expect(sources?.groups().map((group) => group.identifier)).toEqual(["team", "Shop.Backend"]);
    expect(
      sources
        ?.allReferences()
        .filter((reference) => reference.target.kind === "group")
        .map((reference) => reference.target),
    ).toEqual([
      { kind: "group", path: "Backend", identifier: "Shop.Backend" },
      { kind: "group", path: "Team", identifier: "team" },
    ]);
    expect(codes(text.replace("include shop.backend", "include backend"))).toEqual([
      "error:unresolved-reference",
    ]);
  });

  it("registers identifiers written in deployment contexts, so a duplicate rejects and a re-open finds them", () => {
    const text = (person: string) =>
      model(dsl`
        shop = softwareSystem "Shop" {
            api = container "API"
        }
        live = deploymentEnvironment "Live" {
            servers = group "Servers" {
                server = deploymentNode "Server" {
                    proxy = infrastructureNode "Proxy"
                    apiInstance = containerInstance api
                }
            }
            forwards = proxy -> apiInstance "Forwards to"
        }
        !relationship forwards {
            tag "Proxied"
        }
        ${person}
      `);
    expect(codes(text(""))).toEqual([]);
    expect(codes(text('servers = person "Servers"'))).toEqual(["error:duplicate-identifier!"]);
    expect(codes(text('forwards = person "Forwards"'))).toEqual(["error:duplicate-identifier!"]);
  });

  it("switches the mode mid-model and reads each element in the mode of its position", () => {
    const text = model(dsl`
      flat = softwareSystem "Flat" {
          one = container "One"
      }
      !identifiers hierarchical
      deep = softwareSystem "Deep" {
          two = container "Two"
      }
      !element flat {
          three = container "Three"
      }
    `);
    expect(ids(text)).toEqual(["flat", "one", "deep", "deep.two", "flat.three"]);
    const sources = parse(text).sources;
    expect(sources.identifierModeAt(text.indexOf("flat ="))).toBe("flat");
    expect(sources.identifierModeAt(text.indexOf("deep ="))).toBe("hierarchical");
  });

  it("looks identifiers up case-insensitively and keeps the defining spelling as the id", () => {
    const text = model('Shop = softwareSystem "Shop"\nuser = person "User"\nUSER -> SHOP "Uses"');
    const result = parse(text);
    expect(codes(text)).toEqual([]);
    expect(result.workspace.relationships[0]).toMatchObject({
      sourceId: "user",
      destinationId: "Shop",
      key: "user->Shop",
    });
  });
});
