import { describe, expect, it } from "vitest";
import type { Box, ElementId } from "@miragon/c4-schema-model";
import { layoutView, type LayoutInput, type ViewGeometry } from "../src/index.js";
import { autoLayoutBoxes } from "../src/autoLayout.js";
import { clusterTree } from "../src/clusters.js";
import { HORIZONTAL_GAP } from "../src/placement.js";
import {
  BOX,
  PERSON,
  autoLayout,
  layoutInput,
  overlap,
  plain,
  seededRandom,
  type ViewSpec,
} from "./support/views.js";

const LABEL = { width: 160, height: 48 };

const BOOKSHOP: ViewSpec = {
  elements: ["customer", "bookshop", "payments", "mail"],
  relationships: [
    ["customer", "bookshop"],
    ["bookshop", "payments"],
    ["bookshop", "mail"],
  ],
  sizes: { customer: PERSON },
};

function box(geometry: ViewGeometry, id: ElementId): Box {
  const found = geometry.boxes.get(id);
  if (!found) throw new Error(`no box for ${id}`);
  return found;
}

function pinned(geometry: ViewGeometry): Record<string, { x: number; y: number }> {
  return Object.fromEntries([...geometry.boxes].map(([id, { x, y }]) => [id, { x, y }]));
}

describe("layoutView without stored boxes", () => {
  it("lays out nothing for an empty view and anchors the title at the origin", () => {
    const geometry = layoutView(layoutInput({ elements: [] }));
    expect(geometry.mode).toBe("auto");
    expect(geometry.boxes.size).toBe(0);
    expect(geometry.placed.size).toBe(0);
    expect(geometry.title).toEqual({ x: 0, y: 0 });
  });

  it("puts a single element at the origin in its size", () => {
    const geometry = layoutView(layoutInput({ elements: ["user"], sizes: { user: PERSON } }));
    expect(box(geometry, "user")).toEqual({ x: 0, y: 0, ...PERSON });
  });

  it("ranks top to bottom by default with 300 px between ranks, plus the label box", () => {
    const geometry = layoutView(layoutInput({ elements: ["a", "b"], relationships: [["a", "b"]] }));
    expect(box(geometry, "a")).toEqual({ x: 0, y: 0, ...BOX });
    expect(box(geometry, "b")).toEqual({ x: 0, y: 160 + 160 + LABEL.height, ...BOX });
    expect(geometry.mode).toBe("auto");
  });

  it("draws a written view without autoLayout like a draft: tb 300 160 50", () => {
    const written = layoutView(layoutInput(BOOKSHOP));
    const draft = layoutView(
      layoutInput({ ...BOOKSHOP, autoLayout: autoLayout("tb", 300, 160, 50) }),
    );
    expect(plain(written)).toEqual(plain(draft));
  });

  it("follows the rank direction of the autoLayout statement", () => {
    const spec: ViewSpec = { elements: ["a", "b"], relationships: [["a", "b"]] };
    const of = (direction: "tb" | "bt" | "lr" | "rl") =>
      layoutView(layoutInput({ ...spec, autoLayout: autoLayout(direction) }));
    expect(box(of("tb"), "b").y).toBeGreaterThan(box(of("tb"), "a").y);
    expect(box(of("bt"), "b").y).toBeLessThan(box(of("bt"), "a").y);
    expect(box(of("lr"), "b").x).toBeGreaterThan(box(of("lr"), "a").x);
    expect(box(of("rl"), "b").x).toBeLessThan(box(of("rl"), "a").x);
  });

  it("converts the separations to modeler units and clamps them to 80 between ranks and 60 between nodes", () => {
    const spec: ViewSpec = {
      elements: ["a", "b", "c"],
      relationships: [
        ["a", "b"],
        ["a", "c"],
      ],
    };
    const bare = layoutView(layoutInput({ ...spec, autoLayout: autoLayout("lr", 100, 50, 50) }));
    const atTheFloor = layoutView(
      layoutInput({ ...spec, autoLayout: autoLayout("lr", 150, 112, 50) }),
    );
    expect(plain(bare)).toEqual(plain(atTheFloor));
    const a = box(bare, "a");
    const [upper, lower] = [box(bare, "b"), box(bare, "c")].sort(
      (first, second) => first.y - second.y,
    );
    expect(upper && upper.x - (a.x + a.width)).toBe(80 + LABEL.width);
    expect(upper && lower && lower.y - (upper.y + upper.height)).toBe(60);
  });

  it("never overlaps two elements", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const geometry = layoutView(layoutInput(randomView(seed)));
      const boxes = [...geometry.boxes.values()];
      boxes.forEach((first, index) => {
        for (const second of boxes.slice(index + 1)) {
          expect(overlap(first, second), `seed ${seed}`).toBe(false);
        }
      });
    }
  });

  it("ranks a two-way pair with a second line one way instead of falling back to a row", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["web", "api", "worker", "db"],
        relationships: [
          { key: "api->web", sourceId: "api", destinationId: "web" },
          { key: "calls", sourceId: "web", destinationId: "api" },
          { key: "worker->db", sourceId: "worker", destinationId: "db" },
          { key: "worker->api", sourceId: "worker", destinationId: "api" },
          { key: "polls", sourceId: "web", destinationId: "api" },
          { key: "web->worker", sourceId: "web", destinationId: "worker" },
        ],
      }),
    );
    expect(box(geometry, "worker").y).toBeGreaterThan(box(geometry, "web").y);
    expect(box(geometry, "db").y).toBeGreaterThan(box(geometry, "worker").y);
    expect([...geometry.labelBoxes.keys()]).toHaveLength(6);
  });

  it("drops dagre's bend points, so every line is straight between its docked ends", () => {
    const spec: ViewSpec = {
      elements: ["a", "b", "c", "d"],
      relationships: [
        ["a", "b"],
        ["b", "c"],
        ["a", "c"],
        ["c", "d"],
        ["a", "d"],
      ],
    };
    for (const vertices of [true, false]) {
      const geometry = layoutView(
        layoutInput({ ...spec, autoLayout: autoLayout("tb", 300, 160, 50, vertices) }),
      );
      expect([...geometry.vertices.values()]).toEqual([[], [], [], [], []]);
    }
  });
});

describe("the automatic layout of graphs with parallel and two-way relationships", () => {
  it("never needs the placement fallback", { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 300; seed++) {
      const spec = randomMultigraph(seed);
      const input = layoutInput(spec);
      for (const setting of [undefined, autoLayout("lr", 100, 50, 50)]) {
        expect(
          () =>
            autoLayoutBoxes({
              tree: clusterTree(input.members),
              elements: spec.elements,
              sizeOf: (id) => input.sizes.get(id) ?? BOX,
              edges: [...input.relationshipEnds].map(([key, ends]) => ({ key, ...ends })),
              autoLayout: setting,
            }),
          `seed ${seed}`,
        ).not.toThrow();
      }
    }
  });
});

describe("layoutView determinism and text independence", () => {
  it("returns the same geometry for the same input twice", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spec = randomView(seed);
      expect(plain(layoutView(layoutInput(spec)))).toEqual(plain(layoutView(layoutInput(spec))));
    }
  });

  it("does not depend on the order of the lookup maps, only on document and relationship order", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const input = layoutInput(randomView(seed));
      const reversed: LayoutInput = {
        ...input,
        sizes: new Map([...input.sizes].reverse()),
        relationshipEnds: new Map([...input.relationshipEnds].reverse()),
        stored: { ...input.stored, elements: new Map([...input.stored.elements].reverse()) },
      };
      expect(plain(layoutView(reversed))).toEqual(plain(layoutView(input)));
    }
  });

  it("leaves every box where it was after a rename or a new description: neither reaches the input", () => {
    const before = layoutInput(BOOKSHOP);
    const after: LayoutInput = {
      ...before,
      members: {
        ...before.members,
        diagnostics: [
          {
            severity: "info",
            code: "relationship-ambiguous",
            message: "A description changed.",
            range: { start: 0, end: 1 },
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 2,
            rejects: false,
            anchor: "bookshop",
          },
        ],
      },
      stored: { ...before.stored, unmatched: ["c4modeler.element.gone"], malformed: ["x"] },
      relationshipEnds: new Map([
        ...before.relationshipEnds,
        ["elsewhere->bookshop", { sourceId: "elsewhere", destinationId: "bookshop" }],
      ]),
    };
    expect(plain(layoutView(after))).toEqual(plain(layoutView(before)));
  });

  it("leaves every box where it was after an identifier rename, which does not pin the view", () => {
    const renamed = (id: string): string =>
      id === "e1" ? "zz.renamed" : id === "e2" ? "A" : id === "scope" ? "0scope" : id;
    for (let seed = 1; seed <= 40; seed++) {
      const spec = randomMultigraph(seed);
      const respelled: ViewSpec = {
        elements: spec.elements.map(renamed),
        relationships: (spec.relationships ?? []).map((relationship) =>
          "sourceId" in relationship
            ? {
                ...relationship,
                sourceId: renamed(relationship.sourceId),
                destinationId: renamed(relationship.destinationId),
              }
            : relationship,
        ),
        boundaries: (spec.boundaries ?? []).map((boundary) => ({
          ...boundary,
          elementId: renamed(boundary.elementId),
          members: boundary.members.map(renamed),
          ...(boundary.parentId === undefined ? {} : { parentId: renamed(boundary.parentId) }),
        })),
        groups: (spec.groups ?? []).map((group) => ({
          ...group,
          members: group.members.map(renamed),
        })),
      };
      const before = layoutView(layoutInput(spec));
      const after = layoutView(layoutInput(respelled));
      expect(
        spec.elements.map((id) => after.boxes.get(renamed(id))),
        `seed ${seed}`,
      ).toEqual(spec.elements.map((id) => before.boxes.get(id)));
      expect(plain(after.groups), `seed ${seed}`).toEqual(plain(before.groups));
    }
  });
});

describe("layoutView with stored boxes", () => {
  it("uses every stored box as it is and reports the view as stored", () => {
    const geometry = layoutView(
      layoutInput({
        ...BOOKSHOP,
        stored: {
          customer: { x: -13, y: 7 },
          bookshop: { x: 400, y: 0 },
          payments: { x: 400, y: 400 },
          mail: { x: 800, y: 400 },
        },
      }),
    );
    expect(geometry.mode).toBe("stored");
    expect([...geometry.placed]).toEqual(["customer", "bookshop", "payments", "mail"]);
    expect(box(geometry, "customer")).toEqual({ x: -13, y: 7, ...PERSON });
    expect(box(geometry, "mail")).toEqual({ x: 800, y: 400, ...BOX });
  });

  it("takes the sizes of the input, which already carry a stored width and height", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a"],
        sizes: { a: { width: 320, height: 96 } },
        stored: { a: { x: 0, y: 0, width: 320, height: 96 } },
      }),
    );
    expect(box(geometry, "a")).toEqual({ x: 0, y: 0, width: 320, height: 96 });
  });

  it("places the unplaced elements of a pinned view and reports it as mixed", () => {
    const geometry = layoutView(
      layoutInput({
        ...BOOKSHOP,
        stored: { customer: { x: 0, y: 0 }, bookshop: { x: 0, y: 400 } },
      }),
    );
    expect(geometry.mode).toBe("mixed");
    expect([...geometry.placed]).toEqual(["customer", "bookshop"]);
    expect(box(geometry, "payments")).toEqual({ x: BOX.width + HORIZONTAL_GAP, y: 400, ...BOX });
    const boxes = [...geometry.boxes.values()];
    boxes.forEach((first, index) => {
      for (const second of boxes.slice(index + 1)) expect(overlap(first, second)).toBe(false);
    });
  });

  it("ignores stored boxes of elements the view does not show", () => {
    const geometry = layoutView(
      layoutInput({ elements: ["a"], stored: { gone: { x: 400, y: 400 } } }),
    );
    expect(geometry.mode).toBe("auto");
    expect(geometry.boxes.has("gone")).toBe(false);
  });

  it("changes no box, frame, label or title when an automatic layout is pinned", () => {
    const spec: ViewSpec = {
      ...BOOKSHOP,
      elements: [...BOOKSHOP.elements, "api"],
      relationships: [...(BOOKSHOP.relationships ?? []), ["customer", "api"]],
      boundaries: [{ elementId: "core", members: ["payments", "api"], depth: 0 }],
      groups: [{ path: "Outside", name: "Outside", members: ["mail"], depth: 0 }],
    };
    const automatic = layoutView(layoutInput(spec));
    const pinnedGeometry = layoutView(layoutInput({ ...spec, stored: pinned(automatic) }));
    expect(pinnedGeometry.mode).toBe("stored");
    expect(plain({ ...pinnedGeometry, mode: "auto", placed: [] })).toEqual(
      plain({ ...automatic, placed: [] }),
    );
  });
});

describe("layoutView relationships", () => {
  it("keeps the user's vertices in every mode and gives every drawn relationship an entry", () => {
    const vertices = { "customer->bookshop": [{ x: 500, y: 100 }] };
    const automatic = layoutView(layoutInput({ ...BOOKSHOP, vertices }));
    expect(automatic.vertices.get("customer->bookshop")).toEqual([{ x: 500, y: 100 }]);
    expect(automatic.vertices.get("bookshop->mail")).toEqual([]);
    const stored = layoutView(
      layoutInput({
        ...BOOKSHOP,
        vertices,
        stored: { customer: { x: 0, y: 0 }, bookshop: { x: 0, y: 400 } },
      }),
    );
    expect(stored.vertices.get("customer->bookshop")).toEqual([{ x: 500, y: 100 }]);
    expect([...stored.vertices.keys()]).toEqual([
      "customer->bookshop",
      "bookshop->payments",
      "bookshop->mail",
    ]);
  });

  it("puts a fixed 160 × 48 label box halfway along the line between the docked ends", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [["a", "b"]],
        sizes: { b: { width: 240, height: 400 } },
        stored: { a: { x: 0, y: 0 }, b: { x: 640, y: -120 } },
      }),
    );
    expect(geometry.labelBoxes.get("a->b")).toEqual({ x: 360, y: 56, ...LABEL });
  });

  it("follows the vertices to the halfway point", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [["a", "b"]],
        stored: { a: { x: 0, y: 0 }, b: { x: 0, y: 800 } },
        vertices: {
          "a->b": [
            { x: 520, y: 80 },
            { x: 520, y: 880 },
          ],
        },
      }),
    );
    expect(geometry.labelBoxes.get("a->b")).toEqual({ x: 440, y: 456, ...LABEL });
  });

  it("puts the label of a relationship to itself beside the element", () => {
    const geometry = layoutView(
      layoutInput({ elements: ["a"], relationships: [["a", "a"]], stored: { a: { x: 0, y: 0 } } }),
    );
    expect(geometry.labelBoxes.get("a->a")).toEqual({ x: 240, y: 56, ...LABEL });
  });

  it("keys vertices and labels by canvas key and skips a relationship whose end is not drawn", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        relationships: [
          { key: "implied:a->b", sourceId: "a", destinationId: "b" },
          { key: "a->b#2", sourceId: "a", destinationId: "b" },
          { key: "a->gone", sourceId: "a", destinationId: "gone" },
        ],
      }),
    );
    expect([...geometry.labelBoxes.keys()]).toEqual(["implied:a->b", "a->b#2"]);
    expect([...geometry.vertices.keys()]).toEqual(["implied:a->b", "a->b#2"]);
  });
});

describe("layoutView title", () => {
  it("sits 32 below the lowest box at the leftmost box's x", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        stored: { a: { x: 120, y: 0 }, b: { x: -40, y: 400 } },
      }),
    );
    expect(geometry.title).toEqual({ x: -40, y: 400 + 160 + 32 });
  });

  it("sits below a boundary's caption band", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a"],
        boundaries: [{ elementId: "shop", members: ["a"], depth: 0 }],
        stored: { a: { x: 0, y: 0 } },
      }),
    );
    expect(geometry.title).toEqual({ x: -32, y: 160 + 32 + 40 + 32 });
  });
});

/** A container or component view whose relationships often repeat a pair, in one or both directions. */
function randomMultigraph(seed: number): ViewSpec {
  const random = seededRandom(seed * 31);
  const size = 2 + Math.floor(random() * 14);
  const elements = Array.from({ length: size }, (_, index) => `e${index}`);
  const inner = elements.filter(() => random() < 0.4);
  const deeper = inner.filter(() => random() < 0.5);
  const relationships = Array.from({ length: size * 2 }, (_, index) => ({
    key: `r${index}`,
    sourceId: elements[Math.floor(random() * size)] as ElementId,
    destinationId: elements[Math.floor(random() * size)] as ElementId,
  }));
  return {
    elements,
    relationships,
    boundaries: [
      { elementId: "scope", members: inner.filter((id) => !deeper.includes(id)), depth: 0 },
      { elementId: "scope.api", members: deeper, parentId: "scope", depth: 1 },
    ],
    groups: [
      { path: "Core", name: "Core", members: elements.filter(() => random() < 0.2), depth: 0 },
    ],
  };
}

/** A landscape: people and systems with random relationships, sometimes two between one pair. */
function randomView(seed: number): ViewSpec {
  const random = seededRandom(seed);
  const size = 2 + Math.floor(random() * 10);
  const elements = Array.from({ length: size }, (_, index) =>
    index % 4 === 0 ? `person${index}` : `system${index}`,
  );
  const relationships: { key: string; sourceId: ElementId; destinationId: ElementId }[] = [];
  for (let index = 0; index < size * 2; index++) {
    const sourceId = elements[Math.floor(random() * size)] as ElementId;
    const destinationId = elements[Math.floor(random() * size)] as ElementId;
    if (sourceId === destinationId) continue;
    relationships.push({ key: `r${index}`, sourceId, destinationId });
  }
  const stored = Object.fromEntries(
    elements
      .map(
        (id, index) =>
          [id, { x: (index % 4) * 400 - 600, y: Math.floor(index / 4) * 400 }] as const,
      )
      .filter(() => random() < 0.3),
  );
  return {
    elements,
    relationships,
    sizes: Object.fromEntries(
      elements.filter((id) => id.startsWith("person")).map((id) => [id, PERSON]),
    ),
    ...(seed % 2 === 0 ? { stored } : {}),
  };
}
