import { describe, it, expect } from "vitest";
import {
  evolutionStage,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_STAGE_BOUNDARIES,
  DEFAULT_EVOLUTION_LABELS,
  EVOLUTION_PRESETS,
  loadMap,
  serializeMap,
  parseMapJSON,
  validateMap,
  createEmptyMap,
  normalizeEvolutionLabels,
  sameEvolutionLabels,
  type WardleyMap,
} from "../src/index.js";

describe("EVOLUTION_PRESETS (Landscape-Cheat-Sheet)", () => {
  it("the first preset (Activities) matches the default", () => {
    expect(EVOLUTION_PRESETS[0]?.id).toBe("activities");
    expect(EVOLUTION_PRESETS[0]?.labels).toEqual(DEFAULT_EVOLUTION_LABELS);
  });

  it("each preset has exactly four stage labels and a unique id", () => {
    for (const p of EVOLUTION_PRESETS) {
      expect(p.labels).toHaveLength(4);
      expect(p.labels.every((l) => l.length > 0)).toBe(true);
    }
    const ids = EVOLUTION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains the classic Landscape variants", () => {
    const ids = EVOLUTION_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["activities", "practices", "data", "knowledge"]));
  });
});

describe("evolutionStage", () => {
  it("maps the four stages correctly", () => {
    expect(evolutionStage(0.0)).toBe(0);
    expect(evolutionStage(0.16)).toBe(0);
    expect(evolutionStage(0.17)).toBe(1);
    expect(evolutionStage(0.39)).toBe(1);
    expect(evolutionStage(0.4)).toBe(2);
    expect(evolutionStage(0.69)).toBe(2);
    expect(evolutionStage(0.7)).toBe(3);
    expect(evolutionStage(1.0)).toBe(3);
  });

  it("respects custom boundaries", () => {
    expect(evolutionStage(0.5, [0.6, 0.7, 0.8])).toBe(0);
    expect(DEFAULT_STAGE_BOUNDARIES).toEqual([0.17, 0.4, 0.7]);
  });
});

const sample: WardleyMap = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  config: { title: "Tea Shop", style: "wardley" },
  elements: [
    {
      id: "cmp_kettle",
      elementType: "component",
      label: "Kettle",
      position: { visibility: 0.43, evolution: 0.35 },
    },
    {
      id: "anchor_1",
      elementType: "anchor",
      label: "User",
      position: { visibility: 0.95, evolution: 0.63 },
    },
  ],
  edges: [{ id: "dep_1", edgeType: "dependency", from: "anchor_1", to: "cmp_kettle" }],
};

describe("Serialization", () => {
  it("is deterministic: elements sorted by id, keys stable, coordinates rounded", () => {
    const out = serializeMap(sample);
    expect(out.indexOf("anchor_1")).toBeLessThan(out.indexOf("cmp_kettle"));
    expect(serializeMap(parseMapJSON(out))).toBe(out);
  });

  it("rounds coordinates to 3 decimal places", () => {
    const noisy = {
      ...sample,
      elements: [
        { ...sample.elements[0]!, position: { visibility: 0.123456, evolution: 0.987654 } },
      ],
    };
    expect(serializeMap(noisy as WardleyMap)).toContain("0.123");
    expect(serializeMap(noisy as WardleyMap)).toContain("0.988");
  });

  describe("a value a JavaScript caller puts in several places", () => {
    /** A map with fields the schema does not define, as only an unvalidated map holds them. */
    const unvalidated = (map: unknown): WardleyMap => map as WardleyMap;
    /** The same map with every shared object and array copied, as a parsed file holds it. */
    const unshared = (map: unknown): WardleyMap => JSON.parse(JSON.stringify(map)) as WardleyMap;

    const expectWrittenAtEachPlace = (map: unknown): void => {
      const text = serializeMap(unvalidated(map));
      expect(text).toBe(serializeMap(unshared(map)));
      expect(serializeMap(unshared(JSON.parse(text)))).toBe(text);
    };

    const first = sample.elements[0]!;
    const second = sample.elements[1]!;
    const edge = sample.edges[0]!;
    const backEdge = { id: "dep_2", edgeType: "dependency", from: "cmp_kettle", to: "anchor_1" };

    it("writes an object shared by two edges at both places", () => {
      const shared = { owner: "ops" };
      const sharing = {
        ...sample,
        edges: [
          { ...edge, "x-tag": shared },
          { ...backEdge, "x-tag": shared },
        ],
      };
      expectWrittenAtEachPlace(sharing);
      const written = JSON.parse(serializeMap(unvalidated(sharing))) as {
        edges: Record<string, unknown>[];
      };
      expect(written.edges.map((writtenEdge) => writtenEdge["x-tag"])).toEqual([
        { owner: "ops" },
        { owner: "ops" },
      ]);
    });

    it("writes an array shared by the map, its config, an element and an edge", () => {
      const shared = ["b", { a: 1.23456 }];
      expectWrittenAtEachPlace({
        ...sample,
        "x-tags": shared,
        config: { ...sample.config, "x-tags": shared },
        elements: [{ ...first, "x-tags": shared }, second],
        edges: [{ ...edge, "x-tags": shared }],
      });
    });

    it("writes an object shared at different depths, and a chain that holds each level twice", () => {
      const leaf = { value: 1 };
      expectWrittenAtEachPlace({
        ...sample,
        "x-shallow": leaf,
        elements: [
          { ...first, "x-deep": { first: [leaf, { second: [[leaf]] }], again: leaf } },
          second,
        ],
      });

      let chain: unknown = { leaf };
      for (let level = 0; level < 10; level++) {
        chain = { left: chain, right: [chain] };
      }
      const text = serializeMap(unvalidated({ ...sample, "x-chain": chain }));
      expect(text.match(/"leaf"/g)).toHaveLength(2 ** 10);
      expectWrittenAtEachPlace({ ...sample, "x-chain": chain });
      expectWrittenAtEachPlace({ ...sample, elements: [{ ...first, "x-chain": chain }, second] });
    });

    const repeatLimit =
      "Cannot serialize a map whose shared objects and arrays would repeat more than 1000000 entries.";
    const numbers = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

    // The rounded copy writes the elements and the config, the sorted copy everything else.
    describe.each([
      ["on the map", (value: unknown): WardleyMap => unvalidated({ ...sample, "x-value": value })],
      [
        "on an element",
        (value: unknown): WardleyMap =>
          unvalidated({ ...sample, elements: [{ ...first, "x-value": value }, second] }),
      ],
      [
        "in the config",
        (value: unknown): WardleyMap =>
          unvalidated({ ...sample, config: { ...sample.config, "x-value": value } }),
      ],
    ])("%s", (_, holding) => {
      it("refuses a chain that holds each level twice before it exhausts the memory", () => {
        let chain: unknown = { leaf: 1 };
        for (let level = 0; level < 40; level++) {
          chain = { left: chain, right: chain };
        }
        expect(() => serializeMap(holding(chain))).toThrow(repeatLimit);
      });

      it("refuses a wide array at the end of such a chain before it exhausts the memory", () => {
        let chain: unknown = numbers(1_000);
        for (let level = 0; level < 14; level++) {
          chain = { left: chain, right: chain };
        }
        expect(() => serializeMap(holding(chain))).toThrow(repeatLimit);
      });

      it("refuses one wide object held a thousand times before it exhausts the memory", () => {
        const wide = Object.fromEntries(numbers(2_000).map((index) => [`key-${index}`, index]));
        expect(() => serializeMap(holding(Array<unknown>(1_000).fill(wide)))).toThrow(repeatLimit);
      });

      it("counts the entries of a shared value at every place after its first", () => {
        const wide = numbers(1_000);
        const atTheLimit = holding(Array<unknown>(1_001).fill(wide));
        expect(serializeMap(atTheLimit)).toBe(serializeMap(unshared(atTheLimit)));

        const pastTheLimit = holding(Array<unknown>(1_002).fill(wide));
        expect(() => serializeMap(pastTheLimit)).toThrow(repeatLimit);
      });
    });

    it("counts a value both copies write in one count", () => {
      const wide = numbers(1_000);
      const holdingAt = (placesOnTheMap: number): WardleyMap =>
        unvalidated({
          ...sample,
          "x-many": Array<unknown>(placesOnTheMap).fill(wide),
          elements: [{ ...first, "x-value": wide }, second],
        });
      expect(serializeMap(holdingAt(1_000))).toBe(serializeMap(unshared(holdingAt(1_000))));
      expect(() => serializeMap(holdingAt(1_001))).toThrow(repeatLimit);
    });

    it("writes a map that shares nothing, even with more than a million objects", () => {
      const log = numbers(1_000_000).map((index) => ({ entry: index }));
      const text = serializeMap(
        unvalidated({ ...sample, config: { ...sample.config, "x-log": log } }),
      );
      expect(serializeMap(unshared(JSON.parse(text)))).toBe(text);
    }, 30_000);

    it("still refuses an object or an array that contains itself", () => {
      const message = "Cyclic reference in WardleyMap.";
      const cyclicObject: Record<string, unknown> = { name: "loop" };
      cyclicObject["self"] = { back: [cyclicObject] };
      const cyclicArray: unknown[] = [];
      cyclicArray.push([cyclicArray]);
      for (const cycle of [cyclicObject, cyclicArray]) {
        expect(() => serializeMap(unvalidated({ ...sample, "x-cycle": cycle }))).toThrow(message);
        expect(() =>
          serializeMap(
            unvalidated({ ...sample, elements: [{ ...first, "x-cycle": cycle }, second] }),
          ),
        ).toThrow(message);
        expect(() =>
          serializeMap(unvalidated({ ...sample, config: { ...sample.config, "x-cycle": cycle } })),
        ).toThrow(message);
      }

      const element: Record<string, unknown> = { ...first };
      element["x-owner"] = { element };
      expect(() => serializeMap(unvalidated({ ...sample, elements: [element] }))).toThrow(message);
    });
  });
});

describe("Validation", () => {
  it("accepts an empty map", () => {
    expect(() => validateMap(createEmptyMap())).not.toThrow();
  });

  it("rejects edges with an unknown endpoint", () => {
    const bad = {
      ...sample,
      edges: [{ id: "x", edgeType: "dependency", from: "ghost", to: "cmp_kettle" }],
    };
    expect(() => loadMap(bad)).toThrow(/references no element/);
  });

  it("rejects coordinates outside [0,1]", () => {
    const bad = {
      ...sample,
      elements: [{ ...sample.elements[0]!, position: { visibility: 1.5, evolution: 0.5 } }],
    };
    expect(() => loadMap(bad)).toThrow();
  });

  it("rejects an unknown higher schemaVersion", () => {
    expect(() => loadMap({ ...sample, schemaVersion: 99 })).toThrow(/schemaVersion/);
  });

  it("rejects edge IDs that collide with element IDs (shared namespace)", () => {
    const bad = {
      ...sample,
      edges: [{ id: "cmp_kettle", edgeType: "dependency", from: "anchor_1", to: "cmp_kettle" }],
    };
    expect(() => loadMap(bad)).toThrow(/collides/);
  });

  it("rejects unsorted stageBoundaries", () => {
    const bad = { ...sample, config: { ...sample.config, stageBoundaries: [0.7, 0.4, 0.17] } };
    expect(() => loadMap(bad)).toThrow(/ascending/);
  });

  it("accepts an attitude with a normalized corner2", () => {
    const map = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: "attitude_pioneers",
          elementType: "attitude",
          kind: "pioneers",
          label: "",
          position: { visibility: 0.9, evolution: 0.1 },
          corner2: { visibility: 0.7, evolution: 0.3 },
        },
      ],
    };
    expect(() => loadMap(map)).not.toThrow();
  });
});

describe("normalizeEvolutionLabels", () => {
  it("stores nothing for the default labels", () => {
    expect(normalizeEvolutionLabels([...DEFAULT_EVOLUTION_LABELS])).toBeUndefined();
    expect(normalizeEvolutionLabels(undefined)).toBeUndefined();
  });

  it("falls back per empty stage and defuses the DSL separator", () => {
    expect(normalizeEvolutionLabels(["Novel", " ", "Good -> Best", "Best"])).toEqual([
      "Novel",
      "Custom-Built",
      "Good → Best",
      "Best",
    ]);
  });

  it("compares label sets, the default (undefined) only with itself", () => {
    expect(sameEvolutionLabels(["A", "B", "C", "D"], ["A", "B", "C", "D"])).toBe(true);
    expect(sameEvolutionLabels(undefined, ["A", "B", "C", "D"])).toBe(false);
    expect(sameEvolutionLabels(undefined, undefined)).toBe(true);
  });
});
