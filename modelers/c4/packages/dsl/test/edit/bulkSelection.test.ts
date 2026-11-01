import { describe, expect, it } from "vitest";
import type { C4Edit } from "../../src/types.js";
import { dsl, edit } from "./support/edit.js";

/*
 * Structurizr evaluates "!elements" and "!relationships" at their line and refuses one that
 * selects nothing, while the modeler doesn't evaluate them (SPEC 3.7). Each refused case below
 * was checked with Structurizr 6.2.4: the file before the delete opens, the file the delete would
 * write is refused with "No elements found" or "No relationships found". Each kept case writes a
 * file Structurizr opens.
 */

interface Case {
  readonly name: string;
  readonly text: string;
  readonly edit: C4Edit;
}

const GROUPED = dsl`
  workspace {
      model {
          user = person "User"
          core = group "Core" {
              a = softwareSystem "A"
              b = softwareSystem "B"
          }
          !elements core {
              url "https://example.com"
          }
      }
  }
`;

const REFUSED: readonly Case[] = [
  {
    name: "the only container a parent and technology filter selects",
    text: dsl`
      workspace {
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web" "" "Spring MVC"
                  api = container "API" "" "Kotlin"
                  !elements "element.parent==shop && element.technology==Spring MVC" {
                      tags "Controllers"
                  }
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["web"], relationships: [] },
  },
  {
    name: "the only person a type filter selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Uses"
              !elements "element.type==Person" {
                  tags "Human"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "the only system defined above a type filter, though one follows it",
    text: dsl`
      workspace {
          model {
              first = softwareSystem "First"
              !elements "element.type==SoftwareSystem" {
                  tags "Early"
              }
              later = softwareSystem "Later"
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["first"], relationships: [] },
  },
  {
    name: "the only relationship *->* selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Uses"
              !relationships "*->*" {
                  tags "Traffic"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: [], relationships: ["customer->shop"] },
  },
  {
    name: "an element whose delete takes the only relationship *->* selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Uses"
              !relationships "*->*" {
                  tags "Traffic"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "the relationship that implies the only one an end-to-end expression selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web"
              }
              customer -> web "Uses"
              !relationships "customer->shop" {
                  tags "Traffic"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: [], relationships: ["customer->web"] },
  },
  {
    name: "the only child a parent filter selects, in hierarchical mode",
    text: dsl`
      workspace {
          !identifiers hierarchical
          model {
              shop = softwareSystem "Shop" {
                  web = container "Web"
                  !elements "element.parent==shop" {
                      tags "Inside"
                  }
              }
              other = softwareSystem "Other"
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["shop.web"], relationships: [] },
  },
  {
    name: "the only container a tag filter selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  db = container "DB" "" "" "Database"
                  web = container "Web" "" "Spring"
              }
              !elements "element.tag==Database" {
                  technology "PostgreSQL"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["db"], relationships: [] },
  },
  {
    name: "the only container a tag inequality selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  db = container "DB" "" "" "Database"
                  web = container "Web" "" "Spring"
              }
              !elements "element.type==Container && element.tag!=Database" {
                  url "https://example.com"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["web"], relationships: [] },
  },
  {
    name: "the only container a technology filter selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  db = container "DB" "" "" "Database"
                  web = container "Web" "" "Spring"
              }
              !elements "element.technology==Spring" {
                  url "https://example.com"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["web"], relationships: [] },
  },
];

const KEPT: readonly Case[] = [
  {
    name: "one of two people a type filter selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              admin = person "Admin"
              shop = softwareSystem "Shop"
              !elements "element.type==Person" {
                  tags "Human"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "a software system a person filter can't select",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              customer -> shop "Uses"
              !elements "element.type==Person" {
                  tags "Human"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["shop"], relationships: [] },
  },
  {
    name: "a person defined below the filter, which Structurizr evaluates at its line",
    text: dsl`
      workspace {
          model {
              early = person "Early"
              !elements "element.type==Person" {
                  tags "Human"
              }
              late = person "Late"
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["late"], relationships: [] },
  },
  {
    name: "one of two relationships *->* selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              mail = softwareSystem "Mail"
              customer -> shop "Uses"
              shop -> mail "Sends"
              !relationships "*->*" {
                  tags "Traffic"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: [], relationships: ["customer->shop"] },
  },
  {
    name: "an element a bulk statement doesn't name",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop"
              !elements customer {
                  tags "Human"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["shop"], relationships: [] },
  },
  {
    name: "a person a tag filter can't select, as no bulk statement, script or constant sets tags",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  db = container "DB" "" "" "Database"
              }
              !elements "element.tag==Database" {
                  technology "PostgreSQL"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "one of two people a tag inequality selects",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              admin = person "Admin"
              shop = softwareSystem "Shop" {
                  db = container "DB" "" "" "Database"
              }
              !elements "element.type==Person && element.tag!=Database" {
                  url "https://example.com"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "a person a technology filter can't select",
    text: dsl`
      workspace {
          model {
              customer = person "Customer"
              shop = softwareSystem "Shop" {
                  web = container "Web" "" "Spring"
              }
              !elements "element.technology==Spring" {
                  url "https://example.com"
              }
          }
      }
    `,
    edit: { type: "deleteFromModel", ids: ["customer"], relationships: [] },
  },
  {
    name: "one of two members of the group a bulk statement names",
    text: GROUPED,
    edit: { type: "deleteFromModel", ids: ["a"], relationships: [] },
  },
  {
    name: "an element outside the group a bulk statement names",
    text: GROUPED,
    edit: { type: "deleteFromModel", ids: ["user"], relationships: [] },
  },
];

describe("a delete that may empty a bulk statement's selection (SPEC 3.4)", () => {
  it.each(REFUSED.map((item) => [item.name, item] as const))("refuses deleting %s", (_, item) => {
    const outcome = edit(item.text, item.edit);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("referenced-by-opaque");
    expect(outcome.message).toMatch(/^The bulk statement on line \d+ /);
  });

  it.each(KEPT.map((item) => [item.name, item] as const))("deletes %s", (_, item) => {
    const outcome = edit(item.text, item.edit);
    if (!outcome.ok) throw new Error(`${outcome.reason}: ${outcome.message}`);
    expect(outcome.text).not.toBe(item.text);
  });
});
