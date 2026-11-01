import { describe, expect, it } from "vitest";
import type { Box, ElementId } from "@miragon/c4-schema-model";
import { layoutView, placeUnplaced } from "../src/index.js";
import {
  BOX,
  PERSON,
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

describe("placeUnplaced", () => {
  it("keeps the placed boxes and adds one for every unplaced element", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, { a: at(0, 0) }, [
      "b",
    ]);
    expect([...result.keys()]).toEqual(["a", "b"]);
    expect(result.get("a")).toEqual(at(0, 0));
  });

  it("puts an element right of its first placed neighbour at a gap of 80, centred on it", () => {
    const result = placed(
      { elements: ["a", "user"], relationships: [["user", "a"]], sizes: { user: PERSON } },
      { a: at(0, 0) },
      ["user"],
    );
    expect(result.get("user")).toEqual(at(320, -32, PERSON));
  });

  it("tries below, left of and above the neighbour when the slot before is taken", () => {
    const spec: ViewSpec = {
      elements: ["n", "new", "r", "b", "l"],
      relationships: [["n", "new"]],
    };
    expect(placed(spec, { n: at(0, 0), r: at(320, 0) }, ["new"]).get("new")).toEqual(at(0, 240));
    expect(placed(spec, { n: at(0, 0), r: at(320, 0), b: at(0, 240) }, ["new"]).get("new")).toEqual(
      at(-320, 0),
    );
    expect(
      placed(spec, { n: at(0, 0), r: at(320, 0), b: at(0, 240), l: at(-320, 0) }, ["new"]).get(
        "new",
      ),
    ).toEqual(at(0, -240));
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
    expect(result.get("new")).toEqual(at(320, 800));
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
    expect(b.x - (3 + 240)).toBeGreaterThanOrEqual(80);
  });

  it("puts an element without a placed neighbour into a row below the placed content", () => {
    const result = placed(
      { elements: ["a", "b", "lonely", "alone"] },
      { a: at(0, 0), b: at(400, 200) },
      ["lonely", "alone"],
    );
    expect(result.get("lonely")).toEqual(at(0, 440));
    expect(result.get("alone")).toEqual(at(320, 440));
  });

  it("starts a new row when a row grows wider than the content", () => {
    const unplaced = ["e1", "e2", "e3", "e4", "e5"];
    const result = placed({ elements: ["a", ...unplaced] }, { a: at(0, 0) }, unplaced);
    expect(unplaced.map((id) => result.get(id))).toEqual([
      at(0, 240),
      at(320, 240),
      at(640, 240),
      at(960, 240),
      at(0, 480),
    ]);
  });

  it("puts the first element of an empty view at the origin and the next beside it", () => {
    const result = placed({ elements: ["a", "b"], relationships: [["a", "b"]] }, {}, ["a", "b"]);
    expect(result.get("a")).toEqual(at(0, 0));
    expect(result.get("b")).toEqual(at(320, 0));
  });

  it("never puts an element at the origin of a view that is not empty", () => {
    const result = placed(
      { elements: ["n", "new", "r", "b"], relationships: [["n", "new"]] },
      { n: at(320, 0), r: at(640, 0), b: at(320, 240) },
      ["new"],
    );
    expect(result.get("new")).not.toMatchObject({ x: 0, y: 0 });
    expect(result.get("new")).toEqual(at(320, -240));
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
    expect(result.get("near")).toEqual(at(320, 0));
    expect(result.get("far")).toEqual(at(640, 0));
  });

  it("keeps an element that does not belong to a frame out of it", () => {
    const spec: ViewSpec = {
      elements: ["c1", "c3", "person"],
      relationships: [["person", "c1"]],
      boundaries: [{ elementId: "shop", members: ["c1", "c3"], depth: 0 }],
      sizes: { person: PERSON },
    };
    const result = placed(spec, { c1: at(0, 0), c3: at(640, 0) }, ["person"]);
    const frame = layoutView(
      layoutInput({ ...spec, stored: Object.fromEntries(result) }),
    ).boundaries.get("shop") as Box;
    expect(overlap(frame, result.get("person") as Box)).toBe(false);
    expect(result.get("person")).toEqual(at(-296, -32, PERSON));
  });

  it("does not grow a frame over an element outside it", () => {
    const spec: ViewSpec = {
      elements: ["c1", "c2", "person", "other"],
      relationships: [["c1", "c2"]],
      boundaries: [{ elementId: "shop", members: ["c1", "c2"], depth: 0 }],
      sizes: { person: PERSON },
    };
    const result = placed(spec, { c1: at(0, 0), person: at(0, 440, PERSON), other: at(320, 0) }, [
      "c2",
    ]);
    expect(result.get("c2")).toEqual(at(-320, 0));
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
    expect(result.get("c2")).toEqual(at(320, 600));
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

  it("is deterministic", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { spec, boxes, unplaced } = randomPinnedView(seed);
      expect(plain(placed(spec, boxes, unplaced))).toEqual(plain(placed(spec, boxes, unplaced)));
    }
  });
});

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
