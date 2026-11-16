import { readFileSync } from "node:fs";

/**
 * The sheet of `@miragon/bpmn-modeler` is one bundle with its own copy of diagram-js's sheet in
 * it. Loaded after the suite's renderers, that copy would override their own rules at equal
 * weight, as one renderer's copy once took Context Maps' open context pad (`build/css-base.mjs`).
 * So the build holds the whole sheet to the BPMN editors with `@scope`: it reaches nothing of the
 * other editors, and inside its own a scoped rule wins over an unscoped one of equal weight.
 */

/**
 * Where the BPMN sheet applies: the element a board's host writes `data-notation="bpmn"` on, and
 * the append menu, which the modeler puts on the page's body.
 */
export const BPMN_SCOPE = '[data-notation="bpmn"], .am-overlay-root';

const BPMN_SHEET = /[\\/]@miragon[\\/]bpmn-modeler[\\/]dist[\\/]bpmn-modeler\.css$/;

/** at-rules that are no style rule and have no place inside `@scope` */
const PAGE_WIDE =
  /^@(font-face|(-[a-z]+-)?keyframes|property|charset|import|namespace|counter-style|font-feature-values|page)\b/i;

/**
 * The top-level statements of a sheet: each rule with its block, each statement at-rule with its
 * semicolon. Strings, comments and unquoted `url()` values may hold braces of their own.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function topLevelStatements(css) {
  /** @type {string[]} */
  const statements = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  const end = () => {
    const statement = css.slice(start, index + 1).trim();
    if (statement !== "") statements.push(statement);
    start = index + 1;
  };
  while (index < css.length) {
    const character = css[index];
    if (character === '"' || character === "'") {
      index += 1;
      while (index < css.length && css[index] !== character) index += css[index] === "\\" ? 2 : 1;
    } else if (css.startsWith("/*", index)) {
      const close = css.indexOf("*/", index + 2);
      index = close === -1 ? css.length : close + 1;
    } else if (/^url\(\s*[^"'\s]/i.test(css.slice(index, index + 6))) {
      const close = css.indexOf(")", index);
      index = close === -1 ? css.length : close;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) end();
    } else if (character === ";" && depth === 0) {
      end();
    }
    index += 1;
  }
  const rest = css.slice(start).trim();
  if (rest !== "") statements.push(rest);
  return statements;
}

/**
 * The sheet held to `roots`: what may not stand inside `@scope` stays in front of it, everything
 * else goes in, with `:root` read as the scope's root.
 *
 * @param {string} css
 * @param {string} roots a selector list
 * @returns {string}
 */
export function scopeSheet(css, roots) {
  const pageWide = [];
  const scoped = [];
  for (const statement of topLevelStatements(css)) {
    if (PAGE_WIDE.test(statement)) pageWide.push(statement);
    else scoped.push(statement.replace(/:root(?![\w-])/g, ":scope"));
  }
  return [...pageWide, `@scope (${roots}) {`, ...scoped, "}", ""].join("\n");
}

/** @param {string} path */
const scopedSheetAt = (path) => scopeSheet(readFileSync(path, "utf8"), BPMN_SCOPE);

/**
 * For Vite and Vitest (`plugins`).
 *
 * @type {{ name: string, enforce: "pre", load(id: string): string | null }}
 */
export const bpmnSheetScopeVite = {
  name: "bpmn-sheet-scope",
  enforce: "pre",
  load(id) {
    const [path = ""] = id.split("?");
    return BPMN_SHEET.test(path) ? scopedSheetAt(path) : null;
  },
};

/**
 * For esbuild (`plugins`), to the same effect.
 *
 * @type {{
 *   name: string,
 *   setup(build: {
 *     onLoad(
 *       options: { filter: RegExp },
 *       callback: (args: { path: string }) => { contents: string, loader: "css" },
 *     ): void,
 *   }): void,
 * }}
 */
export const bpmnSheetScopeEsbuild = {
  name: "bpmn-sheet-scope",
  setup(build) {
    build.onLoad({ filter: BPMN_SHEET }, ({ path }) => ({
      contents: scopedSheetAt(path),
      loader: "css",
    }));
  },
};
