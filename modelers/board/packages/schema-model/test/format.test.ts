import { describe, expect, test } from "vitest";
import {
  decodeBoard,
  encodeBoard,
  newBoardText,
  parseBoardText,
  type BoardSnapshot,
} from "../src/index.js";

const HEADER = `{"format":"structured-model","meta":{"title":"T","version":1},"version":1}`;
const NOTE = `{"height":160,"id":"n_a","kind":"node","text":"A","type":"text","width":240,"x":0,"y":0,"z":"a"}`;
const ARROW = `{"id":"e_a","kind":"edge","source":"n_a","target":"n_b"}`;

function accepted(text: string): BoardSnapshot {
  const parsed = parseBoardText(text);
  if (!parsed.ok) throw new Error(`refused: ${parsed.reason}`);
  return parsed.snapshot;
}

function refused(text: string): string {
  const parsed = parseBoardText(text);
  if (parsed.ok) throw new Error("the text was accepted");
  return parsed.reason;
}

describe("encodeBoard", () => {
  test("the same board gives the same bytes, whatever order it was put together in", () => {
    const one: BoardSnapshot = {
      meta: { title: "T", version: 1 },
      elements: {
        n_a: { kind: "node", type: "text", x: 0, y: 0, width: 240, height: 160, z: "a", text: "A" },
        e_a: { kind: "edge", source: "n_a", target: "n_b" },
      },
    };
    const other: BoardSnapshot = {
      meta: { version: 1, title: "T" },
      elements: {
        e_a: { target: "n_b", source: "n_a", kind: "edge" },
        n_a: { text: "A", z: "a", height: 160, width: 240, y: 0, x: 0, type: "text", kind: "node" },
      },
    };
    expect(encodeBoard(one)).toBe(`${HEADER}\n${ARROW}\n${NOTE}\n`);
    expect(encodeBoard(other)).toBe(encodeBoard(one));
  });

  test("the map key is the element's id, also where an attribute is named id", () => {
    const text = encodeBoard({ meta: {}, elements: { n_a: { id: "other", kind: "node" } } });
    expect(text.split("\n")[1]).toBe(`{"id":"n_a","kind":"node"}`);
  });

  test("nested values are written with sorted keys too", () => {
    const text = encodeBoard({ meta: { b: { d: 1, c: [{ z: 1, a: 2 }] }, a: 0 }, elements: {} });
    expect(text).toBe(
      `{"format":"structured-model","meta":{"a":0,"b":{"c":[{"a":2,"z":1}],"d":1}},"version":1}\n`,
    );
  });

  test("a new board is its header alone, with a title of one line", () => {
    expect(newBoardText("  Order\nto cash ")).toBe(
      `{"format":"structured-model","meta":{"title":"Order to cash","version":1},"version":1}\n`,
    );
    expect(accepted(newBoardText("T"))).toEqual({ elements: {}, meta: { title: "T", version: 1 } });
  });
});

describe("decodeBoard", () => {
  test("reads whatever it is given and skips what is no element", () => {
    expect(decodeBoard("")).toEqual({ elements: {}, meta: {} });
    expect(decodeBoard("not a board\n[1,2]\n")).toEqual({ elements: {}, meta: {} });
    const snapshot = decodeBoard(`${NOTE}\n{"cut":"off\n${HEADER}\n${ARROW}`);
    expect(Object.keys(snapshot.elements).sort()).toEqual(["e_a", "n_a"]);
    expect(snapshot.meta).toEqual({ title: "T", version: 1 });
  });

  test("an element whose attributes look like a header is an element", () => {
    const snapshot = decodeBoard(`${HEADER}\n{"format":"structured-model","id":"n_x","meta":{}}`);
    expect(snapshot.meta).toEqual({ title: "T", version: 1 });
    expect(snapshot.elements.n_x).toEqual({ format: "structured-model", meta: {} });
  });

  test("an element id that names a member of Object.prototype is an own key", () => {
    const snapshot = decodeBoard(`${HEADER}\n{"id":"constructor","kind":"node"}`);
    expect(Object.keys(snapshot.elements)).toEqual(["constructor"]);
  });
});

describe("parseBoardText accepts", () => {
  test("an empty text as a new board", () => {
    expect(accepted("")).toEqual({ elements: {}, meta: {} });
    expect(accepted("\n  \n")).toEqual({ elements: {}, meta: {} });
  });

  test("the canonical text, and gives it back byte for byte", () => {
    const text = `${HEADER}\n${ARROW}\n${NOTE}\n`;
    expect(encodeBoard(accepted(text))).toBe(text);
  });

  test("another line order, another key order, blank lines and no last newline, with one canonical form", () => {
    const loose = `${NOTE}\n\n{"target":"n_b","source":"n_a","kind":"edge","id":"e_a"}\n${HEADER}`;
    const canonical = encodeBoard(accepted(loose));
    expect(canonical).toBe(`${HEADER}\n${ARROW}\n${NOTE}\n`);
    expect(encodeBoard(accepted(canonical))).toBe(canonical);
  });

  test("content the board does not know, and writes it back", () => {
    const foreign = [
      `{"format":"structured-model","meta":{"owner":"team-a"},"version":1}`,
      `{"colour":"amber","id":"x_lane","kind":"swimlane","rows":[1,{"deep":null}]}`,
      `{"id":"n_shapeless","kind":"node"}`,
    ].join("\n");
    const text = encodeBoard(accepted(foreign));
    for (const part of [
      `"owner":"team-a"`,
      `"kind":"swimlane"`,
      `"rows":[1,{"deep":null}]`,
      `"id":"n_shapeless"`,
    ]) {
      expect(text).toContain(part);
    }
  });

  test("an element id that names a member of Object.prototype", () => {
    const snapshot = accepted(
      `${HEADER}\n{"id":"constructor","kind":"node"}\n{"id":"toString","kind":"node"}`,
    );
    expect(Object.keys(snapshot.elements).sort()).toEqual(["constructor", "toString"]);
  });
});

describe("parseBoardText refuses", () => {
  test("what is no board at all", () => {
    expect(refused("hello")).toMatch(/line 1 is no JSON/);
    expect(refused(`<?xml version="1.0"?>\n<definitions/>`)).toMatch(/line 1 is no JSON/);
    expect(refused(`${HEADER}\n[1,2]`)).toMatch(/line 2 is no JSON object/);
    expect(refused(`${HEADER}\n"text"`)).toMatch(/line 2 is no JSON object/);
  });

  test("a line somebody has not finished typing", () => {
    expect(refused(`${HEADER}\n${NOTE.slice(0, 40)}`)).toMatch(/line 2 is no JSON/);
    expect(refused(`${HEADER}\n${NOTE}\u0000`)).toMatch(/line 2 is no JSON/);
  });

  test("elements without a header, a second header and a header of another version", () => {
    expect(refused(NOTE)).toMatch(/no header line/);
    expect(refused(`${HEADER}\n${HEADER}`)).toMatch(/line 2 is a second header/);
    expect(refused(`{"format":"structured-model","meta":{},"version":2}`)).toMatch(
      /format version 2/,
    );
    expect(refused(`{"format":"structured-model","version":1}`)).toMatch(/without a meta object/);
  });

  test("what the next write would drop", () => {
    expect(refused(`${HEADER}\n${NOTE}\n${NOTE}`)).toMatch(/line 3 repeats the element id n_a/);
    expect(refused(`{"format":"structured-model","generator":"x","meta":{},"version":1}`)).toMatch(
      /generator/,
    );
    expect(refused(`${HEADER}\n{"kind":"node"}`)).toMatch(/neither the header nor an element/);
    expect(refused(`${HEADER}\n{"id":"","kind":"node"}`)).toMatch(
      /neither the header nor an element/,
    );
    expect(refused(`${HEADER}\n{"id":7,"kind":"node"}`)).toMatch(
      /neither the header nor an element/,
    );
    expect(refused(`${HEADER}\n{"id":"n_a","__proto__":{"x":1}}`)).toMatch(/__proto__/);
  });
});
