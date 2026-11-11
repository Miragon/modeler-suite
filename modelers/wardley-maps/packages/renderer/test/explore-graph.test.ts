import { describe, expect, it } from "vitest";
import {
  chainOf,
  hiddenChainCount,
  hiddenNeighbourCount,
  neighboursOf,
  nodeIds,
  visibleElementIds,
  visibleNodeIds,
  type ExploreGraph,
  type ExploreGraphElement,
  type ExploreGraphLink,
} from "../src/explore/explore-graph.js";

const node = (id: string, extra: Partial<ExploreGraphElement> = {}): ExploreGraphElement => ({
  id,
  kind: "node",
  ...extra,
});

let linkNumber = 0;
const link = (kind: ExploreGraphLink["kind"], from: string, to: string): ExploreGraphLink => ({
  id: `${kind}_${++linkNumber}`,
  kind,
  from,
  to,
});
const needs = (from: string, to: string): ExploreGraphLink => link("dependency", from, to);

const sorted = (ids: Iterable<string>): string[] => [...ids].sort();

const teaShop: ExploreGraph = {
  elements: [
    node("business"),
    node("cup_of_tea"),
    node("cup"),
    node("tea"),
    node("hot_water"),
    node("water"),
    node("kettle"),
    node("power"),
    { id: "note_1", kind: "commentary" },
    { id: "anno_1", kind: "commentary" },
  ],
  links: [
    needs("business", "cup_of_tea"),
    needs("cup_of_tea", "cup"),
    needs("cup_of_tea", "tea"),
    needs("cup_of_tea", "hot_water"),
    needs("hot_water", "water"),
    needs("hot_water", "kettle"),
    needs("kettle", "power"),
    link("flow", "tea", "water"),
  ],
};

const flowFromTeaToWater = teaShop.links.find((candidate) => candidate.kind === "flow")!;

describe("neighboursOf", () => {
  it("finds one level of dependencies and dependents", () => {
    expect(neighboursOf(teaShop, "cup_of_tea", "dependencies")).toEqual([
      "cup",
      "tea",
      "hot_water",
    ]);
    expect(neighboursOf(teaShop, "hot_water", "dependents")).toEqual(["cup_of_tea"]);
    expect(neighboursOf(teaShop, "business", "dependents")).toEqual([]);
    expect(neighboursOf(teaShop, "power", "dependencies")).toEqual([]);
  });

  it("names a node once when two links join the same pair, in the order of the links", () => {
    const graph: ExploreGraph = {
      elements: [node("a"), node("b"), node("c")],
      links: [needs("a", "c"), needs("a", "b"), needs("a", "c"), needs("b", "a")],
    };
    expect(neighboursOf(graph, "a", "dependencies")).toEqual(["c", "b"]);
    expect(neighboursOf(graph, "a", "dependents")).toEqual(["b"]);
    expect(neighboursOf(graph, "c", "dependents")).toEqual(["a"]);
  });

  it("skips a link to the node itself and ends that are no node", () => {
    const graph: ExploreGraph = {
      elements: [node("a"), node("b"), { id: "note_1", kind: "commentary" }],
      links: [needs("a", "a"), needs("a", "note_1"), needs("a", "missing"), needs("a", "b")],
    };
    expect(neighboursOf(graph, "a", "dependencies")).toEqual(["b"]);
    expect(neighboursOf(graph, "a", "dependents")).toEqual([]);
    expect(neighboursOf(graph, "missing", "dependents")).toEqual([]);
  });

  it("does not follow flows", () => {
    expect(neighboursOf(teaShop, "tea", "dependencies")).toEqual([]);
    expect(neighboursOf(teaShop, "water", "dependents")).toEqual(["hot_water"]);
  });
});

describe("chainOf", () => {
  it("follows dependencies and dependents transitively, nearest first, without the start", () => {
    expect(chainOf(teaShop, "cup_of_tea", "dependencies")).toEqual([
      "cup",
      "tea",
      "hot_water",
      "water",
      "kettle",
      "power",
    ]);
    expect(chainOf(teaShop, "power", "dependents")).toEqual([
      "kettle",
      "hot_water",
      "cup_of_tea",
      "business",
    ]);
    expect(chainOf(teaShop, "business", "dependents")).toEqual([]);
  });

  it("stops at a cycle and leaves the start out", () => {
    const graph: ExploreGraph = {
      elements: [node("a"), node("b"), node("c"), node("d")],
      links: [needs("a", "b"), needs("b", "c"), needs("c", "a"), needs("c", "d"), needs("b", "c")],
    };
    expect(chainOf(graph, "a", "dependencies")).toEqual(["b", "c", "d"]);
    expect(chainOf(graph, "a", "dependents")).toEqual(["c", "b"]);
    expect(chainOf(graph, "d", "dependents")).toEqual(["c", "b", "a"]);
  });

  it("does not follow flows", () => {
    expect(chainOf(teaShop, "tea", "dependencies")).toEqual([]);
    expect(chainOf(teaShop, "water", "dependents")).toEqual([
      "hot_water",
      "cup_of_tea",
      "business",
    ]);
  });
});

describe("hidden counts", () => {
  it("counts the hidden nodes one level away and along the whole chain", () => {
    const visible = new Set(["cup_of_tea", "tea"]);
    expect(hiddenNeighbourCount(teaShop, visible, "cup_of_tea", "dependencies")).toBe(2);
    expect(hiddenNeighbourCount(teaShop, visible, "cup_of_tea", "dependents")).toBe(1);
    expect(hiddenChainCount(teaShop, visible, "cup_of_tea", "dependencies")).toBe(5);
    expect(hiddenChainCount(teaShop, visible, "cup_of_tea", "dependents")).toBe(1);
    expect(hiddenNeighbourCount(teaShop, visible, "tea", "dependencies")).toBe(0);
  });

  it("counts a node joined by two links once", () => {
    const graph: ExploreGraph = {
      elements: [node("a"), node("b")],
      links: [needs("a", "b"), needs("a", "b")],
    };
    expect(hiddenNeighbourCount(graph, new Set(["a"]), "a", "dependencies")).toBe(1);
    expect(hiddenChainCount(graph, new Set(["a"]), "a", "dependencies")).toBe(1);
  });
});

describe("visibleElementIds", () => {
  it("shows the visible nodes and the links between them", () => {
    const visible = new Set(["cup_of_tea", "hot_water"]);
    const shown = visibleElementIds(teaShop, visible);
    const linkBetween = teaShop.links.find(
      (candidate) => candidate.from === "cup_of_tea" && candidate.to === "hot_water",
    )!;
    expect(sorted(shown)).toEqual(sorted(["cup_of_tea", "hot_water", linkBetween.id]));
  });

  it("shows a flow once both of its ends show", () => {
    expect(visibleElementIds(teaShop, new Set(["tea"])).has(flowFromTeaToWater.id)).toBe(false);
    expect(visibleElementIds(teaShop, new Set(["tea", "water"])).has(flowFromTeaToWater.id)).toBe(
      true,
    );
  });

  it("shows commentary only once every node shows", () => {
    const allButPower = new Set(nodeIds(teaShop).filter((id) => id !== "power"));
    const almost = visibleElementIds(teaShop, allButPower);
    expect(almost.has("note_1")).toBe(false);
    expect(almost.has("anno_1")).toBe(false);

    const all = visibleElementIds(teaShop, new Set(nodeIds(teaShop)));
    expect(sorted(all)).toEqual(
      sorted([
        ...teaShop.elements.map((element) => element.id),
        ...teaShop.links.map((candidate) => candidate.id),
      ]),
    );
  });

  it("never shows other elements", () => {
    const graph: ExploreGraph = {
      elements: [node("a"), { id: "something_else", kind: "other" }],
      links: [],
    };
    expect(sorted(visibleElementIds(graph, new Set(["a"])))).toEqual(["a"]);
  });

  it("ignores ids in the visible set that are no node of the graph", () => {
    const shown = visibleElementIds(teaShop, new Set(["note_1", "gone", flowFromTeaToWater.id]));
    expect(sorted(shown)).toEqual([]);
  });
});

describe("pipelines", () => {
  const graph: ExploreGraph = {
    elements: [
      node("cmp_kettle", { anchorOfPipeline: "pipeline_kettle" }),
      { id: "pipeline_kettle", kind: "pipelineFrame" },
      node("cmp_electric_kettle", { pipelineId: "pipeline_kettle" }),
      node("cmp_campfire_kettle", { pipelineId: "pipeline_kettle" }),
      node("cmp_hot_water"),
      node("cmp_power"),
      { id: "note_1", kind: "commentary" },
    ],
    links: [
      needs("cmp_hot_water", "cmp_kettle"),
      needs("cmp_electric_kettle", "cmp_power"),
      needs("cmp_hot_water", "cmp_campfire_kettle"),
    ],
  };
  const [toAnchor, fromMember, toMember] = graph.links as [
    ExploreGraphLink,
    ExploreGraphLink,
    ExploreGraphLink,
  ];

  it("shows the frame and every member with a visible anchor", () => {
    const shown = visibleElementIds(graph, new Set(["cmp_kettle"]));
    expect(sorted(shown)).toEqual(
      sorted(["cmp_kettle", "pipeline_kettle", "cmp_electric_kettle", "cmp_campfire_kettle"]),
    );
    expect(sorted(visibleNodeIds(graph, new Set(["cmp_kettle"])))).toEqual(
      sorted(["cmp_kettle", "cmp_electric_kettle", "cmp_campfire_kettle"]),
    );
  });

  it("shows the frame but not the anchor or the other members with a member alone", () => {
    const shown = visibleElementIds(graph, new Set(["cmp_electric_kettle"]));
    expect(sorted(shown)).toEqual(sorted(["cmp_electric_kettle", "pipeline_kettle"]));
  });

  it("hides the frame while neither its anchor nor a member shows", () => {
    expect(sorted(visibleElementIds(graph, new Set(["cmp_hot_water"])))).toEqual(["cmp_hot_water"]);
  });

  it("shows the links of members that the anchor brought along", () => {
    const shown = visibleElementIds(graph, new Set(["cmp_hot_water", "cmp_kettle", "cmp_power"]));
    expect(shown.has(toAnchor.id)).toBe(true);
    expect(shown.has(fromMember.id)).toBe(true);
    expect(shown.has(toMember.id)).toBe(true);
    expect(shown.has("note_1")).toBe(true);
  });

  it("does not count members that the anchor brought along as hidden", () => {
    const hotWaterAlone = new Set(["cmp_hot_water"]);
    expect(hiddenNeighbourCount(graph, hotWaterAlone, "cmp_hot_water", "dependencies")).toBe(2);
    expect(hiddenChainCount(graph, hotWaterAlone, "cmp_hot_water", "dependencies")).toBe(4);

    const withAnchor = new Set(["cmp_hot_water", "cmp_kettle"]);
    expect(hiddenNeighbourCount(graph, withAnchor, "cmp_hot_water", "dependencies")).toBe(0);
    expect(hiddenNeighbourCount(graph, withAnchor, "cmp_kettle", "dependencies")).toBe(0);
    expect(hiddenChainCount(graph, withAnchor, "cmp_hot_water", "dependencies")).toBe(1);
    expect(hiddenChainCount(graph, withAnchor, "cmp_kettle", "dependencies")).toBe(1);
    expect(hiddenNeighbourCount(graph, withAnchor, "cmp_electric_kettle", "dependencies")).toBe(1);
    expect(hiddenNeighbourCount(graph, withAnchor, "cmp_electric_kettle", "dependents")).toBe(0);
  });

  it("goes down from an anchor to its members and on to what they need", () => {
    expect(neighboursOf(graph, "cmp_hot_water", "dependencies")).toEqual([
      "cmp_kettle",
      "cmp_campfire_kettle",
    ]);
    expect(neighboursOf(graph, "cmp_kettle", "dependencies")).toEqual([
      "cmp_electric_kettle",
      "cmp_campfire_kettle",
    ]);
    expect(chainOf(graph, "cmp_kettle", "dependencies")).toEqual([
      "cmp_electric_kettle",
      "cmp_campfire_kettle",
      "cmp_power",
    ]);
    expect(chainOf(graph, "cmp_hot_water", "dependencies")).toEqual([
      "cmp_kettle",
      "cmp_campfire_kettle",
      "cmp_electric_kettle",
      "cmp_power",
    ]);
  });

  it("goes up from a member to its anchor and on to what needs the anchor", () => {
    expect(neighboursOf(graph, "cmp_electric_kettle", "dependents")).toEqual(["cmp_kettle"]);
    expect(neighboursOf(graph, "cmp_campfire_kettle", "dependents")).toEqual([
      "cmp_hot_water",
      "cmp_kettle",
    ]);
    expect(chainOf(graph, "cmp_power", "dependents")).toEqual([
      "cmp_electric_kettle",
      "cmp_kettle",
      "cmp_hot_water",
    ]);
    expect(hiddenChainCount(graph, new Set(["cmp_power"]), "cmp_power", "dependents")).toBe(3);
    expect(neighboursOf(graph, "cmp_kettle", "dependents")).toEqual(["cmp_hot_water"]);
  });

  it("counts a member as hidden only while nothing brings it along", () => {
    const memberAlone = new Set(["cmp_power", "cmp_electric_kettle"]);
    expect(hiddenNeighbourCount(graph, memberAlone, "cmp_electric_kettle", "dependents")).toBe(1);
    expect(hiddenChainCount(graph, memberAlone, "cmp_power", "dependents")).toBe(2);

    const withAnchor = new Set(["cmp_power", "cmp_kettle"]);
    expect(hiddenChainCount(graph, withAnchor, "cmp_power", "dependents")).toBe(1);
    expect(hiddenNeighbourCount(graph, withAnchor, "cmp_kettle", "dependencies")).toBe(0);
  });
});

describe("a standalone pipeline", () => {
  const graph: ExploreGraph = {
    elements: [
      node("pipeline_kettle"),
      node("cmp_electric_kettle", { pipelineId: "pipeline_kettle" }),
      node("cmp_hot_water"),
      node("cmp_power"),
    ],
    links: [needs("cmp_hot_water", "pipeline_kettle"), needs("pipeline_kettle", "cmp_power")],
  };

  it("is a node of the chain", () => {
    expect(nodeIds(graph)).toContain("pipeline_kettle");
    expect(neighboursOf(graph, "cmp_hot_water", "dependencies")).toEqual(["pipeline_kettle"]);
    expect(chainOf(graph, "cmp_power", "dependents")).toEqual(["pipeline_kettle", "cmp_hot_water"]);
  });

  it("goes down to its members and up from them, as an anchor does", () => {
    expect(neighboursOf(graph, "pipeline_kettle", "dependencies")).toEqual([
      "cmp_power",
      "cmp_electric_kettle",
    ]);
    expect(chainOf(graph, "cmp_hot_water", "dependencies")).toEqual([
      "pipeline_kettle",
      "cmp_power",
      "cmp_electric_kettle",
    ]);
    expect(neighboursOf(graph, "cmp_electric_kettle", "dependents")).toEqual(["pipeline_kettle"]);
    expect(chainOf(graph, "cmp_electric_kettle", "dependents")).toEqual([
      "pipeline_kettle",
      "cmp_hot_water",
    ]);
    const pipelineShown = new Set(["cmp_hot_water", "pipeline_kettle"]);
    expect(hiddenNeighbourCount(graph, pipelineShown, "pipeline_kettle", "dependencies")).toBe(1);
    expect(hiddenChainCount(graph, pipelineShown, "cmp_hot_water", "dependencies")).toBe(1);
  });

  it("brings its members along as an anchor does", () => {
    const shown = visibleElementIds(graph, new Set(["cmp_hot_water", "pipeline_kettle"]));
    expect(sorted(shown)).toEqual(
      sorted(["cmp_hot_water", "pipeline_kettle", "cmp_electric_kettle", graph.links[0]!.id]),
    );
  });

  it("stays hidden with a member alone", () => {
    expect(sorted(visibleElementIds(graph, new Set(["cmp_electric_kettle"])))).toEqual([
      "cmp_electric_kettle",
    ]);
  });
});

describe("nodeIds", () => {
  it("lists the nodes in the order of the elements", () => {
    expect(nodeIds(teaShop)).toEqual([
      "business",
      "cup_of_tea",
      "cup",
      "tea",
      "hot_water",
      "water",
      "kettle",
      "power",
    ]);
  });
});

describe("inputs", () => {
  it("are never changed, and every result is a fresh copy", () => {
    const graph: ExploreGraph = {
      elements: [
        node("a", { anchorOfPipeline: "pipeline_a" }),
        { id: "pipeline_a", kind: "pipelineFrame" },
        node("m", { pipelineId: "pipeline_a" }),
        node("b"),
        { id: "note_1", kind: "commentary" },
      ],
      links: [needs("b", "a"), needs("a", "b"), link("flow", "m", "b")],
    };
    const visible = new Set(["a"]);
    const graphBefore = structuredClone(graph);
    const visibleBefore = new Set(visible);

    neighboursOf(graph, "a", "dependencies").push("changed");
    chainOf(graph, "a", "dependents").push("changed");
    hiddenNeighbourCount(graph, visible, "a", "dependencies");
    hiddenChainCount(graph, visible, "a", "dependents");
    visibleNodeIds(graph, visible).add("changed");
    visibleElementIds(graph, visible).add("changed");
    nodeIds(graph).push("changed");

    expect(graph).toEqual(graphBefore);
    expect(visible).toEqual(visibleBefore);
    expect(neighboursOf(graph, "a", "dependencies")).toEqual(["b", "m"]);
    expect(chainOf(graph, "a", "dependents")).toEqual(["b"]);
    expect(nodeIds(graph)).toEqual(["a", "m", "b"]);
    expect(sorted(visibleNodeIds(graph, visible))).toEqual(["a", "m"]);
  });
});
