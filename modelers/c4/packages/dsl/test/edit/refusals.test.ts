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
    message: /Set with \$\{NAME\}\. Edit the constant in the text\./,
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
