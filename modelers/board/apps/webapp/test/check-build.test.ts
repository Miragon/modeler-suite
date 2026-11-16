import { describe, expect, test } from "vitest";
import {
  LICENCE_COMMENTS,
  MARKER_MIN_LENGTH,
  RENDERER_ROOTS,
  START_MARK,
  buildProblems,
  exampleMarker,
  type Build,
} from "../scripts/build-problems.mjs";

const PAGE_SHEET = [
  ".cd-shell-legal{left:var(--cd-shell-rand)}",
  ".board-root{display:flex}",
  ".djs-context-pad.open{display:block}",
  ".board-engine[data-armed=false][data-embed=diagram-js] .djs-container>:not(svg){display:none!important}",
  ".cd-shell .board-root .board-toolbar{margin-left:var(--cd-shell-frei)}",
].join("");

const HTML = [
  '<html lang="en" class="cd-shell-document" data-cd-theme="light"><head>',
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '<meta name="theme-color" content="#335DE5">',
  '<script>if (window.matchMedia("(prefers-contrast: more)").matches) document.documentElement.setAttribute("data-cd-kontrast", "hoch");</script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-a1.css">',
  "</head></html>",
].join("");

/** an example folder: a board, a model whose lines hold quotes, and a picture */
const EXAMPLE = {
  "example.board": '{"format":"structured-model","meta":{"title":"The board of this example"}}\n',
  "models/tea.owm": "title Tea Shop\ncomponent Cup of Tea [0.79, 0.61]\n",
  "assets/mark.svg":
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,89.63l220.2-14.78c11.65"/></svg>',
};

/** a script as a bundler writes a text file into it: one string, its line breaks escaped */
const asScript = (text: string): string => `const file = ${JSON.stringify(text)};`;

/** a build as Vite writes it: one sheet the page links, one per notation, the legal comments kept */
function build(change: Partial<Build> = {}): Build {
  return {
    html: HTML,
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
      "/*! @miragon/modeler-shell icon geometry\n* Lucide (lucide-static 1.59.0) @license ISC */",
      ...["wardley", "context-maps", "value-chain", "c4", "business-model-canvas"].map(
        (name) => `/*! @miragon/${name}-renderer icon geometry\n * Lucide @license ISC */`,
      ),
      'throw Error("Minified React error #"+e+"; visit https://react.dev/errors/"+e)',
      ...Object.values(EXAMPLE).map(asScript),
    ],
    files: ["index.html", "favicon.svg", START_MARK],
    example: EXAMPLE,
    ...change,
  };
}

const sheetsWith = (change: Record<string, string>): Build["sheets"] => ({
  ...build().sheets,
  ...change,
});

/** the build's scripts without the ones that hold `text` */
const scriptsWithout = (text: string): string[] =>
  build().scripts.filter((script) => !script.includes(text));

describe("buildProblems", () => {
  test("finds nothing wrong with a whole build", () => {
    expect(buildProblems(build())).toEqual({
      problems: [],
      linked: ["index-a1.css"],
      later: Array.from({ length: 7 }, (_, index) => `notation-${index}.css`),
    });
  });

  test("names the seven renderers of the suite and the seven legal comments", () => {
    expect(Object.keys(RENDERER_ROOTS)).toHaveLength(7);
    expect(Object.keys(LICENCE_COMMENTS).sort()).toEqual([
      "@miragon/business-model-canvas-renderer",
      "@miragon/c4-renderer",
      "@miragon/context-maps-renderer",
      "@miragon/modeler-shell",
      "@miragon/value-chain-renderer",
      "@miragon/wardley-renderer",
      "lucide-react",
    ]);
  });

  test("a page that is not light", () => {
    const { problems } = buildProblems(
      build({ html: build().html.replace(' data-cd-theme="light"', "") }),
    );

    expect(problems).toEqual([
      '<html> lacks data-cd-theme="light": the editors in the nodes draw light',
    ]);
  });

  test("a page without the class the shell sizes it by", () => {
    const { problems } = buildProblems(
      build({ html: HTML.replace(' class="cd-shell-document"', "") }),
    );

    expect(problems).toEqual([
      '<html> lacks class="cd-shell-document": the shell sizes the page by it',
    ]);
  });

  test("a page whose mode markup the build did not write", () => {
    const marker = HTML.replace(/<meta name="theme-color"[^>]*>/, "<!-- miragon-mode -->").replace(
      /<script>.*<\/script>/,
      "",
    );

    expect(buildProblems(build({ html: marker })).problems).toEqual([
      "index.html still has the mode marker",
      "index.html has no theme-color with a colour from the tokens",
      "index.html has no contrast line",
    ]);
    // a theme-color that is no colour of the tokens: a name, or a marker left by a template
    expect(
      buildProblems(build({ html: HTML.replace('content="#335DE5"', 'content="blue"') })).problems,
    ).toEqual(["index.html has no theme-color with a colour from the tokens"]);
    expect(
      buildProblems(build({ html: HTML.replace("prefers-contrast", "prefers-color-scheme") }))
        .problems,
    ).toEqual(["index.html has no contrast line"]);
  });

  test("a page that links no sheet has neither the board's sheet nor the shell's nor the base", () => {
    const { problems, linked } = buildProblems(
      build({ html: HTML.replace(/<link rel="stylesheet"[^>]*>/, "") }),
    );

    expect(linked).toEqual([]);
    expect(problems).toEqual([
      "index.html links no stylesheet of the bundle",
      "the page's sheet has no .board-root rule: the board's stylesheet is missing",
      "the page's sheet has no .cd-shell-legal rule: the shell's stylesheet is missing",
      expect.stringContaining("the board's toolbar would lie under the shell's menu"),
      expect.stringContaining("every preview would show its editor's palette"),
      // the sheet is in the build, and no page loads it
      expect.stringContaining("in the page's sheet 0 times and in the notations' sheets 1 times"),
    ]);
  });

  test("the shell's sheet left out", () => {
    const { problems } = buildProblems(
      build({
        sheets: sheetsWith({ "index-a1.css": PAGE_SHEET.replace(".cd-shell-legal{", ".x{") }),
      }),
    );

    expect(problems).toEqual([
      "the page's sheet has no .cd-shell-legal rule: the shell's stylesheet is missing",
    ]);
  });

  test("the rules that make one picture of the shell and the board left out", () => {
    const without = PAGE_SHEET.replace(
      ".cd-shell .board-root .board-toolbar{margin-left:var(--cd-shell-frei)}",
      "",
    );
    // the selector alone is no sign of the rule: the start screen's rule has it too
    const another = PAGE_SHEET.replace("{margin-left:var(--cd-shell-frei)}", "{visibility:hidden}");

    for (const sheet of [without, another]) {
      expect(
        buildProblems(build({ sheets: sheetsWith({ "index-a1.css": sheet }) })).problems,
      ).toEqual([
        "the page's sheet has no start margin on .cd-shell .board-root .board-toolbar: the " +
          "board's toolbar would lie under the shell's menu",
      ]);
    }
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
    expect(buildProblems(build({ scripts: scriptsWithout("c4-renderer") })).problems).toEqual([
      "no script of the bundle keeps the Lucide @license comment of @miragon/c4-renderer",
    ]);
    expect(buildProblems(build({ scripts: scriptsWithout("modeler-shell") })).problems).toEqual([
      "no script of the bundle keeps the Lucide @license comment of @miragon/modeler-shell",
    ]);
    expect(
      buildProblems(build({ scripts: [] })).problems.filter((problem) =>
        problem.includes("@license"),
      ),
    ).toHaveLength(7);
  });

  test.each(Object.keys(EXAMPLE))("a build that lacks the example's %s", (path) => {
    const text = EXAMPLE[path as keyof typeof EXAMPLE];
    const scripts = build().scripts.filter((script) => script !== asScript(text));

    expect(buildProblems(build({ scripts })).problems).toEqual([
      `no script of the bundle carries example/${path}`,
    ]);
  });

  test("an example file the folder gained and the bundle did not", () => {
    const example = { ...EXAMPLE, "models/new.vc.json": '{"name":"A value chain nobody bundled"}' };

    expect(buildProblems(build({ example })).problems).toEqual([
      "no script of the bundle carries example/models/new.vc.json",
    ]);
  });

  test("an example file the check has nothing to look for in, and two it cannot tell apart", () => {
    const short = { ...EXAMPLE, "assets/dot.svg": '<svg><path d="M0"/></svg>' };
    const twice = { ...EXAMPLE, "models/tea-again.owm": EXAMPLE["models/tea.owm"] };

    expect(buildProblems(build({ example: short })).problems).toEqual([
      `example/assets/dot.svg has no run of ${MARKER_MIN_LENGTH} plain characters to look for`,
    ]);
    expect(buildProblems(build({ example: twice })).problems).toEqual([
      "example/models/tea-again.owm and example/models/tea.owm cannot be told apart in the bundle",
    ]);
    expect(buildProblems(build({ example: {} })).problems).toEqual([
      "the example folder has no file",
    ]);
  });

  test("a build without React's production build", () => {
    expect(
      buildProblems(build({ scripts: scriptsWithout("Minified React error") })).problems,
    ).toEqual(["no script of the bundle carries React's production build"]);
  });

  test("a build with a development build of React in it", () => {
    const scripts = [...build().scripts, 'const frames = { "react-stack-top-frame": run };'];

    expect(buildProblems(build({ scripts })).problems).toEqual([
      "a script of the bundle carries a development build of React",
    ]);
  });

  test("a build without the start screen's mark", () => {
    expect(buildProblems(build({ files: ["index.html", "favicon.svg"] })).problems).toEqual([
      `the start screen's ${START_MARK} is missing`,
    ]);
    expect(START_MARK).toBe("miragon-komet-blau.svg");
  });

  test("a page whose icon the build does not carry, and a page that links none", () => {
    expect(buildProblems(build({ files: ["index.html", START_MARK] })).problems).toEqual([
      "index.html links the icon /favicon.svg, which the build does not carry",
    ]);
    const without = HTML.replace(/<link rel="icon"[^>]*>/, "");
    expect(buildProblems(build({ html: without })).problems).toEqual(["index.html links no icon"]);
    // a page under a base path links its icon without the leading slash, or from the folder
    for (const href of ["favicon.svg", "./favicon.svg"]) {
      const html = HTML.replace('href="/favicon.svg"', `href="${href}"`);
      expect(buildProblems(build({ html })).problems).toEqual([]);
    }
  });
});

describe("the text the check looks for of an example file", () => {
  test("is its longest run of characters a script holds as they are", () => {
    expect(exampleMarker("title Tea Shop\ncomponent Cup of Tea [0.79, 0.61]\n")).toBe(
      "component Cup of Tea",
    );
    // no quote, no backslash, no bracket: whatever quotes the bundler picks, the run is there
    expect(exampleMarker('{"text":"He said \\"a board of files\\" and left"}')).toBe(
      "a board of files",
    );
    expect(exampleMarker('<path d="M0,89.63l220.2-14.78c11.65"/>')).toBe(
      "M0,89.63l220.2-14.78c11.65",
    );
  });

  test("is in the script of that file, however the bundler quotes the string", () => {
    const text =
      "note \"Design-level\" session: `checkout` flow, 'as it is done today'\\n$" + "{x}\n";
    const marker = exampleMarker(text) ?? "";
    const escaped = (quote: string): string =>
      quote +
      text
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll(quote, `\\${quote}`)
        .replaceAll("$" + "{", "\\$" + "{") +
      quote;

    expect(marker).toBe("as it is done today");
    for (const quote of ['"', "'", "`"]) expect(escaped(quote), quote).toContain(marker);
  });

  test("is none for a file without a run that is long enough", () => {
    expect(exampleMarker("")).toBeUndefined();
    expect(exampleMarker('{"a":1,"b":[2,3]}')).toBeUndefined();
    expect(exampleMarker("x".repeat(MARKER_MIN_LENGTH - 1))).toBeUndefined();
    expect(exampleMarker("x".repeat(MARKER_MIN_LENGTH))).toBe("x".repeat(MARKER_MIN_LENGTH));
  });
});
