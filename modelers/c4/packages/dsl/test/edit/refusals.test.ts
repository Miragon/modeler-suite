import { describe, expect, it } from "vitest";
import { newWorkspaceText } from "../../src/edit/skeleton.js";
import type { C4Edit, EditRefusal } from "../../src/types.js";
import { dsl, edit, type ContextOptions } from "./support/edit.js";

const SHOP = dsl`
  workspace "Shop" {
      !const OWNER "team-orders"
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop" "Sells." "\${OWNER}"
          customer -> shop
      }
      views {
          systemLandscape "Landscape" {
              include *
              autoLayout tb 300 160
          }
          filtered "Landscape" include "Element" "Everything"
          dynamic * "Flow" {
              customer -> shop
          }
      }
  }
`;

/** A relationship on the system itself, beside one of its container. */
const MOVES = dsl`
  workspace {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop" {
              web = container "Web"
              api = container "API" {
                  orders = component "Orders"
              }
          }
          crm = softwareSystem "CRM" {
              leads = container "Leads"
          }
          customer -> web "Uses"
          shop -> crm "Syncs customers"
          orders -> crm "Reads customers from"
      }
      views {
          systemLandscape "Landscape" {
              include *
              autoLayout tb 300 160
          }
          dynamic * "Flow" {
              customer -> shop "Uses"
          }
      }
  }
`;

function moveOf(key: string, to: string, end: "source" | "destination" = "source"): C4Edit {
  return { type: "moveRelationshipEnd", key, end, to };
}

interface Refusal {
  readonly name: string;
  readonly text?: string;
  readonly edit: C4Edit;
  readonly options?: ContextOptions;
  readonly reason: EditRefusal;
  readonly message?: RegExp;
}

const REFUSALS: readonly Refusal[] = [
  {
    name: "a field set with a constant",
    text: dsl`
      workspace {
          !const NAME "Shop"
          model {
              shop = softwareSystem "\${NAME}"
          }
      }
    `,
    edit: { type: "updateElement", id: "shop", fields: { name: "Store" } },
    reason: "field-not-editable",
    message: /Set with “\$\{NAME\}”\. Edit the constant in the text\./,
  },
  {
    name: "tags set with a constant",
    edit: { type: "updateElement", id: "shop", fields: { tags: ["Internal"] } },
    reason: "field-not-editable",
  },
  {
    name: "a field the kind lacks",
    edit: { type: "updateElement", id: "customer", fields: { technology: "Java" } },
    reason: "field-not-editable",
  },
  {
    name: "a backslash before n",
    edit: { type: "updateElement", id: "customer", fields: { description: "a\\nb" } },
    reason: "unrepresentable-value",
    message: /can't be stored in the DSL/,
  },
  {
    name: "a backslash at the end",
    edit: { type: "updateElement", id: "customer", fields: { description: "C:\\" } },
    reason: "unrepresentable-value",
  },
  {
    name: "a value Structurizr reads as a constant",
    edit: { type: "updateElement", id: "customer", fields: { name: "${OWNER}" } },
    reason: "unrepresentable-value",
  },
  {
    name: "a tag with a comma",
    edit: { type: "updateElement", id: "customer", fields: { tags: ["a,b"] } },
    reason: "unrepresentable-value",
  },
  {
    name: "an empty name",
    edit: { type: "updateElement", id: "customer", fields: { name: "  " } },
    reason: "unrepresentable-value",
  },
  {
    name: "an invalid URL",
    edit: { type: "updateElement", id: "customer", fields: { url: "not a url" } },
    reason: "unrepresentable-value",
  },
  {
    name: "a taken name",
    edit: { type: "createElement", kind: "softwareSystem", name: "Shop", center: { x: 0, y: 0 } },
    options: { view: "Landscape" },
    reason: "name-taken",
    message: /^A software system named Shop already exists\.$/,
  },
  {
    name: "an identifier with a space",
    edit: { type: "renameIdentifier", id: "shop", identifier: "the shop" },
    reason: "identifier-invalid",
  },
  {
    name: "an identifier that is a keyword",
    edit: { type: "renameIdentifier", id: "shop", identifier: "softwareSystem" },
    reason: "identifier-invalid",
  },
  {
    name: "a dotted identifier",
    edit: { type: "renameIdentifier", id: "shop", identifier: "a.b" },
    reason: "identifier-invalid",
  },
  {
    name: "a taken identifier, in any case",
    edit: { type: "renameIdentifier", id: "shop", identifier: "CUSTOMER" },
    reason: "identifier-taken",
    message: /^The identifier “CUSTOMER” is already in use\. Choose another one\.$/,
  },
  {
    name: "a delete a script may depend on",
    text: dsl`
      workspace {
          model {
              payments = softwareSystem "Payments"
          }
          !script groovy {
              workspace.model.getSoftwareSystemWithName("x")
              println payments
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["payments"], relationships: [] },
    reason: "referenced-by-opaque",
    message: /line 5 may use payments/,
  },
  {
    name: "a rename a bulk expression may depend on",
    text: dsl`
      workspace {
          model {
              payments = softwareSystem "Payments"
              !elements "element.parent==payments" {
                  tags "Inner"
              }
          }
      }
    `,
    edit: { type: "renameIdentifier", id: "payments", identifier: "billing" },
    reason: "referenced-by-opaque",
  },
  {
    name: "deleting the base of a filtered view",
    edit: { type: "deleteView", key: "Landscape" },
    reason: "view-in-use",
    message: /The filtered view Everything is based on this view\./,
  },
  {
    name: "creating in a dynamic view",
    edit: { type: "createElement", kind: "person", center: { x: 0, y: 0 } },
    options: { view: "Flow" },
    reason: "view-not-editable",
  },
  {
    name: "a container in a landscape",
    edit: { type: "createElement", kind: "container", center: { x: 0, y: 0 } },
    options: { view: "Landscape" },
    reason: "not-allowed",
  },
  {
    name: "an append from an element the model doesn't have",
    edit: { type: "createElement", kind: "person", center: { x: 0, y: 0 }, connectFrom: "nobody" },
    options: { view: "Landscape" },
    reason: "not-allowed",
  },
  {
    name: "an append of a component from the container it goes into",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  api = container "API"
              }
          }
          views {
              component api "ApiComponents" {
                  include *
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "component", center: { x: 0, y: 0 }, connectFrom: "api" },
    options: { view: "ApiComponents" },
    reason: "not-allowed",
    message: /Structurizr refuses a relationship between an element and its parent or child\./,
  },
  {
    name: "a relationship to itself",
    edit: { type: "createRelationship", sourceId: "shop", destinationId: "shop" },
    options: { view: "Landscape" },
    reason: "not-allowed",
  },
  {
    name: "a second relationship without a description",
    edit: { type: "createRelationship", sourceId: "customer", destinationId: "shop" },
    options: { view: "Landscape" },
    reason: "relationship-exists",
    message: /^These are already connected by a relationship without a description\.$/,
  },
  {
    name: "a relationship an implied one already makes",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> web
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createRelationship", sourceId: "customer", destinationId: "shop" },
    options: { view: "Landscape" },
    reason: "relationship-exists",
    message: /^An implied relationship already connects these\. Give the new one a description\.$/,
  },
  {
    name: "a relationship between a system and its container",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
          }
          views {
              container shop "Containers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createRelationship", sourceId: "web", destinationId: "shop" },
    options: { view: "Containers" },
    reason: "not-allowed",
  },
  {
    name: "editing an implied relationship",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> web
          }
      }
    `,
    edit: {
      type: "updateRelationship",
      key: "implied:customer->shop",
      fields: { description: "x" },
    },
    reason: "not-allowed",
  },
  {
    name: "removing a context view's system from it",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop"
          }
          views {
              systemContext shop "Context" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "removeFromView", ids: ["shop"], relationships: [] },
    options: { view: "Context" },
    reason: "not-allowed",
  },
  {
    name: "a text that stops the canvas",
    text: 'workspace {\n    model {\n        a = person "A"\n',
    edit: { type: "updateWorkspace", fields: { name: "X" } },
    reason: "not-allowed",
  },
  {
    name: "three quotes in a text block",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" """
                  Sells.
                  """
          }
      }
    `,
    edit: { type: "updateElement", id: "shop", fields: { description: 'a """ b' } },
    reason: "unrepresentable-value",
  },
  {
    name: "a relationship URL Structurizr can't open",
    edit: { type: "updateRelationship", key: "customer->shop", fields: { url: "example" } },
    reason: "unrepresentable-value",
    message: /full address/,
  },
  {
    name: "deleting the last element of a group a bulk statement names",
    text: dsl`
      workspace {
          model {
              u = person "U"
              team = group "Team" {
                  a = softwareSystem "A"
              }
              !elements team {
                  u -> this "Uses"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["a"], relationships: [] },
    reason: "referenced-by-opaque",
  },
  {
    name: "moving an end of a relationship the model lacks",
    text: MOVES,
    edit: moveOf("web->crm", "orders"),
    reason: "not-allowed",
    message: /^There is no such relationship in the model\.$/,
  },
  {
    name: "moving an end of an implied relationship",
    text: MOVES,
    edit: moveOf("implied:customer->shop", "web", "destination"),
    reason: "not-allowed",
    message: /^An implied relationship comes from another one\. Move that relationship instead\.$/,
  },
  {
    name: "moving an end to an element the model lacks",
    text: MOVES,
    edit: moveOf("shop->crm", "nobody"),
    reason: "not-allowed",
    message: /^There is no element nobody in the model\.$/,
  },
  {
    name: "moving an end to an element that isn't inside it",
    text: MOVES,
    edit: moveOf("shop->crm", "leads"),
    reason: "not-allowed",
    message: /^Leads isn't inside Shop\.$/,
  },
  {
    name: "moving an end to a grandchild",
    text: MOVES,
    edit: moveOf("shop->crm", "orders"),
    reason: "not-allowed",
    message: /^Orders isn't inside Shop\.$/,
  },
  {
    name: "moving an end where an implied relationship with that description exists",
    text: MOVES.replace('"Syncs customers"', '"Reads customers from"'),
    edit: moveOf("shop->crm", "api"),
    reason: "relationship-exists",
    message: /^API → CRM exists already with this description\.$/,
  },
  {
    name: "moving an end of a relationship a dynamic step shows",
    text: MOVES.replace('customer -> shop "Uses"', 'shop -> crm "Syncs customers"'),
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message:
      /^The dynamic view “Flow” shows this relationship, and its step would no longer match it\. Edit the text instead\.$/,
  },
  {
    name: "moving an end of a relationship re-opened by its canonical name",
    text: MOVES.replace(
      '        orders -> crm "Reads customers from"\n',
      '        orders -> crm "Reads customers from"\n        !relationship "Relationship://SoftwareSystem://Shop -> SoftwareSystem://CRM (Syncs customers)" {\n            tag "Nightly"\n        }\n',
    ),
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message:
      /^The “!relationship” on line 16 names this relationship by its ends, so it would no longer find it\. Edit the text instead\.$/,
  },
  {
    name: "moving an end while a !relationships statement selects by ends",
    text: MOVES.replace(
      '        orders -> crm "Reads customers from"\n',
      '        orders -> crm "Reads customers from"\n        !relationships "*->crm" {\n            tag "Inbound"\n        }\n',
    ),
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message: /^The “!relationships” on line 16 selects relationships by their ends/,
  },
  {
    name: "moving an end written with a constant",
    text: MOVES.replace("workspace {\n", 'workspace {\n    !const SHOP "shop"\n').replace(
      "shop -> crm",
      "${SHOP} -> crm",
    ),
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message: /^This end is set with the constant “\$\{SHOP\}”\. Edit the text instead\.$/,
  },
  {
    name: "moving an end to a child defined below the relationship",
    text: dsl`
      workspace {
          model {
              crm = softwareSystem "CRM"
              shop = softwareSystem "Shop" {
                  -> crm "Syncs customers"
                  web = container "Web"
              }
          }
      }
    `,
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message:
      /^Web is defined below this relationship, and Structurizr reads top to bottom\. Move the relationship below Web in the text, or choose another container\.$/,
  },
  {
    name: "moving an end so that a dynamic step would show it instead of what it shows",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              crm = softwareSystem "CRM"
              shop -> crm "Syncs customers"
              web -> crm "Reads customers from"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
              dynamic shop "Lookup" {
                  web -> crm "Asks for a customer"
              }
          }
      }
    `,
    edit: moveOf("shop->crm", "web"),
    reason: "not-allowed",
    message:
      /^The step on line 16 of the dynamic view “Lookup” would show another relationship once this one moves\. Edit the text instead\.$/,
  },
  {
    name: "moving an end in a view the canvas can't edit",
    text: MOVES,
    edit: moveOf("shop->crm", "web"),
    options: { view: "Flow" },
    reason: "view-not-editable",
  },
  {
    name: "an example over existing work",
    edit: { type: "insertExample", exampleText: "workspace {\n}\n" },
    reason: "not-allowed",
  },
  {
    name: "an example over a new workspace whose styles the user extended",
    text: newWorkspaceText().replace(
      "        styles {\n",
      '        styles {\n            element "Database" {\n                shape cylinder\n            }\n',
    ),
    edit: { type: "insertExample", exampleText: "workspace {\n}\n" },
    reason: "not-allowed",
  },
];

describe("refused edits", () => {
  for (const refusal of REFUSALS) {
    it(refusal.name, () => {
      const outcome = edit(refusal.text ?? SHOP, refusal.edit, refusal.options);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.reason).toBe(refusal.reason);
      if (refusal.message) expect(outcome.message).toMatch(refusal.message);
    });
  }

  it("never throws, also for edits that name nothing", () => {
    const edits: C4Edit[] = [
      { type: "updateElement", id: "nobody", fields: { name: "X" } },
      { type: "updateRelationship", key: "a->b", fields: { description: "x" } },
      { type: "renameIdentifier", id: "nobody", identifier: "somebody" },
      { type: "deleteFromModel", ids: ["nobody"], relationships: [] },
      { type: "deleteView", key: "Nowhere" },
      { type: "updateView", key: "Nowhere", fields: { title: "x" } },
      { type: "createView", viewType: "container", scopeId: "customer" },
      {
        type: "setLayout",
        boxes: new Map([["nobody", { x: 0, y: 0, width: 1, height: 1 }]]),
        vertices: new Map(),
      },
    ];
    for (const change of edits) {
      const outcome = edit(SHOP, change, { view: "Landscape" });
      expect(outcome.ok).toBe(false);
    }
  });
});
