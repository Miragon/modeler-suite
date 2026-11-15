import { describe, expect, test } from "vitest";
import {
  absoluteBox,
  absoluteBoxes,
  projectBoard,
  type BoardSnapshot,
  type NodeAttrs,
} from "../src/index.js";

const node = (attrs: Partial<NodeAttrs>): NodeAttrs => ({
  kind: "node",
  type: "text",
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  z: "a",
  ...attrs,
});

const board = (elements: BoardSnapshot["elements"]): BoardSnapshot => ({
  elements,
  meta: { title: "T", version: 1 },
});

describe("projectBoard", () => {
  test("nodes come back to front by their z, ties by id, and every parent before its children", () => {
    const view = projectBoard(
      board({
        n_child: node({ parent: "n_group", z: "a" }),
        n_b: node({ z: "m" }),
        n_a: node({ z: "m" }),
        n_group: node({ type: "group", z: "z" }),
      }),
    );
    expect(view.nodes.map((entry) => [entry.id, entry.parentId])).toEqual([
      ["n_group", undefined],
      ["n_child", "n_group"],
      ["n_a", undefined],
      ["n_b", undefined],
    ]);
  });

  test("an arrow is drawn only between two nodes that exist", () => {
    const view = projectBoard(
      board({
        n_a: node({}),
        n_b: node({}),
        e_2: { kind: "edge", source: "n_a", target: "n_b", label: "to" },
        e_1: { kind: "edge", source: "n_a", target: "n_gone" },
        e_3: { kind: "edge", source: "n_a" },
      }),
    );
    expect(view.edges.map((edge) => edge.id)).toEqual(["e_2"]);
  });

  test("a parent that is no node, or no element at all, is no parent", () => {
    const view = projectBoard(
      board({
        n_a: node({ parent: "n_nowhere" }),
        n_b: node({ parent: "e_1" }),
        e_1: { kind: "edge", source: "n_a", target: "n_b" },
      }),
    );
    expect(view.nodes.map((entry) => entry.parentId)).toEqual([undefined, undefined]);
  });

  test("two groups inside each other: both lose their parent, a node inside them keeps its own", () => {
    const view = projectBoard(
      board({
        n_g1: node({ type: "group", parent: "n_g2" }),
        n_g2: node({ type: "group", parent: "n_g1" }),
        n_note: node({ parent: "n_g1" }),
      }),
    );
    const parentOf = new Map(view.nodes.map((entry) => [entry.id, entry.parentId]));
    expect(parentOf.get("n_g1")).toBeUndefined();
    expect(parentOf.get("n_g2")).toBeUndefined();
    expect(parentOf.get("n_note")).toBe("n_g1");
    const ids = view.nodes.map((entry) => entry.id);
    expect(ids.indexOf("n_g1")).toBeLessThan(ids.indexOf("n_note"));
    // the walk up the parents ends
    expect(absoluteBox(view, "n_note")).toEqual({ x: 0, y: 0, width: 200, height: 120 });
  });

  test("an element of another shape stays off the canvas", () => {
    const view = projectBoard(
      board({
        n_ok: node({}),
        n_text_x: { ...node({}), x: "12" },
        n_no_z: { kind: "node", type: "text", x: 0, y: 0, width: 1, height: 1 },
        n_new_type: { ...node({}), type: "sticker" },
        x_lane: { kind: "swimlane" },
      }),
    );
    expect(view.nodes.map((entry) => entry.id)).toEqual(["n_ok"]);
  });

  test("what did not change keeps its object from the view before", () => {
    const first = board({
      n_a: node({}),
      n_b: node({ x: 300 }),
      e_1: { kind: "edge", source: "n_a", target: "n_b" },
    });
    const before = projectBoard(first);
    const after = projectBoard(
      { ...first, elements: { ...first.elements, n_b: node({ x: 340 }) } },
      before,
    );
    const pick = (view: typeof before, id: string) => view.nodes.find((entry) => entry.id === id);
    expect(pick(after, "n_a")).toBe(pick(before, "n_a"));
    expect(pick(after, "n_b")).not.toBe(pick(before, "n_b"));
    expect(after.edges[0]).toBe(before.edges[0]);
    expect(after.meta).toBe(before.meta);
  });
});

describe("absoluteBoxes", () => {
  test("a child's position counts from its parent's, at every depth", () => {
    const view = projectBoard(
      board({
        n_outer: node({ type: "group", x: 100, y: 50, width: 900, height: 600 }),
        n_inner: node({ type: "group", parent: "n_outer", x: 40, y: 60, width: 400, height: 300 }),
        n_note: node({ parent: "n_inner", x: 10, y: 20 }),
      }),
    );
    expect(absoluteBoxes(view).get("n_note")).toEqual({ x: 150, y: 130, width: 200, height: 120 });
    expect(absoluteBox(view, "n_inner")).toEqual({ x: 140, y: 110, width: 400, height: 300 });
    expect(absoluteBox(view, "n_nowhere")).toBeUndefined();
  });
});
