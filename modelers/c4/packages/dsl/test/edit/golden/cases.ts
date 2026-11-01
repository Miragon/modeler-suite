/*
 * Golden before/after pairs of the edit layer (SPEC 9.1 "Edits"), one per placement rule of 3.5
 * and per critique-round case. Each `<name>.after.dsl` beside this file is the reviewed result;
 * `UPDATE_GOLDENS=1` rewrites them, and the snapshot script's `--edits` mode runs every one of
 * them through Structurizr 6.2.4 (`edit-acceptance.json`).
 */
import { readFileSync } from "node:fs";
import type { EditNotice } from "../../../src/types.js";
import type { C4Edit } from "../../../src/types.js";
import { box, dsl, type ContextOptions } from "../support/edit.js";

export interface GoldenCase {
  readonly name: string;
  readonly before: string;
  readonly edit: C4Edit;
  readonly options?: ContextOptions;
  readonly notices?: readonly EditNotice[];
  /** The outcome's view, when it is not the context's. */
  readonly view?: string;
}

export const BIG_BANK = readFileSync(
  new URL("../../fixtures/structurizr/big-bank-plc.dsl", import.meta.url),
  "utf8",
);

const SHOP = dsl`
  workspace "Shop" {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop" "Sells."
          customer -> shop "Buys from"
      }
      views {
          systemContext shop "ShopContext" {
              include *
              autoLayout tb
          }
      }
  }
`;

const LANDSCAPE = dsl`
  workspace "Shop" {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop"
          customer -> shop "Uses"
      }
      views {
          systemLandscape "Landscape" {
              include *
              autoLayout lr
          }
      }
  }
`;

const PINNED = dsl`
  workspace "Shop" {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop"
          customer -> shop "Uses"
      }
      views {
          systemLandscape "Landscape" {
              include *
              properties {
                  "c4modeler.element.customer" "0,0"
                  "c4modeler.element.shop" "400,0"
              }
          }
      }
  }
`;

const CONTAINERS = dsl`
  workspace "Shop" {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop" {
              web = container "Web" "Serves pages." "Java"
              api = container "API" {
                  orders = component "Orders"
              }
          }
          customer -> web "Uses"
          web -> api "Calls"
      }
      views {
          container shop "ShopContainers" {
              include *
              autoLayout tb
          }
          component api "ApiComponents" {
              include *
              autoLayout tb
          }
      }
  }
`;

const LANDSCAPE_BOXES = { customer: box(0, 0, 216, 216), shop: box(400, 28) };

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    name: "create-person-after-people",
    before: LANDSCAPE,
    edit: { type: "createElement", kind: "person", center: { x: 200, y: 400 } },
    options: { view: "Landscape", boxes: LANDSCAPE_BOXES },
  },
  {
    name: "create-system-not-into-group",
    before: dsl`
      workspace {
          model {
              group "Internal" {
                  billing = softwareSystem "Billing"
              }
              clerk = person "Clerk"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: {
      type: "createElement",
      kind: "softwareSystem",
      name: "Payments",
      center: { x: 120, y: 80 },
    },
    options: { view: "Landscape" },
  },
  {
    name: "create-first-element-after-directives",
    before: dsl`
      workspace "Directives" {
          model {
              !identifiers flat
              properties {
                  "structurizr.groupSeparator" "/"
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "person", name: "Visitor", center: { x: 108, y: 108 } },
    options: { view: "SystemLandscape" },
  },
  {
    name: "create-first-element-in-blank-file",
    before: "",
    edit: { type: "createElement", kind: "person", name: "Visitor", center: { x: 108, y: 108 } },
    options: { view: "SystemLandscape" },
  },
  {
    name: "create-container-one-liner-to-block",
    before: SHOP,
    edit: { type: "createElement", kind: "container", center: { x: 400, y: 300 } },
    options: { view: "Containers-shop", seed: 3 },
  },
  {
    name: "create-container-after-containers",
    before: dsl`
      workspace {
          model {
              payments = softwareSystem "Payments"
              shop = softwareSystem "Shop" {
                  description "Sells."
                  web = container "Web"
                  group "Data" {
                      db = container "DB"
                  }
                  -> payments "Pays with"
              }
          }
          views {
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "container", name: "API", center: { x: 0, y: 0 } },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-container-after-properties",
    before: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  description "Sells."
                  tags "Internal"
                  properties {
                      "owner" "team"
                  }
              }
          }
          views {
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "container", name: "Web", center: { x: 0, y: 0 } },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-container-text-block-fallback",
    before: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" """
                  Sells books
                  and maps.
                  """
          }
          views {
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "container", name: "Web", center: { x: 0, y: 0 } },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-container-continued-fallback",
    before: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" \\
                  "Sells books."
          }
          views {
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "container", name: "Web", center: { x: 0, y: 0 } },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-component",
    before: CONTAINERS,
    edit: { type: "createElement", kind: "component", name: "Billing", center: { x: 600, y: 300 } },
    options: { view: "ApiComponents", boxes: { orders: box(0, 0), web: box(0, -400) } },
  },
  {
    name: "create-database",
    before: CONTAINERS,
    edit: {
      type: "createElement",
      kind: "container",
      tags: ["Database"],
      center: { x: 120, y: 600 },
    },
    options: { view: "ShopContainers", seed: 11 },
  },
  {
    name: "create-tabs-crlf",
    before:
      'workspace "Tabs" {\r\n\tmodel {\r\n\t\tcustomer = person "Customer"\r\n\t\tshop = softwareSystem "Shop" {\r\n\t\t\tweb = container "Web"\r\n\t\t}\r\n\t}\r\n\tviews {\r\n\t\tcontainer shop "ShopContainers" {\r\n\t\t\tinclude *\r\n\t\t}\r\n\t}\r\n}\r\n',
    edit: { type: "createElement", kind: "container", name: "API", center: { x: 120, y: 80 } },
    options: { view: "ShopContainers", boxes: { web: box(0, 0) } },
  },
  {
    name: "create-no-final-line-break",
    before:
      'workspace {\n    model {\n        a = softwareSystem "A"\n    }\n    views {\n        systemLandscape "L" {\n            include *\n        }\n    }\n}',
    edit: { type: "createElement", kind: "softwareSystem", name: "B", center: { x: 520, y: 80 } },
    options: { view: "L", boxes: { a: box(0, 0) } },
  },
  {
    name: "create-person-in-container-view",
    before: CONTAINERS,
    edit: { type: "createElement", kind: "person", name: "Admin", center: { x: 600, y: 0 } },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-system-in-container-view",
    before: CONTAINERS,
    edit: {
      type: "createElement",
      kind: "softwareSystem",
      name: "Payments",
      center: { x: 600, y: 0 },
    },
    options: { view: "ShopContainers" },
  },
  {
    name: "create-container-in-component-view",
    before: CONTAINERS,
    edit: { type: "createElement", kind: "container", name: "Queue", center: { x: 600, y: 0 } },
    options: { view: "ApiComponents" },
  },
  {
    name: "create-in-implicit-views",
    before: dsl`
      workspace "Implicit" {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web" {
                      pages = component "Pages"
                  }
              }
              mail = softwareSystem "Mail"
              customer -> web "Uses"
              shop -> mail "Sends with"
          }
      }
    `,
    edit: { type: "createElement", kind: "person", name: "Admin", center: { x: 0, y: 0 } },
    options: { view: "SystemLandscape" },
  },
  {
    name: "hierarchical-relationship",
    before: dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
                  api = container "API"
              }
          }
          views {
              container shop "ShopContainers" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: {
      type: "createRelationship",
      sourceId: "shop.web",
      destinationId: "shop.api",
      description: "Calls",
    },
    options: { view: "ShopContainers" },
  },
  {
    name: "hierarchical-anonymous-parent",
    before: dsl`
      workspace {
          !identifiers hierarchical
          model {
              softwareSystem "Shop" {
                  web = container "Web"
              }
          }
      }
    `,
    edit: { type: "createElement", kind: "container", name: "API", center: { x: 0, y: 0 } },
    options: { view: "Containers-shop" },
  },
  {
    name: "archetype-description",
    before: dsl`
      workspace {
          model {
              archetypes {
                  application = container {
                      technology "Java"
                      description "An application."
                  }
              }
              shop = softwareSystem "Shop" {
                  web = application "Web"
              }
          }
      }
    `,
    edit: { type: "updateElement", id: "web", fields: { technology: "Kotlin" } },
  },
  {
    name: "keyless-view-move",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemLandscape {
                  include *
              }
          }
      }
    `,
    edit: { type: "setLayout", boxes: new Map([["a", box(80, 40)]]), vertices: new Map() },
    options: { view: "SystemLandscape-001" },
  },
  {
    name: "pin-on-first-move",
    before: LANDSCAPE,
    edit: { type: "setLayout", boxes: new Map([["shop", box(480, 28)]]), vertices: new Map() },
    options: { view: "Landscape", boxes: LANDSCAPE_BOXES },
  },
  {
    name: "move-one-property-line",
    before: PINNED,
    edit: { type: "setLayout", boxes: new Map([["shop", box(560, 40)]]), vertices: new Map() },
    options: { view: "Landscape" },
  },
  {
    name: "resize-and-vertices",
    before: PINNED,
    edit: {
      type: "setLayout",
      boxes: new Map([["shop", box(400, 0, 320, 200)]]),
      vertices: new Map([
        [
          "customer->shop",
          [
            { x: 200, y: 300 },
            { x: 300.5, y: 300 },
          ],
        ],
      ]),
    },
    options: { view: "Landscape" },
  },
  {
    name: "implied-vertices",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> web "Uses"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  properties {
                      "c4modeler.element.customer" "0,0"
                      "c4modeler.element.shop" "400,0"
                  }
              }
          }
      }
    `,
    edit: {
      type: "setLayout",
      boxes: new Map(),
      vertices: new Map([["implied:customer->shop", [{ x: 200, y: -80 }]]]),
    },
    options: { view: "Landscape" },
  },
  {
    name: "relationship-interleaved",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Buys from"
              group "Partners" {
                  bank = softwareSystem "Bank"
              }
              shop -> bank "Pays with"
              mail = softwareSystem "Mail"

              deploymentEnvironment "Live" {
                  deploymentNode "Server" {
                      softwareSystemInstance shop
                  }
              }
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createRelationship", sourceId: "customer", destinationId: "bank" },
    options: { view: "Landscape" },
  },
  {
    name: "relationship-after-deployment",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
              deploymentEnvironment "Live" {
                  deploymentNode "Server"
              }
              late = softwareSystem "Late"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: {
      type: "createRelationship",
      sourceId: "customer",
      destinationId: "late",
      description: "Uses",
    },
    options: { view: "Landscape" },
    notices: ["relationship-after-deployment"],
  },
  {
    name: "relationship-second-between-pair",
    before: PINNED,
    edit: {
      type: "createRelationship",
      sourceId: "customer",
      destinationId: "shop",
      description: "Complains to",
      technology: "E-mail",
    },
    options: { view: "Landscape" },
  },
  {
    name: "relationship-anonymous-end",
    before: dsl`
      workspace {
          model {
              person "Visitor"
              shop = softwareSystem "Shop"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "createRelationship", sourceId: "visitor", destinationId: "shop" },
    options: { view: "Landscape" },
  },
  {
    name: "smart-delete-from-model",
    before: PINNED,
    edit: { type: "smartDelete", ids: ["customer"], relationships: [] },
    options: { view: "Landscape" },
  },
  {
    name: "smart-delete-from-view",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Uses"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
              systemContext shop "ShopContext" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "smartDelete", ids: ["customer"], relationships: ["customer->shop"] },
    options: { view: "Landscape", boxes: LANDSCAPE_BOXES },
  },
  {
    name: "smart-delete-implied",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> web "Uses"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "smartDelete", ids: [], relationships: ["implied:customer->shop"] },
    options: { view: "Landscape" },
  },
  {
    name: "remove-from-view-include-token",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
              b = softwareSystem "B"
              c = softwareSystem "C"
          }
          views {
              systemLandscape "Landscape" {
                  include a b c
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "removeFromView", ids: ["b"], relationships: [] },
    options: { view: "Landscape" },
  },
  {
    name: "include-in-view-drops-exclude",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
              b = softwareSystem "B"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  exclude b
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "includeInView", ids: ["b"] },
    options: { view: "Landscape" },
  },
  {
    name: "big-bank-delete-system",
    before: BIG_BANK,
    edit: { type: "deleteFromModel", ids: ["internetBankingSystem"], relationships: [] },
    options: { view: "SystemLandscape" },
  },
  {
    name: "big-bank-delete-container",
    before: BIG_BANK,
    edit: { type: "deleteFromModel", ids: ["apiApplication"], relationships: [] },
    options: { view: "Containers" },
  },
  {
    name: "big-bank-delete-system-in-views",
    before: BIG_BANK,
    edit: { type: "deleteFromModel", ids: ["email"], relationships: [] },
    options: { view: "SystemLandscape" },
  },
  {
    name: "delete-empties-group-term",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
              partners = group "Partners" {
                  b = softwareSystem "B"
              }
          }
          views {
              systemLandscape "Landscape" {
                  include a partners
                  autoLayout tb 300 160
              }
              systemLandscape "Partners" {
                  include partners
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["b"], relationships: [] },
    options: { view: "Landscape" },
  },
  {
    name: "delete-relationship-drops-no-relationship",
    before: dsl`
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
                  gateway = deploymentNode "Gateway" {
                      proxy = infrastructureNode "Proxy"
                  }
                  web -/> api {
                      web -> proxy "Calls"
                  }
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
    edit: { type: "deleteFromModel", ids: [], relationships: ["web->api"] },
    options: { view: "Containers" },
  },
  {
    name: "delete-container-drops-instances",
    before: dsl`
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
                  web -/> api {
                  }
              }
          }
          views {
              container shop "Containers" {
                  include *
                  autoLayout tb 300 160
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
    `,
    edit: { type: "deleteFromModel", ids: ["api"], relationships: [] },
    options: { view: "Containers" },
  },
  {
    name: "prepass-delete-first-anonymous",
    before: dsl`
      workspace {
          model {
              softwareSystem "Payments"
              softwareSystem "Payments" "The other one."
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["payments"], relationships: [] },
    options: { view: "Landscape" },
  },
  {
    name: "prepass-rename-explicit",
    before: dsl`
      workspace {
          model {
              payments = softwareSystem "Card Payments"
              softwareSystem "Payments"
          }
      }
    `,
    edit: { type: "renameIdentifier", id: "payments", identifier: "cards" },
    options: { view: "SystemLandscape" },
  },
  {
    name: "prepass-hierarchical-siblings",
    before: dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  api = container "Public API"
                  container "API"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["shop.api"], relationships: [] },
    options: { view: "SystemLandscape" },
  },
  {
    name: "view-description-positional-replaced",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemContext a "Context" "The old one." {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "updateView", key: "Context", fields: { description: "The new one." } },
    options: { view: "Context" },
  },
  {
    name: "view-description-positional-cleared",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemContext a "Context" "The old one." {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "updateView", key: "Context", fields: { description: null } },
    options: { view: "Context" },
  },
  {
    name: "view-description-statement-replaced",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemContext a "Context" "Shadowed." {
                  include *
                  description "The old one."
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "updateView", key: "Context", fields: { description: "The new one." } },
    options: { view: "Context" },
  },
  {
    name: "view-description-statement-removed",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemContext a "Context" {
                  include *
                  description "The old one."
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "updateView", key: "Context", fields: { description: null } },
    options: { view: "Context" },
  },
  {
    name: "view-description-keyless",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemContext a {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: {
      type: "updateView",
      key: "SystemContext-001",
      fields: { title: "A in context", description: "Who uses A." },
    },
    options: { view: "SystemContext-001" },
  },
  {
    name: "view-title-draft",
    before: SHOP,
    edit: { type: "updateView", key: "Containers-shop", fields: { title: "Inside the shop" } },
    options: { view: "Containers-shop" },
  },
  {
    name: "delete-keyless-view",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
              b = softwareSystem "B"
          }
          views {
              systemContext a {
                  include *
                  autoLayout tb 300 160
              }
              systemContext b {
                  include *
                  autoLayout tb 300 160
              }
          }
      }
    `,
    edit: { type: "deleteView", key: "SystemContext-001" },
    options: { view: "SystemContext-001" },
    view: "SystemLandscape",
  },
  {
    name: "rename-identifier",
    before: CONTAINERS,
    edit: { type: "renameIdentifier", id: "web", identifier: "frontend" },
    options: { view: "ShopContainers" },
  },
  {
    name: "fresh-name-renames-identifier",
    before: dsl`
      workspace {
          model {
              person_k3x9 = person "Person"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  autoLayout tb 300 160
                  properties {
                      "c4modeler.element.person_k3x9" "0,0"
                  }
              }
          }
      }
    `,
    edit: { type: "updateElement", id: "person_k3x9", fields: { name: "Online Customer" } },
    options: { view: "Landscape", fresh: ["person_k3x9"] },
  },
  {
    name: "field-placeholders",
    before: CONTAINERS,
    edit: { type: "updateElement", id: "api", fields: { technology: "Kotlin", description: "" } },
    options: { view: "ShopContainers" },
  },
  {
    name: "field-clear-last-positional",
    before: CONTAINERS,
    edit: { type: "updateElement", id: "web", fields: { technology: "" } },
    options: { view: "ShopContainers" },
  },
  {
    name: "field-url-opens-block",
    before: SHOP,
    edit: {
      type: "updateElement",
      id: "customer",
      fields: { url: "https://example.com/customers" },
    },
    options: { view: "ShopContext" },
  },
  {
    name: "field-text-block",
    before: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" """
                  Sells books
                  and maps.
                  """
          }
      }
    `,
    edit: {
      type: "updateElement",
      id: "shop",
      fields: { description: 'Sells books,\nmaps and "globes".' },
    },
  },
  {
    name: "field-anonymous-name",
    before: dsl`
      workspace {
          model {
              softwareSystem "Shop"
          }
      }
    `,
    edit: { type: "updateElement", id: "shop", fields: { name: "Book Shop" } },
  },
  {
    name: "relationship-fields",
    before: CONTAINERS,
    edit: {
      type: "updateRelationship",
      key: "web->api",
      fields: { description: "Calls the API of", technology: "JSON/HTTPS" },
    },
    options: { view: "ShopContainers" },
  },
  {
    name: "apply-c4-colours",
    before: dsl`
      workspace {
          model {
              customer = person "Customer"
          }
          views {
              styles {
                  element "Person" {
                      shape person
                      background #08427b
                  }
              }
          }
      }
    `,
    edit: { type: "applyC4Colours" },
  },
  {
    name: "workspace-name-and-description",
    before: SHOP.replace('workspace "Shop" {', "workspace {"),
    edit: { type: "updateWorkspace", fields: { name: "Book Shop", description: "Sells books." } },
    options: { view: "ShopContext" },
  },
  {
    name: "create-view",
    before: CONTAINERS,
    edit: {
      type: "createView",
      viewType: "systemContext",
      scopeId: "shop",
      title: "Who uses the shop",
    },
    options: { view: "ShopContainers" },
    view: "SystemContext-shop",
  },
  {
    name: "layout-earlier-properties-block",
    before: dsl`
      workspace {
          model {
              a = softwareSystem "A"
          }
          views {
              systemLandscape "Landscape" {
                  include *
                  properties {
                      "c4modeler.element.a" "0,0"
                  }
                  properties {
                      "owner" "team"
                  }
              }
          }
      }
    `,
    edit: { type: "setLayout", boxes: new Map([["a", box(80, 0)]]), vertices: new Map() },
    options: { view: "Landscape" },
  },
  {
    name: "relationship-tags-and-url",
    before: SHOP,
    edit: {
      type: "updateRelationship",
      key: "customer->shop",
      fields: { tags: ["Async"], url: "https://example.com/orders" },
    },
    options: { view: "ShopContext" },
  },
  {
    name: "lay-out-automatically",
    before: PINNED.replace(
      '"c4modeler.element.shop" "400,0"',
      '"c4modeler.element.shop" "400,0"\n                "c4modeler.element.gone" "1,2"',
    ),
    edit: { type: "clearLayout" },
    options: { view: "Landscape" },
  },
];
