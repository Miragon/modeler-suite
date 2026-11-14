import { describe, expect, test } from "vitest";
import {
  columnsOf,
  createEmptyDocument,
  insertSticky,
  moveSticky,
  removeSticky,
  TAPE_COLORS,
  tapeColor,
  titleOf,
  validateDocument,
  withBlock,
  withColumns,
  withTitle,
  type CanvasDocument,
  type Sticky,
} from "../src/index.js";

const sticky = (id: string, extra: Partial<Sticky> = {}): Sticky => ({
  id,
  text: id,
  attributes: [],
  notes: [],
  ...extra,
});

describe("blocks", () => {
  test("a new block lands at its place in the method's order", () => {
    let document = withBlock(createEmptyDocument(), "cost-structure");
    document = withBlock(document, "customer-segments");
    document = withBlock(document, "channels");
    expect(document.blocks.map((block) => block.blockId)).toEqual([
      "customer-segments",
      "channels",
      "cost-structure",
    ]);
  });

  test("an existing block keeps its place in the file", () => {
    const document: CanvasDocument = {
      header: [],
      notes: [],
      blocks: [{ blockId: "cost-structure", items: [], notes: [], attributes: [] }],
      extras: [],
    };
    const next = withBlock(withBlock(document, "key-partners"), "cost-structure");
    expect(next.blocks.map((block) => block.blockId)).toEqual(["key-partners", "cost-structure"]);
  });
});

describe("moving", () => {
  test("splices the sticky between the others, into another block or to the end", () => {
    const document: CanvasDocument = {
      header: [],
      notes: [],
      blocks: [
        {
          blockId: "channels",
          items: [sticky("a"), sticky("b"), sticky("c")],
          notes: [{ text: "stays", attributes: [] }],
          attributes: [],
        },
      ],
      extras: [],
    };
    const ids = (moved: CanvasDocument) => moved.blocks[0]!.items.map((item) => item.id);
    expect(ids(moveSticky(document, "c", "channels", 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveSticky(document, "a", "channels", 99))).toEqual(["b", "c", "a"]);
    expect(moveSticky(document, "c", "channels", 0).blocks[0]!.notes).toEqual([
      { text: "stays", attributes: [] },
    ]);
    const elsewhere = moveSticky(document, "b", "key-partners", 0);
    expect(elsewhere.blocks.map((block) => block.blockId)).toEqual(["channels", "key-partners"]);
    expect(removeSticky(elsewhere, "b").blocks[1]).toEqual({
      blockId: "key-partners",
      items: [],
      notes: [],
      attributes: [],
    });
  });
});

describe("canvas fields", () => {
  test("sets the title in place, appends it after other fields and drops a blank one", () => {
    const owned: CanvasDocument = {
      ...createEmptyDocument(),
      header: [{ key: "x-owner", value: "sales" }],
    };
    let document = withTitle(owned, "Shop");
    document = withTitle(document, "Bakery");
    expect(document.header).toEqual([
      { key: "x-owner", value: "sales" },
      { key: "title", value: "Bakery" },
    ]);
    expect(titleOf(withTitle(document, "  "))).toBeUndefined();
  });

  test("sets the columns in place and drops them at the default of two", () => {
    const titled = createEmptyDocument("Shop");
    expect(columnsOf(titled)).toBe(2);
    let document = withColumns(titled, 3);
    document = withColumns(document, 4);
    expect(document.header).toEqual([
      { key: "title", value: "Shop" },
      { key: "columns", value: 4 },
    ]);
    expect(columnsOf(document)).toBe(4);
    expect(withColumns(document, 2).header).toEqual([{ key: "title", value: "Shop" }]);
  });

  test("reads a column count it does not know as the default", () => {
    const odd: CanvasDocument = {
      ...createEmptyDocument(),
      header: [{ key: "columns", value: 7 }],
    };
    expect(columnsOf(odd)).toBe(2);
  });
});

describe("tape colours", () => {
  test("a palette name in any case, or a hex colour of the person's own, is a tape", () => {
    expect(tapeColor("sky")).toBe(TAPE_COLORS[0]!.tape);
    expect(tapeColor("PEACH")).toBe(TAPE_COLORS[1]!.tape);
    expect(tapeColor("#123456")).toBe("#123456");
    expect(tapeColor("teal")).toBeUndefined();
    expect(tapeColor(undefined)).toBeUndefined();
  });
});

describe("validation", () => {
  test("keeps a __proto__ key inside a field the canvas does not know", () => {
    const value = JSON.parse('{"__proto__": {"x": 1}, "k": 1}') as never;
    const document = insertSticky(
      createEmptyDocument(),
      "channels",
      0,
      sticky("a", { attributes: [{ key: "x", value }] }),
    );
    const [kept] = validateDocument(document).blocks[0]!.items[0]!.attributes;
    expect(Object.keys(kept!.value as object)).toEqual(["__proto__", "k"]);
  });

  test("rejects a duplicate id and a name diagram-js cannot hold", () => {
    const twice = insertSticky(
      insertSticky(createEmptyDocument(), "channels", 0, sticky("a")),
      "channels",
      1,
      sticky("a"),
    );
    expect(() => validateDocument(twice)).toThrow(/Duplicate/);
    const reserved = insertSticky(createEmptyDocument(), "channels", 0, sticky("constructor"));
    expect(() => validateDocument(reserved)).toThrow(/no usable sticky id/);
  });
});
