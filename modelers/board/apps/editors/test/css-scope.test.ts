import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  BPMN_SCOPE,
  bpmnSheetScopeEsbuild,
  bpmnSheetScopeVite,
  scopeSheet,
  topLevelStatements,
} from "../build/css-scope.mjs";

/**
 * The BPMN modeler's sheet held to the BPMN editors (`build/css-scope.mjs`): the statements of a
 * sheet, what stays page-wide and what goes into `@scope`, on small sheets and on the sheet of
 * the installed `@miragon/bpmn-modeler`, and the two bundlers' ways to it.
 */

const SHEET = fileURLToPath(
  new URL(
    "../../../../../node_modules/@miragon/bpmn-modeler/dist/bpmn-modeler.css",
    import.meta.url,
  ),
);

describe("the top-level statements of a sheet", () => {
  it("are each rule with its block and each statement at-rule with its semicolon", () => {
    expect(
      topLevelStatements('@charset "utf-8";a{color:red}@media (min-width:1px){b{c:d}}  e{}'),
    ).toEqual(['@charset "utf-8";', "a{color:red}", "@media (min-width:1px){b{c:d}}", "e{}"]);
  });

  it("are not cut by a brace in a string, a comment or an unquoted url()", () => {
    const sheet =
      'a{content:"}{"}/* } */b{background:url(data:image/svg+xml;utf8,<svg style="a{b}"/>)}' +
      "c{content:'\\'}'}";
    expect(topLevelStatements(sheet)).toEqual([
      'a{content:"}{"}',
      '/* } */b{background:url(data:image/svg+xml;utf8,<svg style="a{b}"/>)}',
      "c{content:'\\'}'}",
    ]);
  });
});

describe("a sheet held to a scope", () => {
  it("keeps what @scope cannot hold in front of it, and reads :root as the scope's root", () => {
    const sheet =
      "@font-face{font-family:x}:root{--a:1}a{color:red}@keyframes k{to{opacity:1}}" +
      "@media (forced-colors:active){:root[data-x] b{c:d}}";
    expect(scopeSheet(sheet, ".editor")).toBe(
      [
        "@font-face{font-family:x}",
        "@keyframes k{to{opacity:1}}",
        "@scope (.editor) {",
        ":scope{--a:1}",
        "a{color:red}",
        "@media (forced-colors:active){:scope[data-x] b{c:d}}",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("takes every statement of the modeler's sheet, and esbuild reads the result without a word", async () => {
    const css = readFileSync(SHEET, "utf8");
    const scoped = scopeSheet(css, BPMN_SCOPE);
    const statements = topLevelStatements(scoped);
    const scope = statements.filter((statement) => statement.startsWith("@scope"));
    expect(scope).toHaveLength(1);
    expect(scope[0]?.startsWith(`@scope (${BPMN_SCOPE}) {`)).toBe(true);
    // nothing is lost: the statements in front and those in the scope are the sheet's
    const inside = topLevelStatements(scope[0]!.slice(scope[0]!.indexOf("{") + 1, -1));
    const pageWide = statements.filter((statement) => !statement.startsWith("@scope"));
    expect(pageWide.length + inside.length).toBe(topLevelStatements(css).length);
    expect(pageWide.every((statement) => /^@(font-face|keyframes)\b/.test(statement))).toBe(true);
    expect(inside.some((statement) => statement.startsWith(".djs-context-pad.open{"))).toBe(true);
    expect(inside.filter((statement) => /(^|[\s,(]):root\b/.test(statement))).toEqual([]);
    const { warnings } = await transform(scoped, { loader: "css", minify: true });
    expect(warnings).toEqual([]);
  });
});

describe("the bundlers' ways to it", () => {
  it("Vite and Vitest load the modeler's sheet scoped, and nothing else", () => {
    const scoped = bpmnSheetScopeVite.load(`${SHEET}?direct`);
    expect(scoped).toBe(scopeSheet(readFileSync(SHEET, "utf8"), BPMN_SCOPE));
    expect(bpmnSheetScopeVite.load("/x/node_modules/diagram-js/assets/diagram-js.css")).toBeNull();
    expect(bpmnSheetScopeVite.enforce).toBe("pre");
  });

  it("esbuild loads the modeler's sheet scoped, by its path alone", () => {
    let filter: RegExp | undefined;
    let load: ((args: { path: string }) => { contents: string; loader: "css" }) | undefined;
    bpmnSheetScopeEsbuild.setup({
      onLoad(options, callback) {
        filter = options.filter;
        load = callback;
      },
    });
    expect(filter?.test(SHEET)).toBe(true);
    expect(filter?.test("/x/node_modules/@miragon/bpmn-modeler/dist/viewer.css")).toBe(false);
    expect(load?.({ path: SHEET })).toEqual({
      contents: scopeSheet(readFileSync(SHEET, "utf8"), BPMN_SCOPE),
      loader: "css",
    });
  });
});
