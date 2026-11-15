import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Scope guard of the board's two sheets. A host loads them into a page of its own, next to its
 * editors, and may prefix every rule with a descendant selector: so every rule starts at a class
 * of the board, none reaches the page, and none names an editor the board does not know. The base
 * resets the board's own elements only: the `.board-engine` it hands a host, and nothing below it.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const SHEETS = {
  "board.css": readSource("../src/assets/board.css"),
  "board-base.css": readSource("../src/assets/board-base.css"),
};

/**
 * React Flow's wrapper of a node carries the state (selected, hovered) that these three rules
 * show on the board's own element inside it. The wrapper exists only inside a board.
 */
const START_AT_THE_NODE_WRAPPER = [
  ".react-flow__node.selected > .board-node",
  ".react-flow__node.selected > :is(.board-text, .board-image, .board-group)",
  ".react-flow__node:is(:hover, .selected) .board-image__caption",
];

const BOARD_CLASS = /^\.board-[a-z][\w-]*/;
const SCOPED_TO_THE_BOARDS_OWN =
  /^\.board-root :where\((.+)\):not\(:where\(\.board-engine \*\)\)(::[\w-]+)?$/;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Splits at `separator` outside every bracket: a comma inside `:is()` is no end of a selector. */
function splitOutsideBrackets(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (depth === 0 && separator.test(char)) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** One line per selector, however Prettier broke it. */
function normalised(selector: string): string {
  return selector.trim().replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
}

/**
 * Every selector of the style rules of a sheet, those inside `@media` and `@supports` included.
 * Enough of a reader for these two sheets: no nested rule, no brace inside a string.
 */
function selectorsOf(css: string): string[] {
  const selectors: string[] = [];
  const source = withoutComments(css);
  let position = 0;
  while (position < source.length) {
    const next = /[;{}]/.exec(source.slice(position));
    if (!next) break;
    const prelude = source.slice(position, position + next.index).trim();
    position += next.index + 1;
    if (next[0] !== "{" || prelude.startsWith("@")) continue;
    selectors.push(...splitOutsideBrackets(prelude, /,/).map(normalised));
    const end = source.indexOf("}", position);
    if (end === -1) throw new Error(`no end of the rule ${prelude}`);
    position = end + 1;
  }
  return selectors;
}

/** The last compound of a selector: what the rule styles. */
function subjectOf(selector: string): string {
  return splitOutsideBrackets(selector, /[\s>+~]/)
    .filter((part) => part !== "")
    .at(-1)!;
}

const ALL = Object.entries(SHEETS).flatMap(([sheet, css]) =>
  selectorsOf(css).map((selector) => ({ sheet, selector })),
);

describe("styles.scope: the reader finds the rules", () => {
  it("reads both sheets, the rules inside @media and @supports included", () => {
    // 182 and 52 when this was written: a reader that lost half of them would prove nothing
    expect(selectorsOf(SHEETS["board.css"]).length).toBeGreaterThan(150);
    expect(selectorsOf(SHEETS["board-base.css"]).length).toBeGreaterThan(45);
    expect(
      selectorsOf("@media (x) { .a,\n .b :is(.c, .d) { e: f; } } .g::before { h: i; }"),
    ).toEqual([".a", ".b :is(.c, .d)", ".g::before"]);
  });
});

describe("styles.scope: every rule stays inside the board", () => {
  it("starts at a class of the board, but for three that start at React Flow's node wrapper", () => {
    const elsewhere = ALL.filter(({ selector }) => !BOARD_CLASS.test(selector));
    expect(elsewhere.map(({ selector }) => selector)).toEqual(START_AT_THE_NODE_WRAPPER);
    expect(elsewhere.map(({ sheet }) => sheet)).toEqual(["board.css", "board.css", "board.css"]);
  });

  it("the three end on a class of the board", () => {
    for (const selector of START_AT_THE_NODE_WRAPPER) {
      const subject = subjectOf(selector);
      const classes = /^:is\((.+)\)$/.exec(subject)?.[1]?.split(", ") ?? [subject];
      for (const name of classes) expect(name, selector).toMatch(BOARD_CLASS);
    }
  });

  it("names neither html, body, :root nor :host", () => {
    const page = /(?<![\w.#[-])(html|body)(?![\w-])|:root|:host/;
    expect(ALL.filter(({ selector }) => page.test(selector))).toEqual([]);
    expect(page.test("body .board-root")).toBe(true);
    expect(page.test(".board-node__body[inert]")).toBe(false);
  });

  it("names no editor: the preview chrome of a host's editors is the host's sheet", () => {
    const editor = /\.(djs|dmn|bjs|bpmn|wardley)-|\.view-drd|data-mount/;
    expect(ALL.filter(({ selector }) => editor.test(selector))).toEqual([]);
  });

  it("holds no rule of the measuring bench", () => {
    const bench = /\.board-(stub|frame)(?![\w-])/;
    expect(ALL.filter(({ selector }) => bench.test(selector))).toEqual([]);
  });
});

describe("styles.scope: the base resets the board's own elements and nothing of a host's", () => {
  const base = selectorsOf(SHEETS["board-base.css"]);
  /** the reduced-motion rule at the end of board.css is scoped the same way */
  const scopedInBoard = selectorsOf(SHEETS["board.css"]).filter((selector) =>
    selector.includes(":where("),
  );

  it("writes every selector as .board-root :where(…):not(:where(.board-engine *))", () => {
    const [first, ...rest] = base;
    expect(first).toBe(".board-root");
    expect(rest.filter((selector) => !SCOPED_TO_THE_BOARDS_OWN.test(selector))).toEqual([]);
    expect(scopedInBoard).toHaveLength(3);
    expect(scopedInBoard.filter((selector) => !SCOPED_TO_THE_BOARDS_OWN.test(selector))).toEqual(
      [],
    );
  });

  it("keeps every pseudo-element behind the :not(): inside :where() it matches nothing", () => {
    const pseudoElement = /::|:(before|after|backdrop|placeholder)\b/;
    const inside = [...base.slice(1), ...scopedInBoard].map(
      (selector) => SCOPED_TO_THE_BOARDS_OWN.exec(selector)?.[1] ?? selector,
    );
    expect(inside.filter((selector) => pseudoElement.test(selector))).toEqual([]);
    const behind = base.filter((selector) => /::[\w-]+$/.test(selector));
    expect(behind.length).toBeGreaterThan(20);
    for (const selector of behind) {
      expect(selector).toMatch(/^\.board-root :where\(\*\):not\(:where\(\.board-engine \*\)\)::/);
    }
  });

  it("is imported into a layer, so that every rule of board.css wins over it", () => {
    expect(withoutComments(SHEETS["board.css"])).toContain(
      '@import "./board-base.css" layer(board-base);',
    );
    expect(withoutComments(SHEETS["board-base.css"])).not.toMatch(/@layer|@import/);
  });
});
