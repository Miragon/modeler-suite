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

  test.each([
    [
      "a note's text",
      `{"height":160,"id":"n_a","kind":"node","text":"__proto__","type":"text","width":240,"x":0,"y":0,"z":"a"}`,
    ],
    [
      "an arrow's label",
      `{"id":"e_a","kind":"edge","label":"__proto__","source":"n_a","target":"n_b"}`,
    ],
    [
      "a group's name",
      `{"height":420,"id":"n_g","kind":"node","text":"__proto__","type":"group","width":640,"x":0,"y":0,"z":"a"}`,
    ],
    [
      "a model's file",
      `{"file":"__proto__","height":540,"id":"n_m","kind":"node","type":"model","width":800,"x":0,"y":0,"z":"a"}`,
    ],
    [
      "a value inside a value",
      `{"id":"x_lane","kind":"swimlane","rows":["__proto__",{"deep":"__proto__"}]}`,
    ],
  ])("the value __proto__ as %s, and writes it back", (_where, line) => {
    const text = `${HEADER}\n${line}\n`;
    const snapshot = accepted(text);
    expect(JSON.stringify(Object.values(snapshot.elements))).toContain(`"__proto__"`);
    expect(encodeBoard(snapshot)).toBe(text);
    expect(accepted(encodeBoard(snapshot))).toEqual(snapshot);
  });

  test("the value __proto__ as the board's title, and writes it back", () => {
    const text = `{"format":"structured-model","meta":{"title":"__proto__","version":1},"version":1}\n`;
    const snapshot = accepted(text);
    expect(snapshot.meta.title).toBe("__proto__");
    expect(encodeBoard(snapshot)).toBe(text);
    expect(accepted(encodeBoard(snapshot))).toEqual(snapshot);
  });

  test("an arrow whose ends name __proto__: a value like any other, and written back", () => {
    const text = `${HEADER}\n{"id":"e_a","kind":"edge","source":"__proto__","target":"__proto__"}\n`;
    const snapshot = accepted(text);
    expect(Object.keys(snapshot.elements)).toEqual(["e_a"]);
    expect(encodeBoard(snapshot)).toBe(text);
  });
});

describe("parseBoardText refuses", () => {
  test("an element whose id is __proto__: an id is a key wherever a board keeps its elements", () => {
    expect(refused(`${HEADER}\n{"id":"__proto__","kind":"node"}`)).toMatch(
      /line 2 has the element id __proto__/,
    );
  });

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

  test("a key named __proto__, at the top of a line and at every depth below", () => {
    const named = (line: number): RegExp => new RegExp(`^line ${line} has a key named __proto__$`);
    expect(refused(`${HEADER}\n{"id":"n_a","__proto__":{"x":1}}`)).toMatch(named(2));
    expect(refused(`${HEADER}\n{"id":"n_a","__proto__":"text"}`)).toMatch(named(2));
    expect(refused(`${HEADER}\n{"data":{"__proto__":1},"id":"n_a"}`)).toMatch(named(2));
    expect(refused(`${HEADER}\n{"id":"n_a","rows":[1,{"deep":{"__proto__":null}}]}`)).toMatch(
      named(2),
    );
    expect(refused(`{"format":"structured-model","meta":{"__proto__":{}},"version":1}`)).toMatch(
      named(1),
    );
    expect(refused(`{"__proto__":1,"format":"structured-model","meta":{},"version":1}`)).toMatch(
      named(1),
    );
    // deeper than the call stack is: JSON.parse reads such a line
    const deep = 20_000;
    expect(
      refused(
        `${HEADER}\n{"id":"n_a","rows":${"[".repeat(deep)}{"__proto__":1}${"]".repeat(deep)}}`,
      ),
    ).toMatch(named(2));
  });

  test("a key named __proto__ that the line spells with a JSON escape", () => {
    expect(refused(`${HEADER}\n{"id":"n_a","\\u005f_proto__":1}`)).toBe(
      "line 2 has a key named __proto__",
    );
    expect(refused(`${HEADER}\n{"data":{"__pr\\u006fto__":1},"id":"n_a"}`)).toBe(
      "line 2 has a key named __proto__",
    );
  });
});
