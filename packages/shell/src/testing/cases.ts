import {
  APPEARANCE_STORAGE_KEY,
  INVALID_STATUS_DELAY_MS,
  SHELL,
  TOOLTIP_DELAY_MS,
  legalLineHeight,
  type Appearance,
  type AppearanceChoice,
  type Size,
} from "../core/index.js";
import {
  absentIslandProblems,
  afterDestroyKeyProblem,
  appearanceProblems,
  ariaProblems,
  createProblems,
  focusHandBackProblems,
  isCanvasMenuAction,
  isToolEntry,
  keptDocumentProblems,
  keyReachProblem,
  legendStartProblems,
  leftoverProblems,
  lockedShapeProblems,
  menuClosedProblems,
  menuKeysAtDocumentProblems,
  menuOpenProblems,
  optionalIslandProblems,
  paletteColorProblems,
  paletteShortcutProblems,
  readOnlyMenuProblems,
  readOnlyPaletteProblems,
  readOnlyStateProblems,
  surroundProblems,
  tabSequenceProblems,
  type FocusHandBackStep,
  type KeyReach,
  type PaletteShortcutFacts,
  type TabStop,
} from "./checks.js";
import {
  MODE_ROLES,
  activeStopProbe,
  appearanceProbe,
  ariaProbe,
  canvasStateProbe,
  focusPlaceProbe,
  menuEntriesProbe,
  menuProbe,
  paletteColorProbe,
  paletteEntriesProbe,
  paletteFocusProbe,
  paletteShortcutProbe,
  readOnlyStateProbe,
  surroundProbe,
  zoomButtonsProbe,
  type AppearanceFacts,
  type AriaFacts,
  type MenuFacts,
  type PaletteEntryState,
  type ShapeFacts,
} from "./facts.js";
import {
  DEFAULT_ROOT,
  dropdownProblems,
  freeRectangle,
  geometryProblems,
  measureChrome,
  tooltipProblems,
  type ChromeMeasurement,
  type TooltipRow,
} from "./geometry.js";
import type {
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellSkip,
  ToastFixture,
} from "./harness.js";
import type { PageLike } from "./page.js";
import {
  CHROME_TARGET_SELECTORS,
  afterPressProbe,
  armCleanupProbe,
  canvasHandlesProbe,
  clearKeysProbe,
  editContextProbe,
  findOverlay,
  findTarget,
  focusProbe,
  focusTarget,
  hostPageModeProbe,
  inPage,
  injectProbe,
  installPageTools,
  leftoverProbe,
  menuItemProbe,
  pageToolsKeptProbe,
  removeInjectedProbe,
  settle,
  targetProbe,
  type ChromeTarget,
  type InjectedKind,
} from "./page-tools.js";
import {
  appearanceChoiceProblems,
  expectedWebMode,
  lightOnlyMenuProblems,
  menuGroupProblems,
  modeSwitchProblems,
  pillPopupAriaProblems,
  webModeProblems,
} from "./web-checks.js";
import { cspCase } from "./csp-case.js";
import { labelEditorCase } from "./label-editor-case.js";
import { forcedColorsCase, reducedMotionCase } from "./media-cases.js";
import { overlayLayersCase } from "./overlay-layers-case.js";
import { createWebCases } from "./web-cases.js";
import {
  DEFAULT_SIZES,
  HOVER_MARGIN_MS,
  LIGHT,
  PARK,
  SHOWN_ISLANDS,
  assertHooksConsistent,
  closeByEscape,
  fail,
  finish,
  hover,
  menuEntries,
  missingHooks,
  openHarness,
  openMenuByClick,
  pollUntil,
  shapes,
  sizeLabel,
  webHookSkips,
} from "./case-tools.js";

export { DEFAULT_SIZES } from "./case-tools.js";
import { modeChangesProbe, watchModeProbe, webModeProbe, type WebModeFacts } from "./web-facts.js";

/** How far the read-only case drags a shape (guide §13.5: no move). */
const LOCKED_DRAG_PX = 40;

/** Room for a modeler that places, selects or re-renders a frame or two after Enter. */
const CREATE_WAIT_MS = 1000;

/** Room after `INVALID_STATUS_DELAY_MS` for the read-only marks and the status box to show. */
const READ_ONLY_WAIT_MS = 1000;

/** Room for the palette's 150ms colour transition (`--cd-motion-fast`) and a frame on either side. */
const COLOR_WAIT_MS = 600;

/** Requested from the modeler by the appearance case (VS Code Dark, High Contrast, High Contrast Light). */
const REQUESTED_APPEARANCES: readonly Appearance[] = [
  { theme: "dark" },
  { theme: "dark", kontrast: "hoch" },
  { theme: "light", kontrast: "hoch" },
];

/**
 * Every kind of text field a modeler or its host renders: inspector and dialog fields, the label
 * editor, code editors (EditContext, Monaco).
 */
const TEXT_FIELDS: ReadonlyArray<readonly [InjectedKind, string]> = [
  ["input", "a text field"],
  ["textarea", "a textarea"],
  ["contenteditable", "an editable label"],
  ["editcontext", "an EditContext editor"],
  ["monaco", "a Monaco editor"],
];

const UNDO_REDO_PRESSES = [
  "Control+KeyZ",
  "Meta+KeyZ",
  "Control+Shift+KeyZ",
  "Meta+Shift+KeyZ",
  "Control+KeyY",
] as const;

const ONE_STEP_UP = 135;
const TWO_STEPS_UP = 182;
const ZOOM_LIMIT_MAX = 400;
const ZOOM_LIMIT_MIN = 20;

function appearanceLabel(appearance: Appearance): string {
  return appearance.kontrast ? `${appearance.theme} + ${appearance.kontrast}` : appearance.theme;
}

/** The visible islands of an ARIA snapshot that a harness may declare absent. */
function visibleIslands(facts: AriaFacts): Set<string> {
  const islands = new Set<string>();
  for (const island of SHOWN_ISLANDS) if (facts[island]?.visible) islands.add(island);
  return islands;
}

/** Dropdown and tooltips of one measured state (guide §5.4, §5.6). */
async function popupGeometry(
  page: PageLike,
  root: string,
  measurement: ChromeMeasurement,
): Promise<string[]> {
  const problems: string[] = [];
  if (!(await openMenuByClick(page, root))) return ["dropdown: no visible menu trigger to open it"];
  const dropdown = await findOverlay(page, root, "menu");
  if (!dropdown) problems.push('dropdown: no visible role="menu" after clicking the trigger');
  else problems.push(...dropdownProblems(dropdown.box, measurement.container));
  await closeByEscape(page);

  const rows: Array<[ChromeTarget, TooltipRow]> = [
    ["menu", "top"],
    ["palette-entry", measurement.paletteRow === "second-row" ? "second-row" : "top"],
    ["zoom-in", "bottom"],
  ];
  for (const [target, row] of rows) {
    const anchor = await hover(page, root, target);
    if (!anchor) {
      problems.push(`tooltip: no visible ${target} to hover`);
      continue;
    }
    const tooltip = await findOverlay(page, root, "tooltip");
    if (!tooltip) {
      problems.push(
        `tooltip: none visible ${TOOLTIP_DELAY_MS + HOVER_MARGIN_MS}ms after hovering ${target}`,
      );
      continue;
    }
    if (tooltip.count > 1) problems.push(`tooltip: ${tooltip.count} tooltips visible at once`);
    if (anchor.label && !tooltip.text.startsWith(anchor.label)) {
      problems.push(`tooltip: hovering ${target} ("${anchor.label}") shows "${tooltip.text}"`);
    }
    // The web app's raised zoom row stands above the legal line (`data-zoom-row="raised"`).
    const legalHeight = legalLineHeight(measurement.islands.legal?.height);
    const bottomRow = measurement.open.zoomRaised
      ? SHELL.edge + legalHeight + SHELL.gap
      : SHELL.edge;
    problems.push(
      ...tooltipProblems(
        tooltip.box,
        anchor.box,
        row,
        measurement.container,
        undefined,
        bottomRow,
      ).map((problem) => `${problem} (on ${target})`),
    );
  }
  await page.mouse.move(PARK.x, PARK.y);
  return problems;
}

/** Shown by the geometry case after "as opened"; its action keeps it on screen through every state. */
const GEOMETRY_TOAST: ToastFixture = {
  status: "info",
  text: "Conformance: the toast stack's geometry",
  actionLabel: "Undo",
};

/** The pill's list in the web app (and an embedded one that opens it), measured after a click (guide §5.10). */
async function withProblemsListOpen(
  page: PageLike,
  root: string,
  check: () => Promise<unknown>,
): Promise<void> {
  const pill = await findTarget(page, root, "pill");
  if (!pill) return;
  await page.mouse.click(pill.client.x, pill.client.y);
  await settle(page);
  await check();
  await closeByEscape(page);
}

const geometryCase: ShellConformanceCase = {
  name: "geometry",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("geometry", harness, [...SHOWN_ISLANDS, "toast", "emptyState"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const problems: string[] = [];
    for (const size of harness.sizes ?? DEFAULT_SIZES) {
      const at = sizeLabel(size);
      await openHarness(page, harness, { size, requested: LIGHT });
      await settle(page);
      const check = async (state: string): Promise<ChromeMeasurement> => {
        const measurement = await measureChrome(page, root);
        problems.push(
          ...[
            ...geometryProblems(measurement, harness.host),
            ...absentIslandProblems(new Set(Object.keys(measurement.islands)), harness.absent),
          ].map((problem) => `[${at}, ${state}] ${problem}`),
        );
        return measurement;
      };
      const opened = await check("as opened");
      problems.push(
        ...(await popupGeometry(page, root, opened)).map((problem) => `[${at}] ${problem}`),
      );
      const toast = harness.show?.toast;
      if (toast) {
        await toast(page, GEOMETRY_TOAST);
        await settle(page);
        await check("with a toast");
      }
      for (const island of SHOWN_ISLANDS) {
        const show = harness.show?.[island];
        if (!show) continue;
        await show(page);
        await settle(page);
        await check(`after show.${island}`);
        if (island === "problems" && harness.host !== "ide") {
          await withProblemsListOpen(page, root, () => check("with the problems list open"));
        }
      }
      const emptyState = harness.show?.emptyState;
      if (emptyState) {
        await emptyState(page);
        await settle(page);
        await check("after show.emptyState");
      }
    }
    return finish("geometry", harness.host, problems, [
      ...missingHooks(harness, "the geometry"),
      ...webHookSkips(harness, {
        toast: "the geometry of the toast stack",
        emptyState: "the geometry of the start screen",
      }),
    ]);
  },
};

/**
 * Guide §5.10 since 0.5 (product decision of 2026-10-24): without a stored state the legend starts
 * closed in every container: a phone, 390 × 844, one pixel wider than 440px, where 0.4 opened it,
 * and the wide desktop size.
 */
const LEGEND_START_SIZES: readonly Size[] = [
  { width: 390, height: 844 },
  { width: SHELL.veryNarrow + 1, height: 900 },
  { width: 1280, height: 900 },
];

/**
 * `open` loads the modeler as on a first visit, without a stored legend state, so the shell's
 * default decides: closed at every size. A stored `legend.open` is outside the case, because
 * `open` has no way to pass one. The kit's page tools go in before each `open`: if they survive it,
 * the page kept its document and the shell its earlier start state, which is the harness's fault,
 * not the shell's.
 */
const legendStartCase: ShellConformanceCase = {
  name: "legendStart",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("legendStart", harness, ["legend"]);
    if (harness.absent?.includes("legend")) return undefined;
    if (!harness.show?.legend) {
      return finish(
        "legendStart",
        harness.host,
        [],
        [
          {
            hook: "legend",
            reason: "show.legend is undefined: the legend's start state was not verified",
          },
        ],
      );
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const problems: string[] = [];
    for (const size of LEGEND_START_SIZES) {
      await page.evaluate(installPageTools, null);
      await openHarness(page, harness, { size, requested: LIGHT });
      const kept = keptDocumentProblems(
        size,
        (await page.evaluate(pageToolsKeptProbe, null)) === true,
      );
      if (kept.length > 0) fail("legendStart", harness.host, kept);
      await settle(page);
      const measurement = await measureChrome(page, root);
      const shown = measurement.open.legend || Boolean(measurement.islands.legend);
      problems.push(...legendStartProblems({ container: measurement.container, open: shown }));
    }
    return finish("legendStart", harness.host, problems, []);
  },
};

async function menuState(page: PageLike, root: string): Promise<MenuFacts> {
  const facts = await inPage(page, menuProbe, { root });
  if (!facts) throw new Error(`@miragon/modeler-shell conformance: no element matches "${root}"`);
  return facts;
}

/** Keyboard model of the menu (guide §5.4): Enter/↓ open on the first entry, ↑ on the last, wrap, Escape. */
async function menuKeyboardProblems(page: PageLike, root: string): Promise<string[]> {
  const problems: string[] = [];
  const openWith = async (key: string, focus: "first" | "last"): Promise<MenuFacts | undefined> => {
    if (!(await focusTarget(page, root, "menu"))) {
      problems.push("menu: the trigger cannot take focus");
      return undefined;
    }
    await page.keyboard.press(key);
    await settle(page);
    const opened = await menuState(page, root);
    problems.push(
      ...menuOpenProblems(opened, focus).map((problem) => `${key} on the trigger: ${problem}`),
    );
    return opened;
  };
  const close = async (key: string) => {
    await closeByEscape(page);
    problems.push(
      ...menuClosedProblems(await menuState(page, root), true).map(
        (problem) => `${key}, then Escape: ${problem}`,
      ),
    );
  };

  const opened = await openWith("Enter", "first");
  if (opened && opened.items.length > 1) {
    const moves: Array<[string, (count: number) => number]> = [
      ["ArrowUp", (count) => count - 1],
      ["ArrowDown", () => 0],
      ["End", (count) => count - 1],
      ["Home", () => 0],
    ];
    await inPage(page, clearKeysProbe, null);
    for (const [key, target] of moves) {
      await page.keyboard.press(key);
      const moved = await menuState(page, root);
      const expected = target(moved.items.length);
      if (moved.active !== expected) {
        problems.push(
          `menu: ${key} moves the focus to entry ${moved.active + 1}, expected entry ${expected + 1} of ${moved.items.length}`,
        );
      }
    }
    const { documentKeys } = await inPage(page, afterPressProbe, { root });
    problems.push(
      ...menuKeysAtDocumentProblems(
        moves.map(([key]) => key),
        documentKeys,
      ),
    );
  }
  if (opened) await close("Enter");
  if (await openWith("ArrowDown", "first")) await close("ArrowDown");
  if (await openWith("ArrowUp", "last")) await close("ArrowUp");
  return problems;
}

/** Roving tabindex of the palette toolbar (guide §5.5): ← → Home End. */
async function paletteKeyboardProblems(page: PageLike, root: string): Promise<string[]> {
  const before = await inPage(page, paletteFocusProbe, { root });
  if (!before || before.entries.length < 2) return [];
  if (!(await focusTarget(page, root, "palette-tab-stop"))) {
    return ['palette: no entry with tabindex="0" takes the focus'];
  }
  const problems: string[] = [];
  const start = before.entries.indexOf(before.tabStops[0] ?? "");
  const step = start < before.entries.length - 1 ? 1 : -1;
  const moves: Array<[string, number]> = [
    [step === 1 ? "ArrowRight" : "ArrowLeft", start + step],
    ["End", before.entries.length - 1],
    ["Home", 0],
  ];
  for (const [key, index] of moves) {
    await page.keyboard.press(key);
    const after = await inPage(page, paletteFocusProbe, { root });
    const expected = before.entries[index];
    if (!after || after.active !== expected) {
      problems.push(
        `palette: ${key} focuses "${after?.active ?? "nothing"}", expected "${expected}"`,
      );
    } else if (after.tabStops.length !== 1 || after.tabStops[0] !== expected) {
      problems.push(
        `palette: after ${key} tabindex="0" is on ${after.tabStops.join(", ") || "no entry"}, expected "${expected}"`,
      );
    }
  }
  return problems;
}

/** Every palette entry by keyboard: a shortcut its tooltip shows is named in `aria-keyshortcuts`. */
async function paletteShortcutWalk(page: PageLike, root: string): Promise<string[]> {
  const before = await inPage(page, paletteFocusProbe, { root });
  if (!before || before.entries.length === 0) return [];
  if (!(await focusTarget(page, root, "palette-tab-stop"))) return [];
  if (before.entries.length > 1) await page.keyboard.press("End");
  await page.keyboard.press("Home");
  const seen: PaletteShortcutFacts[] = [];
  for (let index = 0; index < before.entries.length; index++) {
    const facts = await inPage(page, paletteShortcutProbe, { root });
    if (facts) seen.push(facts);
    await page.keyboard.press("ArrowRight");
  }
  return paletteShortcutProblems(seen);
}

/** Tab from the menu trigger: the primary action (web app), the palette's one stop, then the canvas (guide §5.14). */
async function tabSequenceFromMenu(
  page: PageLike,
  root: string,
  primary: boolean,
): Promise<string[]> {
  if (!(await focusTarget(page, root, "menu"))) return [];
  const stops: TabStop[] = [];
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press("Tab");
    const stop = await inPage(page, activeStopProbe, { root });
    stops.push({ description: stop.description, kind: stop.kind as TabStop["kind"] });
  }
  return tabSequenceProblems(stops, primary);
}

/** `aria-disabled` at 400 % and 20 % (guide §5.8), reached by clicking the buttons. */
async function zoomLimitProblems(page: PageLike, root: string): Promise<string[]> {
  const problems: string[] = [];
  const limits: Array<["in" | "out", ChromeTarget, number, number, "in" | "out"]> = [
    ["in", "zoom-in", ZOOM_LIMIT_MAX, 12, "out"],
    ["out", "zoom-out", ZOOM_LIMIT_MIN, 16, "in"],
  ];
  for (const [button, target, limit, maxClicks, other] of limits) {
    const control = await findTarget(page, root, target);
    if (!control) continue;
    let buttons = await inPage(page, zoomButtonsProbe, { root });
    for (
      let click = 0;
      click < maxClicks && buttons[button]?.attributes["aria-disabled"] !== "true";
      click++
    ) {
      await page.mouse.click(control.client.x, control.client.y);
      await settle(page);
      buttons = await inPage(page, zoomButtonsProbe, { root });
    }
    const { zoom } = await inPage(page, afterPressProbe, { root });
    const reached = buttons[button];
    if (reached?.attributes["aria-disabled"] !== "true") {
      problems.push(
        `zoom: [data-zoom="${button}"] is not aria-disabled after ${maxClicks} clicks (readout ${zoom ?? "?"}%)`,
      );
    } else {
      if (zoom !== limit) {
        problems.push(
          `zoom: [data-zoom="${button}"] is disabled at ${zoom ?? "?"}%, expected at ${limit}%`,
        );
      }
      if (reached.disabled)
        problems.push(`zoom: [data-zoom="${button}"] is natively disabled at the limit`);
    }
    if (buttons[other]?.attributes["aria-disabled"] === "true") {
      problems.push(`zoom: [data-zoom="${other}"] is aria-disabled at ${zoom ?? "?"}%`);
    }
    if (buttons.actual?.attributes["aria-disabled"] === "true") {
      problems.push("zoom: the readout is disabled at a limit");
    }
  }
  await page.mouse.move(PARK.x, PARK.y);
  return problems;
}

const ariaCase: ShellConformanceCase = {
  name: "aria",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("aria", harness, SHOWN_ISLANDS);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const facts = await inPage(page, ariaProbe, { root });
    if (!facts)
      fail("aria", harness.host, [`no element matches the shell root selector "${root}"`]);
    const problems = ariaProblems(facts, harness.host);
    problems.push(
      ...menuGroupProblems(await menuEntries(page, root), harness.host, harness.themes),
    );
    problems.push(...(await menuKeyboardProblems(page, root)));
    problems.push(...(await paletteKeyboardProblems(page, root)));
    problems.push(...(await paletteShortcutWalk(page, root)));
    problems.push(
      ...(await tabSequenceFromMenu(
        page,
        root,
        harness.host === "web" && Boolean(facts.primary?.visible),
      )),
    );
    problems.push(...(await zoomLimitProblems(page, root)));

    const shown = new Set<string>();
    for (const island of SHOWN_ISLANDS) {
      const show = harness.show?.[island];
      if (!show) continue;
      await show(page);
      shown.add(island);
    }
    let final: AriaFacts = facts;
    if (shown.size > 0) {
      await settle(page);
      const withIslands = await inPage(page, ariaProbe, { root });
      if (withIslands) {
        final = withIslands;
        problems.push(...optionalIslandProblems(withIslands, shown));
        if (shown.has("problems"))
          problems.push(...pillPopupAriaProblems(withIslands, harness.host));
        const known = new Set(problems);
        problems.push(
          ...ariaProblems(withIslands, harness.host)
            .filter((problem) => !known.has(problem))
            .map((problem) => `with every island shown: ${problem}`),
        );
      }
    }
    problems.push(...absentIslandProblems(visibleIslands(final), harness.absent));
    return finish("aria", harness.host, problems, missingHooks(harness, "the roles and names"));
  },
};

const keysCase: ShellConformanceCase = {
  name: "keys",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const host = harness.host;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const problems: string[] = [];

    if (!(await focusTarget(page, root, "canvas"))) {
      fail("keys", host, ["canvas: the diagram-js <svg> (.djs-container > svg) cannot take focus"]);
    }
    await inPage(page, clearKeysProbe, null);
    let current = (await inPage(page, afterPressProbe, { root })).zoom;
    if (current === null)
      fail("keys", host, ['zoom: no readout [data-zoom="actual"] showing a percentage']);

    const press = async (
      key: string,
      reach: KeyReach | undefined,
      zoom: number | "unchanged" | undefined,
      context = "on the canvas",
    ) => {
      const before = current;
      await page.keyboard.press(key);
      let after = await inPage(page, afterPressProbe, { root });
      const where = `${key} ${context}`;
      if (reach) {
        const problem = keyReachProblem(where, reach, host, after);
        if (problem) problems.push(problem);
      }
      if (zoom === undefined) return;
      const expected = zoom === "unchanged" ? before : zoom;
      // a readout that has not moved yet may still be waiting for its frame; a wrong one stays wrong
      for (let poll = 0; after.zoom === before && expected !== before && poll < 10; poll++) {
        await page.waitForTimeout(50);
        after = await inPage(page, afterPressProbe, { root });
      }
      if (after.zoom !== expected) {
        problems.push(
          zoom === "unchanged"
            ? `${where} changed the zoom from ${before}% to ${after.zoom ?? "?"}%; it must not act`
            : `${where} zoomed to ${after.zoom ?? "?"}% from ${before}%, expected ${expected}% (exactly one step)`,
        );
      }
      current = after.zoom ?? current;
    };
    const inside = async (kind: InjectedKind, context: string, steps: () => Promise<void>) => {
      if (await inPage(page, injectProbe, { root, kind })) await steps();
      else problems.push(`cannot focus ${context} stand-in inside the root`);
      await inPage(page, removeInjectedProbe, null);
    };

    await press("Control+Digit0", "handled", 100);
    const pairs: Array<[string, string]> = [
      ["Control+Equal", "Control+Minus"],
      ["Control+Shift+Equal", "Control+Shift+Minus"],
      ["Meta+Equal", "Meta+Minus"],
      ["Meta+Shift+Equal", "Meta+Shift+Minus"],
      ["Control+NumpadAdd", "Control+NumpadSubtract"],
      ["Meta+NumpadAdd", "Meta+NumpadSubtract"],
    ];
    for (const [zoomIn, zoomOut] of pairs) {
      await press(zoomIn, "handled", ONE_STEP_UP);
      await press(zoomOut, "handled", 100);
    }
    for (const zoomToActual of ["Meta+Digit0", "Control+Numpad0"]) {
      await press("Control+Equal", "handled", ONE_STEP_UP);
      await press(zoomToActual, "handled", 100);
    }
    for (const key of [
      "Equal",
      "Minus",
      "Shift+Equal",
      "Shift+Minus",
      "NumpadAdd",
      "NumpadSubtract",
    ]) {
      await press(key, "free", "unchanged", "on the canvas without Cmd/Ctrl");
    }
    for (const key of [
      "Digit0",
      "Control+Alt+Equal",
      "Control+Alt+Minus",
      "Control+Shift+Digit1",
    ]) {
      await press(key, undefined, "unchanged");
    }
    await press("F1", "free", undefined);
    await press("Escape", "free", undefined, "on the canvas without a menu or dialog");
    if (await inPage(page, canvasHandlesProbe, { root, key: "F9" })) {
      await press("F9", "canvas", undefined, "handled by the canvas");
    }
    await inPage(page, removeInjectedProbe, null);
    if (host === "ide") {
      // Guide §13.5: on the canvas, undo and redo use the document's history, never the canvas's.
      for (const key of UNDO_REDO_PRESSES) {
        await press(
          key,
          "free",
          undefined,
          "on the canvas (undo and redo belong to the VS Code document)",
        );
      }
    }
    // Guide §13.5: keys the canvas uses act on the canvas only, select all included; in VS Code an
    // unhandled Cmd/Ctrl+A would select the webview's text instead.
    for (const key of ["Control+KeyA", "Meta+KeyA"]) {
      await press(key, "canvas", undefined, "on the canvas (select all acts on the canvas only)");
    }

    await press("Control+Equal", "handled", ONE_STEP_UP);
    // Only Chromium has EditContext: elsewhere no editor can use it.
    const editContext = await inPage(page, editContextProbe, null);
    for (const [kind, field] of TEXT_FIELDS) {
      if (kind === "editcontext" && !editContext) continue;
      await inside(kind, field, async () => {
        await press("Control+Equal", "blocked", "unchanged", `in ${field}`);
        await press("Control+Minus", "blocked", "unchanged", `in ${field}`);
        await press("Shift+Digit1", "free", "unchanged", `in ${field}`);
        await press("Control+KeyZ", "blocked", undefined, `in ${field}`);
        await press("Meta+Shift+KeyZ", "blocked", undefined, `in ${field}`);
        await press("Control+KeyY", "blocked", undefined, `in ${field}`);
      });
    }
    await inside("modal", "a modal dialog", async () => {
      await press("Control+Equal", "blocked", "unchanged", "with a modal dialog open");
      await press("Shift+Digit1", "free", "unchanged", "with a modal dialog open");
      await press("Escape", "blocked", undefined, "with a modal dialog open");
    });
    await inside("popover", "a popover", async () => {
      await press("Control+Minus", "handled", 100, "in a popover");
      await press("Control+Equal", "handled", ONE_STEP_UP, "in a popover");
      await press("Escape", "blocked", undefined, "with a popover open");
    });
    // Guide §5.8 (design system 1.15.0): only a modal dialog blocks, by role or as a <dialog>.
    await inside("modal-dialog", "a showModal() <dialog>", async () => {
      await press("Control+Equal", "blocked", "unchanged", "with a showModal() <dialog> open");
    });
    await inside("dialog", "a non-modal <dialog>", async () => {
      await press("Control+Minus", "handled", 100, "in a non-modal <dialog>");
      await press("Control+Equal", "handled", ONE_STEP_UP, "in a non-modal <dialog>");
    });

    if (await openMenuByClick(page, root)) {
      await inPage(page, clearKeysProbe, null);
      await press("Escape", "handled", undefined, "with the menu open");
      if (await findOverlay(page, root, "menu"))
        problems.push("Escape with the menu open did not close it");
    }

    await focusTarget(page, root, "canvas");
    await press("Control+Equal", "handled", TWO_STEPS_UP);
    await page.keyboard.press("Shift+Digit1");
    let fitted = await inPage(page, afterPressProbe, { root });
    const reachProblem = keyReachProblem("Shift+Digit1 on the canvas", "handled", host, fitted);
    if (reachProblem) problems.push(reachProblem);
    for (let poll = 0; (fitted.zoom === null || fitted.zoom > 100) && poll < 20; poll++) {
      await page.waitForTimeout(50);
      fitted = await inPage(page, afterPressProbe, { root });
    }
    if (fitted.zoom === null || fitted.zoom > 100) {
      problems.push(
        `Shift+Digit1 on the canvas left the zoom at ${fitted.zoom ?? "?"}%, expected a fit (at most 100%)`,
      );
    }
    return finish("keys", host, problems, []);
  },
};

/** The zoom panel's controls, clicked in this order by the focusHandBack case. */
const ZOOM_CONTROLS: ReadonlyArray<readonly [ChromeTarget, string]> = [
  ["zoom-in", "zoom in"],
  ["zoom-out", "zoom out"],
  ["zoom-actual", "the zoom readout"],
  ["zoom-fit", "fit"],
];

/**
 * The first File or Model action of the menu that opens no dialog: a pointer click hands the focus
 * to the canvas, Enter returns it to the trigger (guide §5.4 with the exception of
 * Miragon/corporate-identity#36). `undefined` when the menu has none.
 */
async function menuActionSteps(
  page: PageLike,
  root: string,
): Promise<{ steps: FocusHandBackStep[]; problems: string[] } | undefined> {
  const entry = (await menuEntries(page, root)).find(isCanvasMenuAction);
  if (!entry?.menuId) return undefined;
  const control = `menu entry "${entry.name}"`;
  const item = `[role="menu"] [data-menu-id="${entry.menuId}"]`;
  const trigger = CHROME_TARGET_SELECTORS.menu;
  const steps: FocusHandBackStep[] = [];
  const problems: string[] = [];
  const point = (await openMenuByClick(page, root))
    ? await inPage(page, menuItemProbe, { root, menuId: entry.menuId })
    : null;
  if (point) {
    await page.mouse.click(point.x, point.y);
    await settle(page);
    steps.push({
      control,
      by: "pointer",
      focus: await inPage(page, focusPlaceProbe, { root, selector: trigger }),
      menuEntry: true,
    });
  } else {
    problems.push(`focus: no visible ${control} to click in the opened menu`);
  }
  if (await findOverlay(page, root, "menu")) await closeByEscape(page);
  if (
    (await openMenuByClick(page, root)) &&
    (await inPage(page, focusProbe, { root, selector: item }))
  ) {
    await page.keyboard.press("Enter");
    await settle(page);
    steps.push({
      control,
      by: "Enter",
      focus: await inPage(page, focusPlaceProbe, { root, selector: trigger }),
      menuEntry: true,
    });
  } else {
    problems.push(`focus: ${control} cannot take the focus in the opened menu`);
  }
  if (await findOverlay(page, root, "menu")) await closeByEscape(page);
  return { steps, problems };
}

/**
 * Guide §5.8: a pointer click on each zoom control, on a palette tool and on a File or Model action
 * without a dialog leaves the focus on the canvas `<svg>`; Enter and Space on zoom in leave it on the
 * button, Enter on the menu entry returns it to the trigger (§5.4). Each zoom control gets the focus
 * by script first, so a click that keeps it shows as "stays on the control" in every engine.
 */
const focusHandBackCase: ShellConformanceCase = {
  name: "focusHandBack",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const problems: string[] = [];
    const steps: FocusHandBackStep[] = [];
    const focusAfter = (selector: string) => inPage(page, focusPlaceProbe, { root, selector });

    for (const [target, control] of ZOOM_CONTROLS) {
      const button = await findTarget(page, root, target);
      if (!button || !(await focusTarget(page, root, target))) {
        problems.push(`focus: no visible ${control} button that takes the focus`);
        continue;
      }
      await page.mouse.click(button.client.x, button.client.y);
      await settle(page);
      steps.push({
        control,
        by: "pointer",
        focus: await focusAfter(CHROME_TARGET_SELECTORS[target]),
      });
    }

    const tools = (await inPage(page, paletteEntriesProbe, { root })).filter(
      (entry) => isToolEntry(entry) && !entry.disabled,
    );
    const tool = tools.find((entry) => entry.action === "lasso-tool") ?? tools[0];
    if (tool) {
      const selector = `[data-chrome="palette"] [data-action="${tool.action}"]`;
      await inPage(page, focusProbe, { root, selector });
      await page.mouse.click(tool.client.x, tool.client.y);
      await settle(page);
      steps.push({
        control: `palette tool "${tool.action}"`,
        by: "pointer",
        focus: await focusAfter(selector),
      });
      await closeByEscape(page);
    }

    for (const key of ["Enter", "Space"] as const) {
      if (!(await focusTarget(page, root, "zoom-in"))) break;
      await page.keyboard.press(key);
      await settle(page);
      steps.push({
        control: "zoom in",
        by: key,
        focus: await focusAfter(CHROME_TARGET_SELECTORS["zoom-in"]),
      });
    }

    const skipped: ShellSkip[] = [];
    const menuAction = await menuActionSteps(page, root);
    if (menuAction) {
      steps.push(...menuAction.steps);
      problems.push(...menuAction.problems);
    } else if (!harness.absent?.includes("canvasMenuAction")) {
      skipped.push({
        hook: "open",
        reason:
          'the menu has no File or Model action without a dialog: the focus after a click on a menu entry was not verified (absent: ["canvasMenuAction"] for a modeler without one)',
      });
    }
    await page.mouse.move(PARK.x, PARK.y);
    problems.push(...focusHandBackProblems(steps));
    return finish("focusHandBack", harness.host, problems, skipped);
  },
};

async function appearanceFacts(page: PageLike, root: string): Promise<AppearanceFacts | null> {
  const probe = () => inPage(page, appearanceProbe, { root, roles: MODE_ROLES });
  await hover(page, root, "zoom-in");
  const withTooltip = await probe();
  const opened = await openMenuByClick(page, root);
  const withMenu = await probe();
  if (opened) await closeByEscape(page);
  await page.mouse.move(PARK.x, PARK.y);
  if (!withTooltip || !withMenu) return withTooltip ?? withMenu;
  const names = new Set(withTooltip.parts.map((part) => part.name));
  return {
    ...withMenu,
    parts: [...withTooltip.parts, ...withMenu.parts.filter((part) => !names.has(part.name))],
  };
}

/** The palette's tool colours in the current state, read until a running colour transition is done. */
async function paletteColors(page: PageLike, root: string): Promise<string[]> {
  const read = async () => {
    const facts = await inPage(page, paletteColorProbe, { root });
    return facts ? paletteColorProblems(facts) : [];
  };
  return pollUntil(page, read, (problems) => problems.length === 0, COLOR_WAIT_MS);
}

/**
 * Guide §5.5: every tool entry at rest, hovered in turn, and the first tool armed by a click
 * (pressed and hovered, then pressed with the pointer away), Escape afterwards.
 */
async function paletteColorWalk(page: PageLike, root: string): Promise<string[]> {
  const problems: string[] = [];
  await page.mouse.move(PARK.x, PARK.y);
  problems.push(...(await paletteColors(page, root)));
  const tools = (await inPage(page, paletteEntriesProbe, { root })).filter(
    (entry) => isToolEntry(entry) && !entry.disabled,
  );
  for (const tool of tools) {
    await page.mouse.move(tool.client.x, tool.client.y);
    problems.push(...(await paletteColors(page, root)));
    await page.mouse.move(PARK.x, PARK.y);
  }
  const armed =
    tools.find((tool) => tool.action === "lasso-tool") ??
    tools.find((tool) => tool.action.endsWith("-tool"));
  if (armed) {
    await page.mouse.click(armed.client.x, armed.client.y);
    await settle(page);
    const pressed = (await inPage(page, paletteEntriesProbe, { root })).find(
      (entry) => entry.action === armed.action,
    );
    if (!pressed?.pressed) {
      problems.push(
        `palette: clicking tool "${armed.action}" does not set aria-pressed="true" (guide §5.5)`,
      );
    }
    problems.push(...(await paletteColors(page, root)));
    await page.mouse.move(PARK.x, PARK.y);
    problems.push(...(await paletteColors(page, root)));
    await closeByEscape(page);
  }
  return [...new Set(problems)];
}

/** The web app's mode, its meta tags and the stored choice. */
function webMode(page: PageLike): Promise<WebModeFacts> {
  return inPage(page, webModeProbe, { key: APPEARANCE_STORAGE_KEY });
}

const APPEARANCE_LABELS: Readonly<Record<AppearanceChoice, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Guide §13.3 for a dark-capable web app: Dark, Light, then System through the Appearance group,
 * each written to `<html>`, `color-scheme`, both `theme-color`s and `localStorage` in one frame and
 * never half-dark; the theme colours are the ones the page showed under System.
 */
async function appearanceSwitchProblems<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
  requested: Appearance,
): Promise<string[]> {
  const problems: string[] = [];
  const system = await webMode(page);
  const media = (scheme: string) =>
    system.themeColors.find(
      (meta) => meta.media?.replace(/\s+/g, "") === `(prefers-color-scheme:${scheme})`,
    )?.content;
  const light = media("light");
  const dark = media("dark");
  const colors = light && dark ? { light, dark } : undefined;
  for (const choice of ["dark", "light", "system"] as const) {
    const label = APPEARANCE_LABELS[choice];
    if (!(await openMenuByClick(page, root))) {
      problems.push(`menu: no visible menu trigger to choose ${label}`);
      break;
    }
    const option = await inPage(page, targetProbe, {
      root,
      selector: `[data-menu-id="appearance"] [data-menu-value="${choice}"]`,
    });
    if (!option) {
      problems.push(`menu: no Appearance option "${choice}" to choose (guide §13.3)`);
      await closeByEscape(page);
      break;
    }
    await inPage(page, watchModeProbe, null);
    await page.mouse.click(option.client.x, option.client.y);
    await settle(page);
    problems.push(...modeSwitchProblems(await inPage(page, modeChangesProbe, null), label));
    problems.push(
      ...appearanceChoiceProblems((await inPage(page, menuEntriesProbe, { root })) ?? [], choice),
    );
    await closeByEscape(page);
    problems.push(...webModeProblems(await webMode(page), harness.themes, choice, colors));
    const facts = await appearanceFacts(page, root);
    if (facts) {
      const expected = expectedWebMode(requested, harness.themes, choice);
      problems.push(
        ...appearanceProblems(facts, "web", requested, harness.themes, expected).problems.map(
          (problem) => `[chose ${label}] ${problem}`,
        ),
      );
    }
  }
  return problems;
}

const appearanceCase: ShellConformanceCase = {
  name: "appearance",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    const skipped: ShellSkip[] = [];
    const web = harness.host === "web";
    // Without emulateMedia the web app's system preference stays the browser's light default.
    const emulated = !web || page.emulateMedia !== undefined;
    if (!emulated) {
      skipped.push({
        hook: "open",
        reason:
          "page.emulateMedia is undefined: the web app's mode under a dark system and under high contrast was not verified",
      });
    }
    let switched = false;
    for (const requested of emulated ? REQUESTED_APPEARANCES : [LIGHT]) {
      const at = `[requested ${appearanceLabel(requested)}]`;
      await openHarness(page, harness, { size, requested });
      if (harness.host === "embedded") {
        // The foreign page itself in that mode: a themed page around the modeler (guide §13.3).
        await inPage(page, hostPageModeProbe, {
          theme: requested.theme,
          kontrast: requested.kontrast ?? null,
        });
      }
      await settle(page);
      const facts = await appearanceFacts(page, root);
      if (!facts) {
        problems.push(`${at} no element matches the shell root selector "${root}"`);
        continue;
      }
      const expected = web ? expectedWebMode(requested, harness.themes, "system") : undefined;
      const verdict = appearanceProblems(facts, harness.host, requested, harness.themes, expected);
      problems.push(...verdict.problems.map((problem) => `${at} ${problem}`));
      const surround = await inPage(page, surroundProbe, { root });
      if (surround)
        problems.push(...surroundProblems(surround).map((problem) => `${at} ${problem}`));
      problems.push(...(await paletteColorWalk(page, root)).map((problem) => `${at} ${problem}`));
      if (web) {
        problems.push(
          ...webModeProblems(await webMode(page), harness.themes, "system", undefined).map(
            (problem) => `${at} ${problem}`,
          ),
          ...lightOnlyMenuProblems(await menuEntries(page, root), harness.themes).map(
            (problem) => `${at} ${problem}`,
          ),
        );
        if (harness.themes.includes("dark") && !switched && requested.theme === "dark") {
          switched = true;
          problems.push(
            ...(await appearanceSwitchProblems(page, harness, root, requested)).map(
              (problem) => `${at} ${problem}`,
            ),
          );
        }
      }
    }
    return finish("appearance", harness.host, problems, skipped);
  },
};

/** Moves the palette's roving focus by keyboard to `action`; `false` when it cannot get there. */
async function focusPaletteEntry(page: PageLike, root: string, action: string): Promise<boolean> {
  const before = await inPage(page, paletteFocusProbe, { root });
  if (!before || !before.entries.includes(action)) return false;
  if (!(await focusTarget(page, root, "palette-tab-stop"))) return false;
  await page.keyboard.press("Home");
  for (let step = 0; step <= before.entries.length; step++) {
    if ((await inPage(page, paletteFocusProbe, { root }))?.active === action) return true;
    await page.keyboard.press("ArrowRight");
  }
  return false;
}

/** The first entry that creates something: outside the tools group and not a tool. */
function firstCreatingEntry(entries: readonly PaletteEntryState[]): PaletteEntryState | undefined {
  return entries.find((entry) => !isToolEntry(entry));
}

/** Enter on `entry`; the shapes once a new one appeared or `CREATE_WAIT_MS` passed. */
async function enterOnEntry(
  page: PageLike,
  root: string,
  entry: string,
  before: readonly ShapeFacts[],
): Promise<ShapeFacts[] | undefined> {
  if (!(await focusPaletteEntry(page, root, entry))) return undefined;
  await page.keyboard.press("Enter");
  await settle(page);
  const known = new Set(before.map((shape) => shape.id));
  return pollUntil(
    page,
    () => shapes(page, root),
    (after) => after.some((shape) => !known.has(shape.id)),
    CREATE_WAIT_MS,
  );
}

const createCase: ShellConformanceCase = {
  name: "create",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const entry = firstCreatingEntry(await inPage(page, paletteEntriesProbe, { root }));
    // A notation whose palette only switches tools has nothing to place.
    if (!entry) return undefined;
    await page.mouse.move(PARK.x, PARK.y);
    const free = freeRectangle(await measureChrome(page, root), harness.host);
    const before = await shapes(page, root);
    const after = await enterOnEntry(page, root, entry.action, before);
    if (!after) {
      fail("create", harness.host, [
        `create: the palette's roving focus does not reach "${entry.action}"`,
      ]);
    }
    const canvas = await inPage(page, canvasStateProbe, { root });
    const problems = createProblems({ entry: entry.action, before, after, canvas, free });
    await closeByEscape(page);
    return finish("create", harness.host, problems, []);
  },
};

/** A shape whose centre a pointer reaches (no chrome above it), found again by its id. */
async function reachableShape(
  page: PageLike,
  root: string,
  id?: string,
): Promise<ShapeFacts | undefined> {
  const all = await shapes(page, root);
  return id === undefined ? all.find((shape) => shape.hit) : all.find((shape) => shape.id === id);
}

/** Guide §13.5, "Was der Schreibschutz sperrt", on one shape: select, drag, double-click, delete. */
async function lockedShapeChecks(
  page: PageLike,
  root: string,
  shape: ShapeFacts,
): Promise<string[]> {
  await page.mouse.click(shape.client.x, shape.client.y);
  await settle(page);
  const selected = await inPage(page, canvasStateProbe, { root });

  const before = (await reachableShape(page, root, shape.id)) ?? shape;
  await page.mouse.move(before.client.x, before.client.y);
  await page.mouse.down();
  for (let step = 1; step <= 4; step++) {
    await page.mouse.move(before.client.x + (LOCKED_DRAG_PX * step) / 4, before.client.y);
  }
  await page.mouse.up();
  await settle(page);
  const dragged = await reachableShape(page, root, shape.id);

  const target = dragged ?? before;
  await page.mouse.dblclick(target.client.x, target.client.y);
  await settle(page);
  const { textFields } = await inPage(page, canvasStateProbe, { root });
  await closeByEscape(page);

  const kept = { Delete: true, Backspace: true };
  for (const key of ["Delete", "Backspace"] as const) {
    const current = await reachableShape(page, root, shape.id);
    if (!current) break;
    // a key that deletes the selection must not miss it; a click on a selected shape deselects it
    if (!current.selected) await page.mouse.click(current.client.x, current.client.y);
    await focusTarget(page, root, "canvas");
    await page.keyboard.press(key);
    await settle(page);
    kept[key] = (await reachableShape(page, root, shape.id)) !== undefined;
  }
  await page.mouse.move(PARK.x, PARK.y);
  return lockedShapeProblems({
    contextPadEntries: selected.contextPadEntries,
    dragged: { before, after: dragged },
    textFields,
    kept,
  });
}

const readOnlyCase: ShellConformanceCase = {
  name: "readOnly",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("readOnly", harness, ["invalid"]);
    const invalid = harness.show?.invalid;
    if (!invalid) {
      if (harness.absent?.includes("invalid")) return undefined;
      return {
        skipped: [
          {
            hook: "invalid",
            reason:
              "show.invalid is undefined: the read-only canvas of an invalid file was not verified",
          },
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    const skipped: ShellSkip[] = [];
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const menuBefore = await menuEntries(page, root);

    await invalid(page);
    await page.waitForTimeout(INVALID_STATUS_DELAY_MS);
    const state = await pollUntil(
      page,
      () => inPage(page, readOnlyStateProbe, { root }),
      (facts) => facts === null || readOnlyStateProblems(facts).length === 0,
      READ_ONLY_WAIT_MS,
    );
    if (!state)
      fail("readOnly", harness.host, [`no element matches the shell root selector "${root}"`]);
    await settle(page);
    problems.push(...readOnlyStateProblems(state));

    const entries = await inPage(page, paletteEntriesProbe, { root });
    problems.push(...readOnlyPaletteProblems(entries));
    problems.push(...(await paletteColors(page, root)));
    const creating = firstCreatingEntry(entries);
    if (creating) {
      const before = await shapes(page, root);
      const after = await enterOnEntry(page, root, creating.action, before);
      const known = new Set(before.map((shape) => shape.id));
      const added = (after ?? []).filter((shape) => !known.has(shape.id));
      if (added.length > 0) {
        problems.push(
          `read-only: Enter on palette entry "${creating.action}" added ${added.map((shape) => `"${shape.id}"`).join(", ")} (guide §13.5)`,
        );
      }
      await closeByEscape(page);
    }

    problems.push(...readOnlyMenuProblems(menuBefore, await menuEntries(page, root)));

    const shape = await reachableShape(page, root);
    if (shape) {
      problems.push(...(await lockedShapeChecks(page, root, shape)));
    } else {
      skipped.push({
        hook: "open",
        reason:
          "the opened document shows no shape a pointer reaches: context pad, move, delete and label editor of the read-only canvas not verified",
      });
    }
    return finish("readOnly", harness.host, problems, skipped);
  },
};

const cleanupCase: ShellConformanceCase = {
  name: "cleanup",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    if (!harness.destroy) {
      return {
        skipped: [
          {
            hook: "destroy",
            reason: "harness.destroy is undefined: the cleanup after destroy was not verified",
          },
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const armed = await inPage(page, armCleanupProbe, { root });
    if (!armed)
      fail("cleanup", harness.host, [`no element matches the shell root selector "${root}"`]);
    const problems: string[] = [];

    // A hover leaves the tooltip timer pending, so a timer that outlives destroy shows up below.
    const zoomIn = await findTarget(page, root, "zoom-in");
    if (zoomIn) {
      await page.mouse.move(PARK.x, PARK.y);
      await page.mouse.move(zoomIn.client.x, zoomIn.client.y);
    }
    try {
      await harness.destroy(page);
    } catch (error) {
      problems.push(`destroy threw: ${error instanceof Error ? error.message : String(error)}`);
    }
    await page.waitForTimeout(
      Math.max(INVALID_STATUS_DELAY_MS, TOOLTIP_DELAY_MS) + HOVER_MARGIN_MS,
    );
    await page.mouse.move(PARK.x, PARK.y);
    await page.setViewportSize({ width: size.width - 40, height: size.height - 40 });
    await settle(page);

    await inPage(page, injectProbe, { root, kind: "focus-target" });
    await inPage(page, clearKeysProbe, null);
    for (const key of ["Control+Equal", "Control+Minus", "Control+Digit0", "Shift+Digit1"]) {
      await page.keyboard.press(key);
      const { keys } = await inPage(page, afterPressProbe, { root });
      const problem = afterDestroyKeyProblem(key, keys);
      if (problem) problems.push(problem);
    }
    await inPage(page, removeInjectedProbe, null);
    problems.push(...leftoverProblems(await inPage(page, leftoverProbe, null), harness.host));
    return finish("cleanup", harness.host, problems, []);
  },
};

/**
 * The cases of every host: those of 0.1, extended for the web column, the focus hand-back of 0.2.2,
 * the legend's start state and the label editor of 0.4, reduced motion, forced colours and the
 * canvas's overlay layers, added after 0.5.0, and the production webview bundle under its CSP of 0.6
 * (which only the IDE host has).
 */
export function createBaseCases(): ShellConformanceCase[] {
  return [
    geometryCase,
    legendStartCase,
    ariaCase,
    keysCase,
    focusHandBackCase,
    createCase,
    labelEditorCase,
    readOnlyCase,
    appearanceCase,
    reducedMotionCase,
    forcedColorsCase,
    overlayLayersCase,
    cspCase,
    cleanupCase,
  ];
}

export function createCases(): ShellConformanceCase[] {
  return [...createBaseCases(), ...createWebCases()];
}
