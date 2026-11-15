/**
 * What a production build of the web app must carry, as a function of its files, so that a test
 * can hand it a build that lacks one of them. `check-build.mjs` runs it on `dist`.
 *
 * The board's sheet and the preview rule of its editors are in the sheet the page links: a build
 * can leave a sheet out, since the packages mark only their CSS as having side effects. The base
 * every renderer sheet shares is there once and before any renderer's own rules: a second copy
 * after them overrides them at equal weight (Context Maps' open context pad lost its flex that
 * way). The legal comments of the icons are kept: Lucide's (ISC, partly Feather, MIT), as the
 * board loads them and as five renderers inline their geometry.
 */

const BASE_RULE = /\.djs-context-pad\.open\s*\{\s*display:\s*block;?\s*\}/g;
const PAD_RULE = ".djs-context-pad.open";
const PREVIEW_RULE = /\.board-engine\[data-armed="?false"?\]\[data-embed="?diagram-js"?\]/;

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
  ...Object.fromEntries(
    ["wardley", "context-maps", "value-chain", "c4", "business-model-canvas"].map((name) => [
      `@miragon/${name}-renderer`,
      new RegExp(`@miragon/${name}-renderer icon geometry[\\s\\S]{0,200}@license ISC`),
    ]),
  ),
};

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
 * @param {{
 *   html: string,
 *   sheets: Readonly<Record<string, string>>,
 *   scripts: readonly string[],
 * }} build index.html, every built sheet by file name, and every built script
 * @returns {{ problems: string[], linked: string[], later: string[] }} what is wrong with the
 *   build, the sheets the page links, and the ones that come later with a notation
 */
export function buildProblems({ html, sheets, scripts }) {
  // The sheets in the order a page loads them: the ones index.html links, then each notation's,
  // which comes with the script of its notation when a node first shows it.
  const linked = linkedSheets(html).filter((name) => Object.hasOwn(sheets, name));
  const later = Object.keys(sheets)
    .filter((name) => !linked.includes(name))
    .sort();
  const pageSheet = linked.map((name) => sheets[name]).join("\n");
  const laterSheets = later.map((name) => sheets[name]).join("\n");
  const allSheets = `${pageSheet}\n${laterSheets}`;

  const problems = [];
  if (!/<html\b[^>]*\bdata-cd-theme="light"/.test(html)) {
    problems.push('<html> lacks data-cd-theme="light": the editors in the nodes draw light');
  }
  if (linked.length === 0) problems.push("index.html links no stylesheet of the bundle");
  if (!/\.board-root\s*\{/.test(pageSheet)) {
    problems.push("the page's sheet has no .board-root rule: the board's stylesheet is missing");
  }
  if (!PREVIEW_RULE.test(pageSheet)) {
    problems.push(
      "the page's sheet has no rule on .board-engine[data-armed=false][data-embed=diagram-js]: " +
        "every preview would show its editor's palette",
    );
  }
  const baseInPage = count(pageSheet, BASE_RULE);
  const baseLater = count(laterSheets, BASE_RULE);
  if (baseInPage !== 1 || baseLater !== 0) {
    problems.push(
      `diagram-js's base rule of the context pad is in the page's sheet ${baseInPage} times and ` +
        `in the notations' sheets ${baseLater} times: it belongs into the page's sheet, once`,
    );
  }
  const firstPadRule = allSheets.indexOf(PAD_RULE);
  for (const [renderer, root] of Object.entries(RENDERER_ROOTS)) {
    const firstRoot = allSheets.indexOf(root);
    if (firstRoot < 0) {
      problems.push(`no sheet of the bundle carries ${root}: the sheet of ${renderer} is missing`);
    } else if (firstPadRule < 0 || firstRoot < firstPadRule) {
      problems.push(`${root} (${renderer}) comes before the first ${PAD_RULE} rule`);
    }
  }
  for (const [source, comment] of Object.entries(LICENCE_COMMENTS)) {
    if (!scripts.some((script) => comment.test(script))) {
      problems.push(`no script of the bundle keeps the Lucide @license comment of ${source}`);
    }
  }
  return { problems, linked, later };
}
