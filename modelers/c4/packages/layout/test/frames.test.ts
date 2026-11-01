import { describe, expect, it } from "vitest";
import {
  groupKey,
  type AutoLayout,
  type Box,
  type ElementId,
  type ViewMembers,
} from "@miragon/c4-schema-model";
import { layoutView, type ViewGeometry } from "../src/index.js";
import {
  PERSON,
  autoLayout,
  contains,
  layoutInput,
  overlap,
  plain,
  seededRandom,
  type ViewSpec,
} from "./support/views.js";

const PADDING = 32;
const CAPTION = 40;

describe("boundary and group frames", () => {
  it("are the members' union plus the padding and a caption band at the bottom", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["api", "db", "user"],
        relationships: [
          ["user", "api"],
          ["api", "db"],
        ],
        boundaries: [{ elementId: "shop", members: ["api", "db"], depth: 0 }],
        sizes: { user: PERSON },
        stored: { user: { x: 0, y: 0 }, api: { x: 400, y: 0 }, db: { x: 400, y: 320 } },
      }),
    );
    expect(geometry.boundaries.get("shop")).toEqual({
      x: 400 - PADDING,
      y: 0 - PADDING,
      width: 240 + 2 * PADDING,
      height: 320 + 160 + 2 * PADDING + CAPTION,
    });
  });

  it("nest: the system's boundary grows around the container's frame and its other containers", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["web", "controller", "repository"],
        relationships: [
          ["web", "controller"],
          ["controller", "repository"],
        ],
        boundaries: [
          { elementId: "shop", members: ["web"], depth: 0 },
          {
            elementId: "shop.api",
            members: ["controller", "repository"],
            parentId: "shop",
            depth: 1,
          },
        ],
        stored: {
          web: { x: 0, y: 0 },
          controller: { x: 400, y: 0 },
          repository: { x: 400, y: 320 },
        },
      }),
    );
    const inner = geometry.boundaries.get("shop.api");
    const outer = geometry.boundaries.get("shop");
    expect(inner).toEqual({ x: 368, y: -32, width: 304, height: 584 });
    expect(outer).toEqual({
      x: 0 - PADDING,
      y: -32 - PADDING,
      width: 672 + 2 * PADDING,
      height: 584 + 2 * PADDING + CAPTION,
    });
  });

  it("come in the order the projection lists them", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["component"],
        boundaries: [
          { elementId: "shop", members: [], depth: 0 },
          { elementId: "shop.api", members: ["component"], parentId: "shop", depth: 1 },
        ],
        groups: [
          { path: "Outer", name: "Outer", members: [], depth: 0 },
          { path: "Outer/Inner", name: "Inner", members: ["component"], depth: 1 },
        ],
      }),
    );
    expect([...geometry.boundaries.keys()]).toEqual(["shop", "shop.api"]);
    expect([...geometry.groups.keys()]).toEqual(["/Outer", "/Outer/Inner"]);
  });

  it("put a container group inside its system's boundary and an inner group inside the outer one", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["web", "api", "db"],
        boundaries: [{ elementId: "shop", members: ["web", "api", "db"], depth: 0 }],
        groups: [
          { path: "Backend", name: "Backend", members: ["api", "db"], depth: 0 },
          { path: "Backend/Storage", name: "Storage", members: ["db"], depth: 1 },
        ],
      }),
    );
    const storage = geometry.groups.get("/Backend/Storage");
    const backend = geometry.groups.get("/Backend");
    const shop = geometry.boundaries.get("shop");
    expect(storage && backend && shop).toBeTruthy();
    expect(contains(backend as Box, storage as Box)).toBe(true);
    expect(contains(shop as Box, backend as Box)).toBe(true);
    expect(contains(storage as Box, geometry.boxes.get("db") as Box)).toBe(true);
    expect(overlap(backend as Box, geometry.boxes.get("web") as Box)).toBe(false);
  });

  it("do not take a group named like a prefix for the outer one", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        groups: [
          { path: "Back", name: "Back", members: ["a"], depth: 0 },
          { path: "Backend", name: "Backend", members: ["b"], depth: 0 },
        ],
        stored: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } },
      }),
    );
    expect(geometry.groups.get("/Back")).toEqual({ x: -32, y: -32, width: 304, height: 264 });
    expect(geometry.groups.get("/Backend")).toEqual({ x: 368, y: -32, width: 304, height: 264 });
  });

  it("draw a group that names a boundary around that boundary's frame", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["api", "mail"],
        boundaries: [{ elementId: "shop", members: ["api"], depth: 0 }],
        groups: [{ path: "Internal", name: "Internal", members: ["shop", "mail"], depth: 0 }],
      }),
    );
    const shop = geometry.boundaries.get("shop") as Box;
    const internal = geometry.groups.get("/Internal") as Box;
    expect(contains(internal, shop)).toBe(true);
    expect(contains(internal, geometry.boxes.get("mail") as Box)).toBe(true);
  });

  it("draw an empty container-view boundary 320 × 200 at the origin", () => {
    const geometry = layoutView(
      layoutInput({ elements: [], boundaries: [{ elementId: "shop", members: [], depth: 0 }] }),
    );
    expect(geometry.boundaries.get("shop")).toEqual({ x: 0, y: 0, width: 320, height: 200 });
    expect(geometry.mode).toBe("auto");
    expect(geometry.title).toEqual({ x: 0, y: 232 });
  });

  it("draw an empty component-view boundary inside its system's boundary", () => {
    const geometry = layoutView(
      layoutInput({
        elements: [],
        boundaries: [
          { elementId: "shop", members: [], depth: 0 },
          { elementId: "shop.api", members: [], parentId: "shop", depth: 1 },
        ],
      }),
    );
    const inner = geometry.boundaries.get("shop.api") as Box;
    expect(inner).toMatchObject({ width: 320, height: 200 });
    expect(geometry.boundaries.get("shop")).toEqual({
      x: inner.x - PADDING,
      y: inner.y - PADDING,
      width: 320 + 2 * PADDING,
      height: 200 + 2 * PADDING + CAPTION,
    });
  });

  it("keep an empty boundary where the automatic layout drew it when the view is pinned", () => {
    const views: ViewSpec[] = [
      {
        elements: ["user", "mail", "bank"],
        relationships: [
          ["user", "mail"],
          ["bank", "mail"],
        ],
        boundaries: [{ elementId: "shop", members: [], depth: 0 }],
        sizes: { user: PERSON },
      },
      {
        elements: ["user", "web", "db"],
        relationships: [
          ["user", "web"],
          ["web", "db"],
        ],
        boundaries: [
          { elementId: "shop", members: ["web", "db"], depth: 0 },
          { elementId: "shop.api", members: [], parentId: "shop", depth: 1 },
        ],
        sizes: { user: PERSON },
      },
    ];
    for (const spec of views) {
      const automatic = layoutView(layoutInput(spec));
      const stored = Object.fromEntries(
        [...automatic.boxes].map(([id, { x, y }]) => [id, { x, y }]),
      );
      const pinned = layoutView(layoutInput({ ...spec, stored }));
      expect(plain(pinned.boundaries)).toEqual(plain(automatic.boundaries));
      expect(pinned.title).toEqual(automatic.title);
      const user = automatic.boxes.get("user") as Box;
      const moved = layoutView(
        layoutInput({ ...spec, stored: { ...stored, user: { x: user.x + 1000, y: user.y } } }),
      );
      expect(plain(moved.boundaries)).toEqual(plain(automatic.boundaries));
    }
  });

  it("move an empty boundary of a pinned view clear of an element put on its place", () => {
    const spec: ViewSpec = {
      elements: ["user"],
      boundaries: [{ elementId: "shop", members: [], depth: 0 }],
      sizes: { user: PERSON },
    };
    const automatic = layoutView(layoutInput(spec)).boundaries.get("shop") as Box;
    const geometry = layoutView(
      layoutInput({ ...spec, stored: { user: { x: automatic.x + 8, y: automatic.y + 8 } } }),
    );
    const shop = geometry.boundaries.get("shop") as Box;
    expect(shop).toMatchObject({ width: 320, height: 200 });
    expect(overlap(shop, geometry.boxes.get("user") as Box)).toBe(false);
    expect(shop.x % 8).toBe(0);
    expect(shop.y % 8).toBe(0);
  });

  it("keep sibling groups apart when one name starts with the other: Core and Core Services", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        groups: [
          { path: "Core", name: "Core", members: ["a"], depth: 0 },
          { path: "Core Services", name: "Core Services", members: ["b"], depth: 0 },
        ],
        stored: { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } },
      }),
    );
    expect(geometry.groups.get("/Core")).toEqual({ x: -32, y: -32, width: 304, height: 264 });
    expect(geometry.groups.get("/Core Services")).toEqual({
      x: 368,
      y: -32,
      width: 304,
      height: 264,
    });
  });

  it("keep a model-level group and a system's group of one name apart, each with its own frame", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["customer", "web", "api"],
        relationships: [["customer", "web"]],
        boundaries: [{ elementId: "shop", members: ["web", "api"], depth: 0 }],
        groups: [
          { path: "Core", name: "Core", members: ["customer"], depth: 0 },
          { path: "Core", name: "Core", scopeId: "shop", members: ["web", "api"], depth: 0 },
          { path: "Core/Inner", name: "Inner", scopeId: "shop", members: ["api"], depth: 1 },
        ],
        sizes: { customer: PERSON },
        stored: { customer: { x: 0, y: 0 }, web: { x: 0, y: 400 }, api: { x: 400, y: 400 } },
      }),
    );
    expect([...geometry.groups.keys()]).toEqual(["/Core", "shop/Core", "shop/Core/Inner"]);
    const model = geometry.groups.get("/Core") as Box;
    const system = geometry.groups.get("shop/Core") as Box;
    const inner = geometry.groups.get("shop/Core/Inner") as Box;
    expect(model).toEqual({ x: -32, y: -32, width: 280, height: 320 });
    expect(contains(model, geometry.boxes.get("customer") as Box)).toBe(true);
    expect(overlap(model, system)).toBe(false);
    expect(contains(geometry.boundaries.get("shop") as Box, system)).toBe(true);
    expect(contains(system, inner)).toBe(true);
    expect(contains(inner, geometry.boxes.get("api") as Box)).toBe(true);
    expect(contains(inner, geometry.boxes.get("web") as Box)).toBe(false);
  });

  it("are left out for a group that holds no element of the view", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a"],
        groups: [{ path: "Empty", name: "Empty", members: ["elsewhere"], depth: 0 }],
      }),
    );
    expect(geometry.groups.size).toBe(0);
  });

  it("survive a projection whose boundaries name each other as parents", () => {
    const geometry = layoutView(
      layoutInput({
        elements: ["a", "b"],
        boundaries: [
          { elementId: "x", members: ["a"], parentId: "y", depth: 0 },
          { elementId: "y", members: ["b"], parentId: "x", depth: 0 },
        ],
      }),
    );
    expect(geometry.boundaries.size).toBe(2);
    expect(overlap(geometry.boxes.get("a") as Box, geometry.boxes.get("b") as Box)).toBe(false);
  });
});

describe("an automatic layout with frames", { timeout: 60_000 }, () => {
  const directions: AutoLayout["rankDirection"][] = ["tb", "bt", "lr", "rl"];
  const settings: (AutoLayout | undefined)[] = [
    undefined,
    ...directions.map((direction) => autoLayout(direction)),
    ...directions.map((direction) => autoLayout(direction, 100, 50, 50)),
    ...directions.map((direction) => autoLayout(direction, 0, 0, 0)),
    autoLayout("lr", 600, 400, 200),
  ];

  it("keeps every frame clear of the elements and frames outside it", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const setting of settings) {
        const spec = { ...randomFramedView(seed), ...(setting ? { autoLayout: setting } : {}) };
        const geometry = layoutView(layoutInput(spec));
        expect(frameProblems(spec, geometry), `seed ${seed} ${JSON.stringify(setting)}`).toEqual(
          [],
        );
      }
    }
  });

  it("keeps every frame clear when relationships repeat a pair in one or both directions", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const setting of settings) {
        const spec = {
          ...randomFramedView(seed, true),
          ...(setting ? { autoLayout: setting } : {}),
        };
        const geometry = layoutView(layoutInput(spec));
        expect(frameProblems(spec, geometry), `seed ${seed} ${JSON.stringify(setting)}`).toEqual(
          [],
        );
      }
    }
  });

  it("keeps nested groups of a landscape clear of each other and of the elements outside them", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const setting of settings) {
        const spec = {
          ...randomGroupedLandscape(seed),
          ...(setting ? { autoLayout: setting } : {}),
        };
        const geometry = layoutView(layoutInput(spec));
        expect(frameProblems(spec, geometry), `seed ${seed} ${JSON.stringify(setting)}`).toEqual(
          [],
        );
      }
    }
  });
});

interface FrameSpec {
  readonly key: string;
  readonly box: Box | undefined;
  readonly holds: ReadonlySet<ElementId>;
  readonly frames: ReadonlySet<string>;
}

function frameProblems(spec: ViewSpec, geometry: ViewGeometry): string[] {
  const problems: string[] = [];
  const ids = [...geometry.boxes.keys()];
  ids.forEach((first, index) => {
    for (const second of ids.slice(index + 1)) {
      if (overlap(geometry.boxes.get(first) as Box, geometry.boxes.get(second) as Box)) {
        problems.push(`${first} overlaps ${second}`);
      }
    }
  });
  const frames = framesOf(spec, geometry);
  for (const frame of frames) {
    if (!frame.box) {
      problems.push(`${frame.key} has no frame`);
      continue;
    }
    for (const id of ids) {
      const box = geometry.boxes.get(id) as Box;
      if (frame.holds.has(id) && !contains(frame.box, box))
        problems.push(`${frame.key} misses ${id}`);
      if (!frame.holds.has(id) && overlap(frame.box, box))
        problems.push(`${frame.key} covers ${id}`);
    }
    for (const other of frames) {
      if (other === frame || !other.box) continue;
      const related = frame.frames.has(other.key) || other.frames.has(frame.key);
      if (!related && overlap(frame.box, other.box))
        problems.push(`${frame.key} covers ${other.key}`);
    }
  }
  return problems;
}

function framesOf(spec: ViewSpec, geometry: ViewGeometry): FrameSpec[] {
  const boundaries = spec.boundaries ?? [];
  const groups = spec.groups ?? [];
  return [
    ...boundaries.map((boundary) => {
      const inner = boundaries.filter((other) => other.parentId === boundary.elementId);
      const innerGroups = groups.filter((group) =>
        group.members.every(
          (id) =>
            boundary.members.includes(id) || inner.some((child) => child.members.includes(id)),
        ),
      );
      return {
        key: `boundary ${boundary.elementId}`,
        box: geometry.boundaries.get(boundary.elementId),
        holds: new Set([...boundary.members, ...inner.flatMap((child) => child.members)]),
        frames: new Set([
          ...inner.map((child) => `boundary ${child.elementId}`),
          ...innerGroups.map((group) => `group ${group.path}`),
        ]),
      };
    }),
    ...groups.map((group) => {
      const inner = groups.filter((other) => other.path.startsWith(`${group.path}/`));
      return {
        key: `group ${group.path}`,
        box: geometry.groups.get(groupKey(group.scopeId, group.path)),
        holds: new Set([...group.members, ...inner.flatMap((other) => other.members)]),
        frames: new Set(inner.map((other) => `group ${other.path}`)),
      };
    }),
  ];
}

/** People and systems in nested model groups; the outer group lists its inner group's members or not. */
function randomGroupedLandscape(seed: number): ViewSpec {
  const random = seededRandom(seed * 7919);
  const count = (low: number, high: number): number =>
    low + Math.floor(random() * (high - low + 1));
  const elements = Array.from({ length: count(2, 9) }, (_, index) =>
    index % 3 === 0 ? `person${index}` : `system${index}`,
  );
  const paths = ["Org", "Org/Team", "Org/Team/Squad", "Partners"];
  const direct = new Map<string, ElementId[]>(paths.map((path) => [path, []]));
  for (const id of elements) {
    const choice = Math.floor(random() * (paths.length + 2));
    direct.get(paths[choice] ?? "")?.push(id);
  }
  const listsInner = random() < 0.5;
  const groups: ViewMembers["groups"] = paths
    .map((path) => {
      const inner = paths.filter((other) => other.startsWith(`${path}/`));
      const members = [
        ...(direct.get(path) ?? []),
        ...(listsInner ? inner.flatMap((other) => direct.get(other) ?? []) : []),
      ];
      return {
        path,
        name: path.split("/").pop() ?? path,
        members,
        depth: path.split("/").length - 1,
      };
    })
    .filter(
      (group) =>
        group.members.length > 0 ||
        paths.some(
          (other) => other.startsWith(`${group.path}/`) && (direct.get(other) ?? []).length > 0,
        ),
    );
  const relationships: [ElementId, ElementId][] = [];
  for (let index = 0; index < count(1, elements.length * 2); index++) {
    const source = elements[Math.floor(random() * elements.length)] as ElementId;
    const destination = elements[Math.floor(random() * elements.length)] as ElementId;
    if (
      source !== destination &&
      !relationships.some(([s, d]) => s === source && d === destination)
    ) {
      relationships.push([source, destination]);
    }
  }
  return {
    elements,
    relationships,
    groups,
    sizes: Object.fromEntries(
      elements.filter((id) => id.startsWith("person")).map((id) => [id, PERSON]),
    ),
  };
}

/**
 * A container or component view: people and other systems outside, the scope's boundary with its
 * containers and a container group, in a component view also the container's boundary inside it.
 */
function randomFramedView(seed: number, parallel = false): ViewSpec {
  const random = seededRandom(seed);
  const count = (low: number, high: number): number =>
    low + Math.floor(random() * (high - low + 1));
  const people = Array.from({ length: count(0, 3) }, (_, index) => `person${index}`);
  const systems = Array.from({ length: count(0, 3) }, (_, index) => `system${index}`);
  const containers = Array.from({ length: count(1, 5) }, (_, index) => `container${index}`);
  const component = random() < 0.5;
  const components = component
    ? Array.from({ length: count(1, 4) }, (_, index) => `component${index}`)
    : [];
  const grouped = containers.filter(() => random() < 0.4);
  const elements = [...people, ...containers, ...components, ...systems];
  const relationships: { key: string; sourceId: ElementId; destinationId: ElementId }[] = [];
  const pairs = new Set<string>();
  for (let index = 0; index < count(elements.length - 1, elements.length * 2); index++) {
    const source = elements[Math.floor(random() * elements.length)] as ElementId;
    const destination = elements[Math.floor(random() * elements.length)] as ElementId;
    const key = `${source}->${destination}`;
    if (source === destination || (pairs.has(key) && !parallel)) continue;
    relationships.push({
      key: pairs.has(key) ? `${key}#${index}` : key,
      sourceId: source,
      destinationId: destination,
    });
    pairs.add(key);
  }
  const boundaries: ViewMembers["boundaries"] = component
    ? [
        { elementId: "scope", members: containers, depth: 0 },
        { elementId: "scope.api", members: components, parentId: "scope", depth: 1 },
      ]
    : [{ elementId: "scope", members: containers, depth: 0 }];
  const groups: ViewMembers["groups"] =
    grouped.length > 0 ? [{ path: "Core", name: "Core", members: grouped, depth: 0 }] : [];
  return {
    elements,
    relationships,
    boundaries,
    groups,
    sizes: Object.fromEntries(people.map((id) => [id, PERSON])),
  };
}
