/**
 * What a production build of the web app must carry, as a function of its files, so that a test
 * can hand it a build that lacks one of them. `check-build.mjs` runs it on `dist`.
 *
 * The page: the mode markup the Vite plugin writes before the first paint (guide §13.3), and the
 * class the shell's own-document rules hang on. The sheets: a build can leave one out, since the
 * packages mark only their CSS as having side effects, so the sheet the page links has the
 * board's, the shell's, the rules that make one picture of the two, and the preview rule of the
 * editors. The base every renderer sheet shares is there once and before any renderer's own
 * rules: a second copy after them overrides them at equal weight (Context Maps' open context pad
 * lost its flex that way). The BPMN modeler's sheet keeps a copy of its own, held to the BPMN
 * editors by one `@scope` (`board-suite-editors/build/css-scope.mjs`), where it reaches no other
 * renderer. The scripts: the example's files, which the bundler reads from the
 * folder; React's production build and no development build; and the legal comments of the
 * icons, Lucide's (ISC, partly Feather, MIT), as the board loads them and as the shell and five
 * renderers inline their geometry. The public folder: the Miragon mark of the start screen, and
 * the icon the page links, which nothing else names.
 */

import { topLevelStatements } from "board-suite-editors/build/css-scope.mjs";

const BASE_RULE = /\.djs-context-pad\.open\s*\{\s*display:\s*block;?\s*\}/g;
const BPMN_SCOPE = /^@scope\s*\(\s*\[data-notation="?bpmn"?\]\s*,\s*\.am-overlay-root\s*\)\s*\{/;
/** a rule only the BPMN modeler's sheet has: its properties panel */
const BPMN_RULE = /\.bio-properties-panel\s*\{/;
const PAD_RULE = ".djs-context-pad.open";
const PREVIEW_RULE = /\.board-engine\[data-armed="?false"?\]\[data-embed="?diagram-js"?\]/;
const SHELL_RULE = /\.cd-shell-legal\s*\{/;
const JOINT_RULE = /\.cd-shell \.board-root \.board-toolbar\s*\{\s*margin-left:/;

/** The file of the public folder the start screen shows. */
export const START_MARK = "miragon-komet-blau.svg";

// React's production build names its errors by number; every development build of React, of
// its DOM renderer and of its JSX runtime carries the frame name of its owner stacks.
const REACT_PRODUCTION = "Minified React error #";
const REACT_DEVELOPMENT = "react-stack-top-frame";

/** The class each renderer of the suite scopes its own rules by. */
export const RENDERER_ROOTS = {
  "Wardley Maps": ".wardley-container",
  "Event Storming": ".event-storming-container",
  "Team Topologies": ".tt-djs-container",
  "Context Maps": ".cm-djs-container",
  "Value Chain": ".vc-container",
  "C4 model": ".c4-container",
  "Business Model Canvas": ".business-model-canvas-container",
};

/** @type {Readonly<Record<string, RegExp>>} */
export const LICENCE_COMMENTS = {
  "lucide-react": /@license lucide-react v\d+\.\d+\.\d+ - ISC/,
  "@miragon/modeler-shell": /@miragon\/modeler-shell icon geometry[\s\S]{0,200}@license ISC/,
  ...Object.fromEntries(
    ["wardley", "context-maps", "value-chain", "c4", "business-model-canvas"].map((name) => [
      `@miragon/${name}-renderer`,
      new RegExp(`@miragon/${name}-renderer icon geometry[\\s\\S]{0,200}@license ISC`),
    ]),
  ),
};

/** The shortest text of a file the check takes for a sign of that file. */
export const MARKER_MIN_LENGTH = 16;

/**
 * The text of a file the check looks for in the scripts: its longest run of characters that a
 * script holds as they are, however the bundler quotes the string (letters, digits, the space
 * and four marks; no quote, no backslash, no line break). Undefined for a file without a run of
 * `MARKER_MIN_LENGTH` characters.
 *
 * @param {string} text
 * @returns {string | undefined}
 */
export function exampleMarker(text) {
  const longest = (text.match(/[A-Za-z0-9 .,:-]+/g) ?? [])
    .map((run) => run.trim())
    .reduce((best, run) => (run.length > best.length ? run : best), "");
  return longest.length >= MARKER_MIN_LENGTH ? longest : undefined;
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {number}
 */
const count = (text, pattern) => [...text.matchAll(pattern)].length;

/**
 * The sheets index.html links, by file name and in its order.
 *
 * @param {string} html
 * @returns {string[]}
 */
function linkedSheets(html) {
  return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].flatMap(([tag]) => {
    const name = /\bhref="[^"]*\/assets\/([^"/]+\.css)"/.exec(tag)?.[1];
    return name === undefined ? [] : [name];
  });
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function pageProblems(html) {
  const problems = [];
  if (!/<html\b[^>]*\bdata-cd-theme="light"/.test(html)) {
    problems.push('<html> lacks data-cd-theme="light": the editors in the nodes draw light');
  }
  if (!/<html\b[^>]*\bclass="cd-shell-document"/.test(html)) {
    problems.push('<html> lacks class="cd-shell-document": the shell sizes the page by it');
  }
  if (html.includes("<!-- miragon-mode -->")) {
    problems.push("index.html still has the mode marker");
  }
  if (!/<meta name="theme-color" content="#[0-9A-Fa-f]{6}"/.test(html)) {
    problems.push("index.html has no theme-color with a colour from the tokens");
  }
  if (!html.includes("prefers-contrast")) problems.push("index.html has no contrast line");
  return problems;
}

/**
 * @param {string} html
 * @param {readonly string[]} files the names of the files beside index.html
 * @returns {string[]}
 */
function publicProblems(html, files) {
  const problems = [];
  if (!files.includes(START_MARK)) problems.push(`the start screen's ${START_MARK} is missing`);
  const icon = /<link\b[^>]*\brel="icon"[^>]*>/.exec(html)?.[0];
  const href = icon === undefined ? undefined : /\bhref="([^"]*)"/.exec(icon)?.[1];
  if (href === undefined) problems.push("index.html links no icon");
  else if (!files.includes(href.replace(/^\.?\//, ""))) {
    problems.push(`index.html links the icon ${href}, which the build does not carry`);
  }
  return problems;
}

/**
 * @param {string} pageSheet the sheets the page links, in its order
 * @param {string} laterSheets the notations' sheets
 * @returns {string[]}
 */
function sheetProblems(pageSheet, laterSheets) {
  const problems = [];
  if (!/\.board-root\s*\{/.test(pageSheet)) {
    problems.push("the page's sheet has no .board-root rule: the board's stylesheet is missing");
  }
  if (!SHELL_RULE.test(pageSheet)) {
    problems.push(
      "the page's sheet has no .cd-shell-legal rule: the shell's stylesheet is missing",
    );
  }
  if (!JOINT_RULE.test(pageSheet)) {
    problems.push(
      "the page's sheet has no start margin on .cd-shell .board-root .board-toolbar: the " +
        "board's toolbar would lie under the shell's menu",
    );
  }
  if (!PREVIEW_RULE.test(pageSheet)) {
    problems.push(
      "the page's sheet has no rule on .board-engine[data-armed=false][data-embed=diagram-js]: " +
        "every preview would show its editor's palette",
    );
  }
  const statements = topLevelStatements(laterSheets);
  const outsideBpmn = statements.filter((statement) => !BPMN_SCOPE.test(statement)).join("\n");
  if (BPMN_RULE.test(outsideBpmn)) {
    problems.push(
      "the BPMN modeler's sheet stands outside its @scope: its copy of diagram-js's base " +
        "would override the other renderers' own rules",
    );
  }
  const baseInPage = count(pageSheet, BASE_RULE);
  const baseLater = count(outsideBpmn, BASE_RULE);
  if (baseInPage !== 1 || baseLater !== 0) {
    problems.push(
      `diagram-js's base rule of the context pad is in the page's sheet ${baseInPage} times and ` +
        `in the notations' sheets ${baseLater} times: it belongs into the page's sheet, once`,
    );
  }
  const allSheets = `${pageSheet}\n${laterSheets}`;
  const firstPadRule = allSheets.indexOf(PAD_RULE);
  for (const [renderer, root] of Object.entries(RENDERER_ROOTS)) {
    const firstRoot = allSheets.indexOf(root);
    if (firstRoot < 0) {
      problems.push(`no sheet of the bundle carries ${root}: the sheet of ${renderer} is missing`);
    } else if (firstPadRule < 0 || firstRoot < firstPadRule) {
      problems.push(`${root} (${renderer}) comes before the first ${PAD_RULE} rule`);
    }
  }
  return problems;
}

/**
 * @param {readonly string[]} scripts
 * @param {Readonly<Record<string, string>>} example
 * @returns {string[]}
 */
function scriptProblems(scripts, example) {
  const problems = [];
  const held = (/** @type {string} */ text) => scripts.some((script) => script.includes(text));
  /** @type {Map<string, string>} */
  const markers = new Map();
  for (const [path, text] of Object.entries(example)) {
    const marker = exampleMarker(text);
    const other = marker === undefined ? undefined : markers.get(marker);
    if (marker === undefined) {
      problems.push(
        `example/${path} has no run of ${MARKER_MIN_LENGTH} plain characters to look for`,
      );
    } else if (other !== undefined) {
      problems.push(`example/${path} and example/${other} cannot be told apart in the bundle`);
    } else if (!held(marker)) {
      problems.push(`no script of the bundle carries example/${path}`);
    }
    if (marker !== undefined) markers.set(marker, path);
  }
  if (Object.keys(example).length === 0) problems.push("the example folder has no file");
  if (!held(REACT_PRODUCTION)) {
    problems.push("no script of the bundle carries React's production build");
  }
  if (held(REACT_DEVELOPMENT)) {
    problems.push("a script of the bundle carries a development build of React");
  }
  for (const [source, comment] of Object.entries(LICENCE_COMMENTS)) {
    if (!scripts.some((script) => comment.test(script))) {
      problems.push(`no script of the bundle keeps the Lucide @license comment of ${source}`);
    }
  }
  return problems;
}

/**
 * @param {{
 *   html: string,
 *   sheets: Readonly<Record<string, string>>,
 *   scripts: readonly string[],
 *   files: readonly string[],
 *   example: Readonly<Record<string, string>>,
 * }} build index.html, every built sheet by file name, every built script, the names of the
 *   files beside index.html, and the files of the example folder by path
 * @returns {{ problems: string[], linked: string[], later: string[] }} what is wrong with the
 *   build, the sheets the page links, and the ones that come later with a notation
 */
export function buildProblems({ html, sheets, scripts, files, example }) {
  // The sheets in the order a page loads them: the ones index.html links, then each notation's,
  // which comes with the script of its notation when a node first shows it.
  const linked = linkedSheets(html).filter((name) => Object.hasOwn(sheets, name));
  const later = Object.keys(sheets)
    .filter((name) => !linked.includes(name))
    .sort();
  const pageSheet = linked.map((name) => sheets[name]).join("\n");
  const laterSheets = later.map((name) => sheets[name]).join("\n");

  const problems = [
    ...pageProblems(html),
    ...(linked.length === 0 ? ["index.html links no stylesheet of the bundle"] : []),
    ...sheetProblems(pageSheet, laterSheets),
    ...scriptProblems(scripts, example),
    ...publicProblems(html, files),
  ];
  return { problems, linked, later };
}
