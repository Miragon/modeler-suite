import { describe, expect, it } from "vitest";
import {
  childElements,
  endsWithChildren,
  hiddenScopeRelationships,
} from "../src/views/hiddenRelationships.js";
import { viewCatalog } from "../src/views/catalog.js";
import type { Relationship, ViewEntry, Workspace } from "../src/types.js";
import {
  component,
  container,
  person,
  relationship,
  system,
  view,
  workspace,
} from "./support/model.js";

const ELEMENTS = [
  person("customer"),
  system("shop"),
  container("web", "shop"),
  container("api", "shop"),
  component("orders", "api"),
  component("search", "api"),
  system("crm"),
  container("crmApi", "crm"),
  system("mail"),
];

const VIEWS = [
  view("Landscape", "systemLandscape"),
  view("Context", "systemContext", { scope: "shop" }),
  view("Containers", "container", { scope: "shop" }),
  view("Components", "component", { scope: "api" }),
];

function model(...relationships: Relationship[]): Workspace {
  return workspace({ elements: ELEMENTS, relationships, views: VIEWS });
}

function entry(model: Workspace, key: string): ViewEntry {
  const found = viewCatalog(model).resolve(key);
  if (found === undefined) throw new Error(`no view ${key}`);
  return found;
}

function hidden(model: Workspace, key: string): string[] {
  return hiddenScopeRelationships(model, entry(model, key)).map(
    ({ relationship: { canvasKey }, end }) => `${canvasKey} (${end})`,
  );
}

describe("relationships on the scope that its container or component view can't draw", () => {
  it("finds one on the system itself, as source and as destination", () => {
    const shop = model(
      relationship("web", "api"),
      relationship("shop", "crm", { description: "Syncs" }),
      relationship("mail", "shop", { description: "Bounces" }),
    );
    expect(hidden(shop, "Containers")).toEqual(["shop->crm (source)", "mail->shop (destination)"]);
  });

  it("finds none in a landscape or a context view, which draw it", () => {
    const shop = model(relationship("shop", "crm"));
    expect(hidden(shop, "Landscape")).toEqual([]);
    expect(hidden(shop, "Context")).toEqual([]);
  });

  it("leaves one out that a container already shows in the same direction", () => {
    const shop = model(relationship("shop", "crm"), relationship("web", "crm"));
    expect(hidden(shop, "Containers")).toEqual([]);
  });

  it("counts an implied line from a container to an element inside the other end", () => {
    const shop = model(relationship("shop", "crm"), relationship("web", "crmApi"));
    expect(hidden(shop, "Containers")).toEqual([]);
  });

  it("keeps one whose other end the view draws only the other way round", () => {
    const shop = model(relationship("shop", "crm"), relationship("crm", "web"));
    expect(hidden(shop, "Containers")).toEqual(["shop->crm (source)"]);
  });

  it("keeps one whose detail the view excludes", () => {
    const excluding = workspace({
      elements: ELEMENTS,
      relationships: [relationship("shop", "crm"), relationship("web", "crm")],
      views: [view("Containers", "container", { scope: "shop", statements: ["include web api"] })],
    });
    expect(hidden(excluding, "Containers")).toEqual(["shop->crm (source)"]);
  });

  it("finds the scope container's own relationships in a component view", () => {
    const shop = model(
      relationship("api", "mail", { description: "Sends" }),
      relationship("web", "api", { description: "Calls" }),
      relationship("web", "orders", { description: "Places orders" }),
    );
    expect(hidden(shop, "Components")).toEqual(["api->mail (source)"]);
  });

  it("never counts an implied relationship of the scope", () => {
    const shop = model(relationship("orders", "mail"));
    expect(hidden(shop, "Components")).toEqual([]);
    expect(hidden(shop, "Containers")).toEqual([]);
  });
});

describe("the ends a relationship drawn a level up could move down", () => {
  it("offers a software system with containers in a landscape and a context view", () => {
    const shop = model(relationship("shop", "crm"), relationship("customer", "mail"));
    const [moved, other] = shop.relationships;
    for (const key of ["Landscape", "Context"]) {
      expect(
        endsWithChildren(shop, moved!, entry(shop, key)).map(({ elementId, end }) => [
          elementId,
          end,
        ]),
      ).toEqual([
        ["shop", "source"],
        ["crm", "destination"],
      ]);
      expect(endsWithChildren(shop, other!, entry(shop, key))).toEqual([]);
    }
  });

  it("offers a container with components in a container view, not a system", () => {
    const shop = model(relationship("api", "web"), relationship("shop", "crm"));
    const [apiToWeb, shopToCrm] = shop.relationships;
    expect(
      endsWithChildren(shop, apiToWeb!, entry(shop, "Containers")).map(
        ({ elementId }) => elementId,
      ),
    ).toEqual(["api"]);
    expect(endsWithChildren(shop, shopToCrm!, entry(shop, "Containers"))).toEqual([]);
  });

  it("offers nothing for an implied relationship", () => {
    const shop = model(relationship("web", "crm"));
    const implied = shop.relationships.find((candidate) => candidate.implied)!;
    expect(implied.sourceId).toBe("shop");
    expect(endsWithChildren(shop, implied, entry(shop, "Landscape"))).toEqual([]);
  });

  it("lists a system's containers in document order", () => {
    expect(childElements(model(), "shop").map(({ id }) => id)).toEqual(["web", "api"]);
    expect(childElements(model(), "mail")).toEqual([]);
  });
});
