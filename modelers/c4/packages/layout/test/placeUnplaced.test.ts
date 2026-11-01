import { describe, expect, it } from "vitest";
import type { Box, ElementId } from "@miragon/c4-schema-model";
import { layoutView, placeUnplaced } from "../src/index.js";
import { HORIZONTAL_GAP, LABEL_MARGIN, VERTICAL_GAP } from "../src/placement.js";
import {
  BOX,
  PERSON,
  contains,
  layoutInput,
  overlap,
  plain,
  seededRandom,
  type ViewSpec,
} from "./support/views.js";

function placed(
  spec: ViewSpec,
  boxes: Readonly<Record<ElementId, Box>>,
  unplaced: readonly ElementId[],
): Map<ElementId, Box> {
  return placeUnplaced(new Map(Object.entries(boxes)), unplaced, layoutInput(spec));
}

const at = (x: number, y: number, size = BOX): Box => ({ x, y, ...size });
/** The next slot to the right of a box at 0, and below one: a relationship's label fits between. */
const BESIDE = BOX.width + HORIZONTAL_GAP;
const BELOW = BOX.height + VERTICAL_GAP;

describe("placeUnplaced", () => {
  it("keeps the placed boxes and adds one for every unplaced element", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, { a: at(0, 0) }, [
      "b",
    ]);
    expect([...result.keys()]).toEqual(["a", "b"]);
    expect(result.get("a")).toEqual(at(0, 0));
  });

  it("leaves room for a relationship's label between neighbours: 160 wide, 48 high", () => {
    expect(HORIZONTAL_GAP).toBeGreaterThanOrEqual(160 + 2 * 8);
    expect(VERTICAL_GAP).toBeGreaterThanOrEqual(48 + 2 * 8);
  });

  it("puts an element right of its first placed neighbour at the horizontal gap, centred on it", () => {
    const result = placed(
      { elements: ["a", "user"], relationships: [["user", "a"]], sizes: { user: PERSON } },
      { a: at(0, 0) },
      ["user"],
    );
    expect(result.get("user")).toEqual(at(BESIDE, -32, PERSON));
  });

  it("tries below, left of and above the neighbour when the slot before is taken", () => {
    const spec: ViewSpec = {
      elements: ["n", "new", "r", "b", "l"],
      relationships: [["n", "new"]],
    };
    const r = at(BESIDE, 0);
    const b = at(0, BELOW);
    const l = at(-BESIDE, 0);
    expect(placed(spec, { n: at(0, 0), r }, ["new"]).get("new")).toEqual(at(0, BELOW));
    expect(placed(spec, { n: at(0, 0), r, b }, ["new"]).get("new")).toEqual(at(-BESIDE, 0));
    expect(placed(spec, { n: at(0, 0), r, b, l }, ["new"]).get("new")).toEqual(at(0, -BELOW));
  });

  it("takes the first placed neighbour in relationship order", () => {
    const result = placed(
      {
        elements: ["first", "second", "new"],
        relationships: [
          ["second", "new"],
          ["new", "first"],
        ],
      },
      { first: at(0, 0), second: at(0, 800) },
      ["new"],
    );
    expect(result.get("new")).toEqual(at(BESIDE, 800));
  });

  it("writes no negative zero, which would make equal boxes compare unequal", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, { a: at(0, -2) }, [
      "b",
    ]);
    expect(Object.is(result.get("b")?.y, 0)).toBe(true);
  });

  it("snaps to the 8-unit grid and keeps at least the gap from a neighbour off the grid", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, { a: at(3, 5) }, [
      "b",
    ]);
    const b = result.get("b") as Box;
    expect(b.x % 8).toBe(0);
    expect(b.y % 8).toBe(0);
    expect(b.x - (3 + 240)).toBeGreaterThanOrEqual(HORIZONTAL_GAP);
  });

  it("puts an element without a placed neighbour into a row below the placed content", () => {
    const result = placed(
      { elements: ["a", "b", "lonely", "alone"] },
      { a: at(0, 0), b: at(400, 200) },
      ["lonely", "alone"],
    );
    expect(result.get("lonely")).toEqual(at(0, 440));
    expect(result.get("alone")).toEqual(at(BESIDE, 440));
  });

  it("starts a new row when a row grows wider than the content", () => {
    const unplaced = ["e1", "e2", "e3", "e4", "e5"];
    const result = placed({ elements: ["a", ...unplaced] }, { a: at(0, 0) }, unplaced);
    expect(unplaced.map((id) => result.get(id))).toEqual([
      at(0, BELOW),
      at(BESIDE, BELOW),
      at(2 * BESIDE, BELOW),
      at(3 * BESIDE, BELOW),
      at(0, 2 * BELOW),
    ]);
  });

  it("puts the first element of an empty view at the origin and the next beside it", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, {}, ["a", "b"]);
    expect(result.get("a")).toEqual(at(0, 0));
    expect(result.get("b")).toEqual(at(BESIDE, 0));
  });

  it("never puts an element at the origin of a view that is not empty", () => {
    const result = placed(
      { elements: ["n", "new", "r", "b"], relationships: [["n", "new"]] },
      { n: at(BESIDE, 0), r: at(2 * BESIDE, 0), b: at(BESIDE, BELOW) },
      ["new"],
    );
    expect(result.get("new")).not.toMatchObject({ x: 0, y: 0 });
    expect(result.get("new")).toEqual(at(BESIDE, -BELOW));
  });

  it("places an element after its unplaced neighbour has found a place, whatever their order", () => {
    const result = placed(
      {
        elements: ["anchor", "far", "near"],
        relationships: [
          ["far", "near"],
          ["near", "anchor"],
        ],
      },
      { anchor: at(0, 0) },
      ["far", "near"],
    );
    expect(result.get("near")).toEqual(at(BESIDE, 0));
    expect(result.get("far")).toEqual(at(2 * BESIDE, 0));
  });

  it("keeps an element that does not belong to a frame out of it, its label off the frame's edge", () => {
    const spec: ViewSpec = {
      elements: ["c1", "c3", "person"],
      relationships: [["person", "c1"]],
      boundaries: [{ elementId: "shop", members: ["c1", "c3"], depth: 0 }],
      sizes: { person: PERSON },
    };
    const result = placed(spec, { c1: at(0, 0), c3: at(640, 0) }, ["person"]);
    const view = layoutView(layoutInput({ ...spec, stored: Object.fromEntries(result) }));
    const frame = view.boundaries.get("shop") as Box;
    const person = result.get("person") as Box;
    expect(overlap(frame, person)).toBe(false);
    expect(roomForALabel(person, frame)).toBe(true);
    expect(onTheEdge(view.labelBoxes.get("person->c1") as Box, frame)).toBe(false);
    expect(person).toEqual(at(16, -368, PERSON));
  });

  it("does not grow a frame over an element outside it", () => {
    const spec: ViewSpec = {
      elements: ["c1", "c2", "person", "other"],
      relationships: [["c1", "c2"]],
      boundaries: [{ elementId: "shop", members: ["c1", "c2"], depth: 0 }],
      sizes: { person: PERSON },
    };
    const result = placed(
      spec,
      { c1: at(0, 0), person: at(0, 440, PERSON), other: at(BESIDE, 0) },
      ["c2"],
    );
    expect(result.get("c2")).toEqual(at(-BESIDE, 0));
    const frame = layoutView(
      layoutInput({ ...spec, stored: Object.fromEntries(result) }),
    ).boundaries.get("shop") as Box;
    expect(overlap(frame, at(0, 440, PERSON))).toBe(false);
  });

  it("puts a new member of a frame beside its siblings when it has no placed neighbour", () => {
    const result = placed(
      {
        elements: ["user", "c1", "c2"],
        boundaries: [{ elementId: "shop", members: ["c1", "c2"], depth: 0 }],
        sizes: { user: PERSON },
      },
      { user: at(0, 0, PERSON), c1: at(0, 600) },
      ["c2"],
    );
    expect(result.get("c2")).toEqual(at(BESIDE, 600));
  });

  it("keeps a new element off an empty boundary's place and returns no box for the boundary", () => {
    const spec: ViewSpec = {
      elements: ["user", "mail", "new"],
      relationships: [
        ["user", "mail"],
        ["new", "user"],
      ],
      boundaries: [{ elementId: "shop", members: [], depth: 0 }],
      sizes: { user: PERSON },
    };
    const automatic = layoutView(layoutInput({ ...spec, elements: ["user", "mail"] }));
    const stored = Object.fromEntries(automatic.boxes);
    const result = placed(spec, stored, ["new"]);
    expect([...result.keys()]).toEqual(["user", "mail", "new"]);
    const drawn = layoutView(layoutInput({ ...spec, stored: Object.fromEntries(result) }));
    expect(drawn.boxes.get("new")).toEqual(result.get("new"));
    const shop = drawn.boundaries.get("shop") as Box;
    expect(overlap(shop, result.get("new") as Box)).toBe(false);
  });

  it("never overlaps two boxes and stays on the grid", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { spec, boxes, unplaced } = randomPinnedView(seed);
      const result = placed(spec, boxes, unplaced);
      const all = [...result.entries()];
      all.forEach(([first, firstBox], index) => {
        for (const [second, secondBox] of all.slice(index + 1)) {
          expect(overlap(firstBox, secondBox), `seed ${seed}: ${first} and ${second}`).toBe(false);
        }
      });
      for (const id of unplaced) {
        const box = result.get(id) as Box;
        expect(box, `seed ${seed}: ${id}`).toBeDefined();
        expect([box.x % 8, box.y % 8].map(Math.abs), `seed ${seed}: ${id}`).toEqual([0, 0]);
        expect(box.x === 0 && box.y === 0, `seed ${seed}: ${id} at the origin`).toBe(false);
      }
    }
  });

  describe("in a crowded view", () => {
    // The bookshop's container view: a column of three containers in their system's boundary,
    // the customer above it, two external systems either side, so the boundary grows downwards only.
    const crowded = (unplaced: ElementId): ViewSpec => ({
      elements: ["customer", "webApp", "api", "database", "payments", "mail", unplaced],
      relationships: [
        ["customer", "webApp"],
        ["webApp", "api"],
        ["api", "database"],
        ["mail", "customer"],
        ["api", "payments"],
        ["api", "mail"],
      ],
      boundaries: [
        { elementId: "shop", members: ["webApp", "api", "database", unplaced], depth: 0 },
      ],
      sizes: { customer: PERSON },
    });
    const pinned: Record<ElementId, Box> = {
      customer: at(572, 0, PERSON),
      webApp: at(560, 360),
      api: at(560, 640),
      database: at(560, 920),
      payments: at(0, 640),
      mail: at(1120, 640),
    };
    const connected = (spec: ViewSpec, source: ElementId, unplaced: ElementId): ViewSpec => ({
      ...spec,
      relationships: [...(spec.relationships ?? []), [source, unplaced]],
    });
    const drawn = (spec: ViewSpec, boxes: Map<ElementId, Box>) =>
      layoutView(layoutInput({ ...spec, stored: Object.fromEntries(boxes) }));

    it("takes the clear place nearest the neighbour where the first free slot's line crosses a box", () => {
      const spec = connected(crowded("search"), "api", "search");
      const result = placed(spec, pinned, ["search"]);
      const search = result.get("search") as Box;
      const view = drawn(spec, result);
      const api = result.get("api") as Box;
      for (const [id, box] of result) {
        if (id === "api" || id === "search") continue;
        expect(lineCrosses(api, search, box), `the line runs through ${id}`).toBe(false);
      }
      for (const [key, label] of view.labelBoxes) {
        if (key === "api->search") continue;
        expect(lineCrosses(api, search, label), `the line runs through ${key}'s label`).toBe(false);
      }
      const shop = view.boundaries.get("shop") as Box;
      for (const stranger of ["customer", "payments", "mail"]) {
        expect(overlap(shop, result.get(stranger) as Box), `the frame reaches ${stranger}`).toBe(
          false,
        );
      }
      expect(search).toEqual(at(848, 880));
    });

    it("keeps a new box off a line drawn between two others", () => {
      const spec = connected({ ...crowded("reader"), boundaries: [] }, "webApp", "reader");
      const result = placed(spec, pinned, ["reader"]);
      const reader = result.get("reader") as Box;
      const customer = pinned.customer as Box;
      const mail = pinned.mail as Box;
      expect(lineCrosses(mail, customer, reader)).toBe(false);
      expect(reader.y).toBe(360);
    });

    it("falls back to the first free slot where no place is in the clear", () => {
      const spec = connected(crowded("search"), "webApp", "search");
      expect(placed(spec, pinned, ["search"]).get("search")).toEqual(at(560, 1160));
    });

    // The bookshop's API component view: the API boundary inside the bookshop's, the web app
    // above it and the database below it inside the bookshop only, two external systems below.
    const components: ViewSpec = {
      elements: [
        "webApp",
        "catalogue",
        "orders",
        "notifications",
        "database",
        "payments",
        "mail",
        "added",
      ],
      relationships: [
        ["webApp", "catalogue"],
        ["webApp", "orders"],
        ["catalogue", "database"],
        ["orders", "database"],
        ["orders", "notifications"],
        ["orders", "payments"],
        ["notifications", "mail"],
      ],
      boundaries: [
        { elementId: "bookshop", members: ["webApp", "database"], depth: 0 },
        {
          elementId: "api",
          members: ["catalogue", "orders", "notifications", "added"],
          parentId: "bookshop",
          depth: 1,
        },
      ],
    };
    const componentBoxes: Record<ElementId, Box> = {
      webApp: at(320, 0),
      catalogue: at(80, 320),
      orders: at(560, 320),
      notifications: at(1000, 320),
      database: at(320, 704),
      payments: at(560, 1032),
      mail: at(1000, 1032),
    };

    it("keeps a frame it grows clear of what the frame does not hold where a clear place allows it", () => {
      for (const source of ["webApp", "database", "payments", "mail"]) {
        const spec = connected(components, source, "added");
        const result = placed(spec, componentBoxes, ["added"]);
        const view = drawn(spec, result);
        const added = result.get("added") as Box;
        const from = result.get(source) as Box;
        for (const [id, box] of result) {
          if (id === source || id === "added") continue;
          expect(lineCrosses(from, added, box), `${source}: the line runs through ${id}`).toBe(
            false,
          );
        }
        const frames: [string, readonly ElementId[]][] = [
          ["api", ["webApp", "database", "payments", "mail"]],
          ["bookshop", ["payments", "mail"]],
        ];
        for (const [frameId, strangers] of frames) {
          const frame = view.boundaries.get(frameId) as Box;
          for (const stranger of strangers) {
            expect(
              gapBetween(frame, result.get(stranger) as Box),
              `${source}: the ${frameId} frame's room from ${stranger}`,
            ).toBeGreaterThanOrEqual(VERTICAL_GAP / 2);
          }
        }
      }
    });

    it("keeps an element outside the frame a label's room from it, with its label off the edge", () => {
      const outside: ViewSpec = {
        ...crowded("crm"),
        boundaries: [{ elementId: "shop", members: ["webApp", "api", "database"], depth: 0 }],
      };
      const places: Record<string, Box> = {};
      for (const source of ["webApp", "api", "database"]) {
        const spec = connected(outside, source, "crm");
        const result = placed(spec, pinned, ["crm"]);
        const view = drawn(spec, result);
        const crm = result.get("crm") as Box;
        const shop = view.boundaries.get("shop") as Box;
        expect(roomForALabel(crm, shop), `${source}: the room from the frame`).toBe(true);
        const label = view.labelBoxes.get(`${source}->crm`) as Box;
        expect(onTheEdge(label, shop), `${source}: the label on the frame's edge`).toBe(false);
        for (const [id, box] of result) {
          if (id === source || id === "crm") continue;
          expect(lineCrosses(result.get(source) as Box, crm, box), `${source}: through ${id}`).toBe(
            false,
          );
        }
        places[source] = crm;
      }
      expect(places).toEqual({
        webApp: at(288, 88),
        api: at(1056, 848),
        database: at(560, 1304),
      });
    });

    it("keeps the same room from a group frame it does not belong to", () => {
      const spec: ViewSpec = {
        elements: ["a", "b", "c", "new"],
        relationships: [
          ["a", "b"],
          ["b", "new"],
        ],
        groups: [{ name: "Core", path: "Core", depth: 0, members: ["a", "b"] }],
      };
      const result = placed(spec, { a: at(0, 0), b: at(0, 280), c: at(BESIDE, 0) }, ["new"]);
      const view = drawn(spec, result);
      const group = [...view.groups.values()][0] as Box;
      const added = result.get("new") as Box;
      expect(overlap(group, added)).toBe(false);
      expect(roomForALabel(added, group)).toBe(true);
      expect(onTheEdge(view.labelBoxes.get("b->new") as Box, group)).toBe(false);
    });

    it("lets a frame grow up to a stranger where only that keeps the line in the clear", () => {
      const spec = connected(crowded("search"), "api", "search");
      const result = placed(spec, pinned, ["search"]);
      const shop = drawn(spec, result).boundaries.get("shop") as Box;
      expect(gapBetween(shop, pinned.mail as Box)).toBe(0);
      expect(
        lineCrosses(pinned.api as Box, result.get("search") as Box, pinned.database as Box),
      ).toBe(false);
    });
  });

  it("is deterministic", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { spec, boxes, unplaced } = randomPinnedView(seed);
      expect(plain(placed(spec, boxes, unplaced))).toEqual(plain(placed(spec, boxes, unplaced)));
    }
  });
});

/** A relationship's label fits between the box and the frame, across or above and below it. */
function roomForALabel(box: Box, frame: Box): boolean {
  const across = Math.max(frame.x - (box.x + box.width), box.x - (frame.x + frame.width));
  const along = Math.max(frame.y - (box.y + box.height), box.y - (frame.y + frame.height));
  return across >= HORIZONTAL_GAP || along >= VERTICAL_GAP;
}

/** The label comes within a label's margin of the frame's edge, from outside or from inside. */
function onTheEdge(label: Box, frame: Box): boolean {
  const grown = {
    x: frame.x - LABEL_MARGIN,
    y: frame.y - LABEL_MARGIN,
    width: frame.width + 2 * LABEL_MARGIN,
    height: frame.height + 2 * LABEL_MARGIN,
  };
  const shrunk = {
    x: frame.x + LABEL_MARGIN,
    y: frame.y + LABEL_MARGIN,
    width: frame.width - 2 * LABEL_MARGIN,
    height: frame.height - 2 * LABEL_MARGIN,
  };
  return overlap(label, grown) && !contains(shrunk, label);
}

/** The distance between two boxes, 0 where they touch or overlap. */
function gapBetween(first: Box, second: Box): number {
  const across = Math.max(
    second.x - (first.x + first.width),
    first.x - (second.x + second.width),
    0,
  );
  const along = Math.max(
    second.y - (first.y + first.height),
    first.y - (second.y + second.height),
    0,
  );
  return Math.hypot(across, along);
}

/** Whether the straight line between the centres of `from` and `to` runs through `box`. */
function lineCrosses(from: Box, to: Box, box: Box): boolean {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  for (let step = 1; step < 400; step++) {
    const x = start.x + ((end.x - start.x) * step) / 400;
    const y = start.y + ((end.y - start.y) * step) / 400;
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) return true;
  }
  return false;
}

/** A pinned view on a loose grid with gaps, and a few elements the text added since. */
function randomPinnedView(seed: number): {
  spec: ViewSpec;
  boxes: Record<ElementId, Box>;
  unplaced: ElementId[];
} {
  const random = seededRandom(seed);
  const size = 3 + Math.floor(random() * 12);
  const elements = Array.from({ length: size }, (_, index) => `e${index}`);
  const boxes: Record<ElementId, Box> = {};
  const unplaced: ElementId[] = [];
  elements.forEach((id, index) => {
    if (index > 0 && random() < 0.4) {
      unplaced.push(id);
      return;
    }
    const column = Math.floor(random() * 5) - 2;
    const row = Math.floor(random() * 4) - 1;
    const candidate = at(
      column * 304 + Math.floor(random() * 40),
      row * 216,
      random() < 0.3 ? PERSON : BOX,
    );
    if (Object.values(boxes).some((other) => overlap(other, candidate))) {
      unplaced.push(id);
      return;
    }
    boxes[id] = candidate;
  });
  const relationships: [ElementId, ElementId][] = [];
  for (let index = 0; index < size; index++) {
    const source = elements[Math.floor(random() * size)] as ElementId;
    const destination = elements[Math.floor(random() * size)] as ElementId;
    if (source !== destination) relationships.push([source, destination]);
  }
  const members = elements.filter(() => random() < 0.4);
  return {
    spec: {
      elements,
      relationships,
      ...(members.length > 0 ? { boundaries: [{ elementId: "scope", members, depth: 0 }] } : {}),
    },
    boxes,
    unplaced,
  };
}
