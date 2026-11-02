import { describe, expect, it } from "vitest";
import { parseWorkspace } from "../../src/parse.js";
import { box, dsl, edit, edited } from "./support/edit.js";

const PINNED_WITH_KEYLESS = dsl`
  workspace "Shop" {
      model {
          customer = person "Customer"
          shop = softwareSystem "Shop"
          mail = softwareSystem "Mail"
          admin = person "Admin"
          customer -> shop "Uses"
          admin -> shop "Runs"
      }
      views {
          systemLandscape "Landscape" {
              include customer shop mail
              properties {
                  "c4modeler.element.customer" "0,0"
                  "c4modeler.element.shop" "400,0"
              }
          }
      }
  }
`;

const DRAWN = {
  customer: box(0, 0, 216, 216),
  shop: box(400, 0),
  mail: box(0, 296),
};

function layoutOf(text: string): Record<string, string> {
  const view = parseWorkspace(text).workspace.views.find((entry) => entry.key === "Landscape");
  return Object.fromEntries(
    Object.entries(view?.properties ?? {}).filter(([name]) => name.startsWith("c4modeler.")),
  );
}

describe("pinning a view that is pinned already (SPEC 3.6)", () => {
  it("writes the drawn box of a member without a key on the next graph edit", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "createRelationship", sourceId: "shop", destinationId: "mail" },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(layoutOf(text)).toEqual({
      "c4modeler.element.customer": "0,0",
      "c4modeler.element.mail": "0,296",
      "c4modeler.element.shop": "400,0",
    });
  });

  it("keeps the stored keys as they are, also where the drawn box differs", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "createRelationship", sourceId: "shop", destinationId: "mail" },
      { view: "Landscape", boxes: { ...DRAWN, shop: box(999, 999) } },
    );
    expect(layoutOf(text)["c4modeler.element.shop"]).toBe("400,0");
  });

  it("writes nothing on a text edit: a rename moves nothing", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "updateElement", id: "mail", fields: { name: "Post" } },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(layoutOf(text)).toEqual({
      "c4modeler.element.customer": "0,0",
      "c4modeler.element.shop": "400,0",
    });
  });

  it("leaves out the members an edit removes from the view", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "removeFromView", ids: ["mail"], relationships: [] },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(layoutOf(text)["c4modeler.element.mail"]).toBeUndefined();
  });
});

describe("Add existing element with the boxes the elements are drawn in", () => {
  it("writes a layout key for each added element, so drawing a relationship later moves none", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "includeInView", ids: ["admin"], boxes: new Map([["admin", box(800, 0, 216, 216)]]) },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(layoutOf(text)).toEqual({
      "c4modeler.element.admin": "800,0",
      "c4modeler.element.customer": "0,0",
      "c4modeler.element.mail": "0,296",
      "c4modeler.element.shop": "400,0",
    });
  });

  it("pins an automatic view and its added element in the same edit", () => {
    const automatic = PINNED_WITH_KEYLESS.replace(/ {12}properties \{[\s\S]*?\n {12}\}\n/, "");
    const text = edited(
      automatic,
      { type: "includeInView", ids: ["admin"], boxes: new Map([["admin", box(800, 0, 216, 216)]]) },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(Object.keys(layoutOf(text)).sort()).toEqual([
      "c4modeler.element.admin",
      "c4modeler.element.customer",
      "c4modeler.element.mail",
      "c4modeler.element.shop",
    ]);
  });

  it("writes no key without a box, and none for an element the include did not add", () => {
    const text = edited(
      PINNED_WITH_KEYLESS,
      { type: "includeInView", ids: ["admin"], boxes: new Map([["nobody", box(0, 0)]]) },
      { view: "Landscape", boxes: DRAWN },
    );
    expect(layoutOf(text)["c4modeler.element.admin"]).toBeUndefined();
    expect(layoutOf(text)["c4modeler.element.nobody"]).toBeUndefined();
  });
});

describe("the system of a system context view", () => {
  it("is refused with the way to leave it out: deleting the view", () => {
    const text = dsl`
      workspace {
          model {
              shop = softwareSystem "Shop"
          }
          views {
              systemContext shop "Context" {
                  include *
              }
          }
      }
    `;
    const outcome = edit(
      text,
      { type: "removeFromView", ids: ["shop"], relationships: [] },
      { view: "Context" },
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: "not-allowed",
      message: "A system context view always shows its system. To leave it out, delete the view.",
    });
  });
});
