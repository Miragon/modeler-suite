import { describe, expect, test } from "vitest";
import {
  LICENCE_COMMENTS,
  RENDERER_ROOTS,
  buildProblems,
  type Build,
} from "../scripts/build-problems.mjs";

const PAGE_SHEET = [
  ".board-root{display:flex}",
  ".djs-context-pad.open{display:block}",
  ".board-engine[data-armed=false][data-embed=diagram-js] .djs-container>:not(svg){display:none!important}",
].join("");

/** a build as Vite writes it: one sheet the page links, one per notation, the legal comments kept */
function build(change: Partial<Build> = {}): Build {
  return {
    html: `<html lang="en" data-cd-theme="light"><head><link rel="stylesheet" crossorigin href="/assets/index-a1.css"></head></html>`,
    sheets: {
      "index-a1.css": PAGE_SHEET,
      ...Object.fromEntries(
        Object.values(RENDERER_ROOTS).map((root, index) => [
          `notation-${index}.css`,
          `${root} .djs-context-pad.open{display:flex}`,
        ]),
      ),
    },
    scripts: [
      "/*! @license lucide-react v1.70.0 - ISC */",
      ...["wardley", "context-maps", "value-chain", "c4", "business-model-canvas"].map(
        (name) => `/*! @miragon/${name}-renderer icon geometry\n * Lucide @license ISC */`,
      ),
    ],
    ...change,
  };
}

const sheetsWith = (change: Record<string, string>): Build["sheets"] => ({
  ...build().sheets,
  ...change,
});

describe("buildProblems", () => {
  test("finds nothing wrong with a whole build", () => {
    expect(buildProblems(build())).toEqual({
      problems: [],
      linked: ["index-a1.css"],
      later: Array.from({ length: 7 }, (_, index) => `notation-${index}.css`),
    });
  });

  test("names the seven renderers of the suite and the six legal comments", () => {
    expect(Object.keys(RENDERER_ROOTS)).toHaveLength(7);
    expect(Object.keys(LICENCE_COMMENTS)).toHaveLength(6);
  });

  test("a page that is not light", () => {
    const { problems } = buildProblems(
      build({ html: build().html.replace(' data-cd-theme="light"', "") }),
    );

    expect(problems).toEqual([
      '<html> lacks data-cd-theme="light": the editors in the nodes draw light',
    ]);
  });

  test("a page that links no sheet has neither the board's sheet nor the base", () => {
    const { problems, linked } = buildProblems(build({ html: '<html data-cd-theme="light">' }));

    expect(linked).toEqual([]);
    expect(problems.slice(0, 4)).toEqual([
      "index.html links no stylesheet of the bundle",
      "the page's sheet has no .board-root rule: the board's stylesheet is missing",
      expect.stringContaining("every preview would show its editor's palette"),
      expect.stringContaining("in the page's sheet 0 times and in the notations' sheets 1 times"),
    ]);
  });

  test("the board's sheet left out", () => {
    const { problems } = buildProblems(
      build({ sheets: sheetsWith({ "index-a1.css": PAGE_SHEET.replace(".board-root{", ".x{") }) }),
    );

    expect(problems).toEqual([
      "the page's sheet has no .board-root rule: the board's stylesheet is missing",
    ]);
  });

  test("the preview rule left out, and the rule as an unminified sheet writes it", () => {
    const without = PAGE_SHEET.replace("[data-embed=diagram-js]", "");
    const quoted = PAGE_SHEET.replace(
      "[data-armed=false][data-embed=diagram-js]",
      '[data-armed="false"][data-embed="diagram-js"]',
    );

    expect(
      buildProblems(build({ sheets: sheetsWith({ "index-a1.css": without }) })).problems,
    ).toEqual([expect.stringContaining("every preview would show its editor's palette")]);
    expect(
      buildProblems(build({ sheets: sheetsWith({ "index-a1.css": quoted }) })).problems,
    ).toEqual([]);
  });

  test("the shared base in a notation's sheet again, after that renderer's own rules", () => {
    const { problems } = buildProblems(
      build({
        sheets: sheetsWith({
          "notation-3.css":
            ".cm-djs-container .djs-context-pad.open{display:flex}.djs-context-pad.open{display:block}",
        }),
      }),
    );

    expect(problems).toEqual([
      "diagram-js's base rule of the context pad is in the page's sheet 1 times and in the " +
        "notations' sheets 1 times: it belongs into the page's sheet, once",
    ]);
  });

  test("the shared base missing from the page's sheet: the first pad rule is a renderer's own", () => {
    const { problems } = buildProblems(
      build({
        sheets: sheetsWith({
          "index-a1.css": PAGE_SHEET.replace(".djs-context-pad.open{display:block}", ""),
        }),
      }),
    );

    expect(problems).toEqual([
      expect.stringContaining("in the page's sheet 0 times and in the notations' sheets 0 times"),
      ".wardley-container (Wardley Maps) comes before the first .djs-context-pad.open rule",
    ]);
  });

  test("a renderer's rules in the page's sheet before the base", () => {
    const { problems } = buildProblems(
      build({
        sheets: sheetsWith({ "index-a1.css": `.vc-container .djs-palette{top:0}${PAGE_SHEET}` }),
      }),
    );

    expect(problems).toEqual([
      ".vc-container (Value Chain) comes before the first .djs-context-pad.open rule",
    ]);
  });

  test("a renderer whose sheet is not in the bundle", () => {
    const { "notation-2.css": _teamTopologies, ...sheets } = build().sheets;

    expect(buildProblems(build({ sheets })).problems).toEqual([
      "no sheet of the bundle carries .tt-djs-container: the sheet of Team Topologies is missing",
    ]);
  });

  test("a legal comment the minifier dropped", () => {
    const scripts = build().scripts.filter((script) => !script.includes("c4-renderer"));

    expect(buildProblems(build({ scripts })).problems).toEqual([
      "no script of the bundle keeps the Lucide @license comment of @miragon/c4-renderer",
    ]);
    expect(buildProblems(build({ scripts: [] })).problems).toHaveLength(6);
  });
});
