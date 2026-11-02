import { describe, expect, it } from "vitest";
import { deleteImpact, planSmartDelete } from "../../src/edit/smartDelete.js";
import { dsl, edited, parseWorkspace } from "./support/edit.js";

const TEXT = dsl`
  workspace {
      model {
          customer = person "Customer"
          admin = person "Admin"
          shop = softwareSystem "Shop" {
              web = container "Web"
          }
          mail = softwareSystem "Mail"
          billing = softwareSystem "Billing"
          ledger = softwareSystem "Ledger"
          customer -> shop "Uses"
          shop -> mail "Sends with"
          admin -> web "Deploys"
          ledger -> billing "Feeds"

          deploymentEnvironment "Live" {
              deploymentNode "Server" {
                  softwareSystemInstance billing
              }
          }
      }
      views {
          systemLandscape "Landscape" {
              include *
              autoLayout tb 300 160
          }
          systemContext mail "MailContext" {
              include mail
              autoLayout tb 300 160
          }
          container shop "ShopContainers" {
              include *
              autoLayout tb 300 160
          }
          dynamic * "Flow" {
              customer -> shop "Uses"
          }
      }
  }
`;

const document = parseWorkspace(TEXT);

describe("planSmartDelete", () => {
  it("deletes from the model what no other written view shows", () => {
    expect(planSmartDelete(document, "Landscape", ["ledger"], [])).toEqual({
      fromModel: { ids: ["ledger"], relationships: [] },
      fromView: { ids: [], relationships: [] },
    });
  });

  it("only removes from the view what another view, a dynamic step, an instance or a scope needs", () => {
    const plan = planSmartDelete(
      document,
      "Landscape",
      ["mail", "billing", "customer", "shop", "admin"],
      [],
    );
    expect(plan.fromView.ids).toEqual(["mail", "billing", "customer", "shop", "admin"]);
    expect(plan.fromModel.ids).toEqual([]);
  });

  it("deletes an explicit relationship nothing else shows, keeps one a dynamic step uses", () => {
    const plan = planSmartDelete(
      document,
      "Landscape",
      [],
      ["shop->mail", "customer->shop", "ledger->billing"],
    );
    expect(plan.fromModel.relationships).toEqual(["shop->mail", "ledger->billing"]);
    expect(plan.fromView.relationships).toEqual(["customer->shop"]);
  });

  it("keeps exactly the relationship a dynamic step written by its ends shows, or implies it", () => {
    const text = dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> shop "Uses"
              shop -> customer "Mails"
              customer -> web "Browses"
          }
          views {
              systemLandscape "Landscape" {
                  include *
              }
              dynamic shop "Flow" {
                  customer -> web "Browses"
              }
              dynamic * "Landscape-Flow" {
                  customer -> shop "Uses"
              }
          }
      }
    `;
    const parsed = parseWorkspace(text);
    const plan = planSmartDelete(
      parsed,
      "Landscape",
      [],
      ["customer->shop", "shop->customer", "customer->web"],
    );
    expect(plan.fromView.relationships).toEqual(["customer->shop", "customer->web"]);
    expect(plan.fromModel.relationships).toEqual(["shop->customer"]);
    expect(deleteImpact(parsed, [], ["shop->customer"]).dynamicSteps).toBe(0);
    expect(deleteImpact(parsed, [], ["customer->web"]).dynamicSteps).toBe(1);
  });

  it("removes an implied relationship from the view only", () => {
    const plan = planSmartDelete(document, "Landscape", [], ["implied:admin->shop"]);
    expect(plan.fromView.relationships).toEqual(["implied:admin->shop"]);
  });

  it("counts every written view but the current one, a draft's too", () => {
    expect(planSmartDelete(document, "SystemContext-ledger", ["ledger"], []).fromView.ids).toEqual([
      "ledger",
    ]);
  });

  it("ignores what the model doesn't have", () => {
    expect(planSmartDelete(document, "Landscape", ["nobody"], ["a->b"])).toEqual({
      fromModel: { ids: [], relationships: [] },
      fromView: { ids: [], relationships: [] },
    });
  });
});

describe("deleteImpact", () => {
  it("names descendants, views, dynamic steps and instances", () => {
    expect(deleteImpact(document, ["shop"], [])).toEqual({
      descendants: 1,
      views: ["Landscape", "ShopContainers"],
      dynamicSteps: 1,
      instances: 0,
    });
    expect(deleteImpact(document, ["billing"], [])).toMatchObject({ descendants: 0, instances: 1 });
  });
});

describe("smart delete", () => {
  it("is one edit that deletes from the model and excludes from the view together", () => {
    const after = edited(
      TEXT,
      { type: "smartDelete", ids: ["ledger", "mail"], relationships: [] },
      { view: "Landscape" },
    );
    expect(after).not.toContain('ledger = softwareSystem "Ledger"');
    expect(after).not.toContain("ledger -> billing");
    expect(after).toContain("            exclude mail\n");
  });
});
