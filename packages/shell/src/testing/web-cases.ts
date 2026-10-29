import {
  INVALID_STATUS_DELAY_MS,
  LEGAL_LINE_HEIGHT,
  TOAST_DURATION_MS,
  TOOLTIP_DELAY_MS,
  type ToastStatus,
} from "../core/index.js";
import {
  DEFAULT_SIZES,
  HOVER_MARGIN_MS,
  LIGHT,
  PARK,
  assertHooksConsistent,
  closeByEscape,
  finish,
  menuEntries,
  openHarness,
  openMenuByClick,
  pollUntil,
  unfed,
} from "./case-tools.js";
import { ariaProbe, menuProbe, type AriaFacts } from "./facts.js";
import {
  DEFAULT_ROOT,
  WORK_CHROME,
  boxMismatches,
  chromeExpectations,
  geometryProblems,
  measureChrome,
  webRowProblems,
  type ChromeMeasurement,
} from "./geometry.js";
import type {
  DropFixture,
  ShellCaseOutcome,
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellSkip,
  ToastFixture,
} from "./harness.js";
import type { PageLike } from "./page.js";
import {
  afterPressProbe,
  clearKeysProbe,
  documentLangProbe,
  findOverlay,
  findTarget,
  focusTarget,
  inPage,
  injectProbe,
  menuItemProbe,
  removeInjectedProbe,
  settle,
} from "./page-tools.js";
import {
  afterStartProblems,
  closedPopoverProblems,
  dropStateProblems,
  emptyStateKeyProblems,
  emptyStateProblems,
  emptyStateTabProblems,
  labelledWidth,
  legalContentProblems,
  legalReachProblems,
  legalWrapProblems,
  openPopoverProblems,
  popoverKeyboardProblems,
  primaryActivationProblems,
  primaryTooltipProblems,
  repeatedToastProblems,
  startScreenOpenProblems,
  toastAnatomyProblems,
  toastLiveRegion,
  toastStackProblems,
  toastLiftProbes,
  toastTimingProblems,
  toastWidthProblems,
  topRowProblems,
  zoomRowBottomProblems,
  zoomRowProbes,
  type ExpectedDrop,
  type PopoverKeyStep,
  type ToastTiming,
} from "./web-checks.js";
import {
  blurProbe,
  clicksProbe,
  countClicksProbe,
  dragProbe,
  emptyStateProbe,
  focusOwnerProbe,
  focusToastButtonProbe,
  legalLineProbe,
  popoverProbe,
  showModalProbe,
  toastStackTogglesProbe,
  toastsProbe,
  topRowProbe,
  viewportProbe,
  watchToastStackProbe,
  type DragSpec,
  type DropZoneFacts,
  type EmptyStateFacts,
  type PopoverFacts,
  type ToastsFacts,
  type TopRowFacts,
} from "./web-facts.js";

/** The width steps of the web app's top and bottom rows, from wide to narrow (guide §5.15). */
const WIDEST_STEP = 1280;
const NARROWEST_STEP = 400;
/** The narrowest container the legal line must still hold every link in (320 CSS px, WCAG 1.4.10). */
const PHONE_WIDTH = 320;
const STEP_PX = 24;

/** Room after a toast's lifetime for its 250ms exit and a frame on either side. */
const TOAST_MARGIN_MS = 900;

/** A toast's resumed time after hover or focus is at least this (API.md, Toasts). */
const TOAST_RESUME_MS = 1500;

/** How long a toast's text may take to reach its live region. */
const TOAST_ANNOUNCE_WAIT_MS = 1000;

/** Room for a modeler that reads a dropped file asynchronously before it opens it. */
const DROP_WAIT_MS = 2000;

/** Tab presses on the start screen: the card's two buttons, the legal links and the way out. */
const START_SCREEN_TABS = 10;

const TOAST_STATUSES: readonly ToastStatus[] = ["success", "info", "warning", "danger"];

function sizeOf<P extends PageLike>(harness: ShellConformanceHarness<P>) {
  return (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
}

function skipFor(hook: ShellSkip["hook"], what: string): ShellCaseOutcome {
  return {
    skipped: [
      {
        hook,
        reason: `${hook === "drop" ? "harness.drop" : `show.${hook}`} is undefined: ${what} not verified`,
      },
    ],
  };
}

async function aria(page: PageLike, root: string): Promise<AriaFacts | null> {
  return inPage(page, ariaProbe, { root });
}

// ---- webChrome ----

/** Steps the page from wide to narrow; at every width the top row's decision and the bottom row. */
async function rowSamples(
  page: PageLike,
  root: string,
  height: number,
): Promise<{ samples: TopRowFacts[]; measurements: ChromeMeasurement[] }> {
  const samples: TopRowFacts[] = [];
  const measurements: ChromeMeasurement[] = [];
  for (let width = WIDEST_STEP; width >= NARROWEST_STEP; width -= STEP_PX) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const sample = await inPage(page, topRowProbe, { root });
    if (sample) samples.push(sample);
    measurements.push(await measureChrome(page, root));
  }
  return { samples, measurements };
}

/** Hovers the primary action at `width`; the visible chrome tooltip's text, `null` without one. */
async function primaryTooltipAt(
  page: PageLike,
  root: string,
  width: number,
  height: number,
): Promise<string | null> {
  await page.setViewportSize({ width, height });
  await settle(page);
  const primary = await findTarget(page, root, "primary");
  if (!primary) return null;
  await page.mouse.move(PARK.x, PARK.y);
  await page.mouse.move(primary.client.x, primary.client.y);
  await page.waitForTimeout(TOOLTIP_DELAY_MS + HOVER_MARGIN_MS);
  await settle(page);
  const tooltip = await findOverlay(page, root, "tooltip");
  await page.mouse.move(PARK.x, PARK.y);
  return tooltip?.text ?? null;
}

/** A pointer click and Enter on the primary action, counted by a kit listener (guide §5.7). */
async function primaryActivation(page: PageLike, root: string): Promise<string[]> {
  const primary = await findTarget(page, root, "primary");
  if (!primary) return [];
  await inPage(page, countClicksProbe, { root, selector: '[data-chrome="primary"]' });
  await page.mouse.click(primary.client.x, primary.client.y);
  await settle(page);
  const pointer = await inPage(page, clicksProbe, null);
  if (!(await focusTarget(page, root, "primary"))) {
    await inPage(page, removeInjectedProbe, null);
    return ["primary: the primary action cannot take the focus"];
  }
  await page.keyboard.press("Enter");
  await settle(page);
  const enter = (await inPage(page, clicksProbe, null)) - pointer;
  await inPage(page, removeInjectedProbe, null);
  await page.mouse.move(PARK.x, PARK.y);
  return primaryActivationProblems({ pointer, enter });
}

/** Each File entry: a click closes the menu before its handler runs (guide §5.4). */
async function fileEntryProblems(page: PageLike, root: string): Promise<string[]> {
  const entries = (await menuEntries(page, root)).filter((entry) => entry.group === "file");
  const problems: string[] = [];
  for (const entry of entries) {
    if (!entry.menuId || !(await openMenuByClick(page, root))) continue;
    const item = await inPage(page, menuItemProbe, { root, menuId: entry.menuId });
    if (!item) {
      await closeByEscape(page);
      continue;
    }
    await page.mouse.click(item.x, item.y);
    await settle(page);
    const menu = await inPage(page, menuProbe, { root });
    if (menu?.menu || menu?.expanded === "true") {
      problems.push(
        `menu: File entry "${entry.name}" leaves the menu open; an action closes it first (guide §5.4)`,
      );
      await closeByEscape(page);
    }
    // A handler that opens an in-page dialog gets it closed again before the next entry.
    if (entry.name.endsWith("…")) await closeByEscape(page);
  }
  return problems;
}

/** Guide §13.5: File entries stay usable on a read-only canvas. */
async function lockedFileProblems<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
): Promise<string[]> {
  const invalid = harness.show?.invalid;
  if (!invalid) return [];
  await invalid(page);
  await page.waitForTimeout(INVALID_STATUS_DELAY_MS + HOVER_MARGIN_MS);
  return (await menuEntries(page, root))
    .filter((entry) => entry.group === "file" && entry.disabled)
    .map(
      (entry) =>
        `menu: File entry "${entry.name}" is aria-disabled on the read-only canvas (guide §13.5)`,
    );
}

/**
 * Guide §5.10 (design system 1.15.0): on a wrapped legal line everything stacked above it rises by
 * the line's height. Shows the pill and the legend where the harness can, then measures every
 * island at the current (narrowest) width.
 */
async function stackOnWrappedLine<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
): Promise<string[]> {
  const shown: string[] = [];
  for (const island of ["problems", "legend"] as const) {
    const show = harness.show?.[island];
    if (!show) continue;
    await show(page);
    shown.push(island === "problems" ? "the pill" : "the legend");
  }
  await settle(page);
  const measurement = await measureChrome(page, root);
  const lines = Math.round(
    (measurement.islands.legal?.height ?? LEGAL_LINE_HEIGHT) / LEGAL_LINE_HEIGHT,
  );
  const state = [
    `${Math.round(measurement.container.width)}px wide`,
    `a legal line of ${lines}`,
    ...shown,
  ];
  return geometryProblems(measurement, "web").map((problem) => `[${state.join(", ")}] ${problem}`);
}

const webChromeCase: ShellConformanceCase = {
  name: "webChrome",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const root = harness.root ?? DEFAULT_ROOT;
    const size = sizeOf(harness);
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const problems: string[] = [];
    if (harness.host !== "web") {
      const measurement = await measureChrome(page, root);
      for (const island of ["primary", "legal", "empty-state", "drop-zone"] as const) {
        if (measurement.islands[island]) {
          problems.push(
            `${island}: visible in the ${harness.host} host; it belongs to the web app (guide §5.2)`,
          );
        }
      }
      return finish("webChrome", harness.host, problems, []);
    }

    const facts = await aria(page, root);
    if (facts) problems.push(...legalContentProblems(facts.legalLinks));
    const name = (facts?.primary?.attributes["aria-label"] ?? "").trim();
    problems.push(...(await primaryActivation(page, root)));

    const { samples, measurements } = await rowSamples(page, root, size.height);
    const bottomRowProblems = (measurement: ChromeMeasurement) => [
      ...webRowProblems(measurement, "web").map(
        (problem) => `[${Math.round(measurement.container.width)}px wide] ${problem}`,
      ),
      ...zoomRowBottomProblems(
        measurement.islands.zoom,
        measurement.open.zoomRaised,
        measurement.container,
        measurement.islands.legal?.height,
      ),
    ];
    for (const measurement of measurements) problems.push(...bottomRowProblems(measurement));
    // The 24px steps can pass over the 8px limit of the raised zoom row; measure on both sides of it.
    const widest = measurements[0];
    if (widest) {
      const frame = WIDEST_STEP - widest.container.width;
      for (const probe of zoomRowProbes(widest)) {
        await page.setViewportSize({ width: probe.width + frame, height: size.height });
        await settle(page);
        problems.push(...bottomRowProblems(await measureChrome(page, root)));
      }
    }
    if (samples.some((sample) => sample.primary)) {
      const withLabel = labelledWidth(samples);
      if (withLabel === undefined) {
        problems.push(
          `primary: never shows its label between ${WIDEST_STEP}px and ${NARROWEST_STEP}px; it collapses only when the top row gets tight (guide §5.15)`,
        );
      } else {
        problems.push(...topRowProblems(samples, withLabel, name));
      }
      const collapsed = samples.find((sample) => sample.primary?.collapsed);
      const labelled = samples.find((sample) => sample.primary && !sample.primary.collapsed);
      for (const sample of [labelled, collapsed]) {
        if (!sample?.primary) continue;
        const width = sample.container.width;
        const tooltip = await primaryTooltipAt(page, root, width, size.height);
        problems.push(...primaryTooltipProblems(sample.primary.collapsed, tooltip, name, width));
      }
    }

    // The narrowest phone: the legal line wraps rather than cutting off Datenschutz.
    await page.setViewportSize({ width: PHONE_WIDTH, height: size.height });
    await settle(page);
    const legalLine = await inPage(page, legalLineProbe, { root });
    if (legalLine) problems.push(...legalReachProblems(legalLine), ...legalWrapProblems(legalLine));
    problems.push(...(await stackOnWrappedLine(page, harness, root)));

    await page.setViewportSize({ width: size.width, height: size.height });
    await settle(page);
    problems.push(...(await fileEntryProblems(page, root)));
    problems.push(...(await lockedFileProblems(page, harness, root)));
    return finish("webChrome", harness.host, [...new Set(problems)], []);
  },
};

// ---- emptyState ----

function startScreen(page: PageLike, root: string): Promise<EmptyStateFacts | null> {
  return inPage(page, emptyStateProbe, { root, work: WORK_CHROME });
}

/**
 * Closing a toast that holds the focus on the start screen hands the focus to the card; the canvas
 * and the menu trigger behind it cannot take it, and <body> would lose the user's place.
 */
async function toastFocusOnStartScreen<P extends PageLike>(
  page: P,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
): Promise<string[]> {
  const text = "Conformance: a toast on the start screen";
  await show(page, { status: "danger", text });
  await settle(page);
  const closeName = (await toasts(page, root))?.toasts
    .find((toast) => toast.text.includes(text))
    ?.buttons.at(-1)?.name;
  if (!closeName || !(await inPage(page, focusToastButtonProbe, { root, text, name: closeName })))
    return [];
  await page.keyboard.press("Enter");
  await settle(page);
  const focus = await inPage(page, focusOwnerProbe, { root });
  return focus.owner === "empty-state"
    ? []
    : [
        `empty-state: closing a focused toast on the start screen leaves the focus on ${focus.description}; it goes to the card's "New diagram" (WCAG 2.4.3)`,
      ];
}

const emptyStateCase: ShellConformanceCase = {
  name: "emptyState",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("emptyState", harness, ["emptyState"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = sizeOf(harness);
    const show = harness.show?.emptyState;
    if (harness.host !== "web") {
      await openHarness(page, harness, { size, requested: LIGHT });
      if (show) await show(page);
      await settle(page);
      const facts = await startScreen(page, root);
      const problems: string[] = [];
      if (facts?.card?.visible || facts?.shown) {
        problems.push(
          `empty-state: a start screen in the ${harness.host} host; it shows the empty-file hint instead (guide §13.5)`,
        );
      }
      return finish("emptyState", harness.host, problems, []);
    }
    if (!show) {
      return unfed(harness, "emptyState") ? skipFor("emptyState", "the start screen") : undefined;
    }

    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const lang = await inPage(page, documentLangProbe, null);
    // The start screen hides the menu, so Open… is read before it shows.
    const fileOpen = (await menuEntries(page, root)).find(
      (entry) => entry.group === "file" && entry.menuId === "open",
    );
    await show(page);
    await settle(page);
    // The link's underline is read at rest: hover and focus may add one of their own.
    await page.mouse.move(PARK.x, PARK.y);
    await inPage(page, blurProbe, null);
    await settle(page);
    const container = (await measureChrome(page, root)).container;
    const facts = await startScreen(page, root);
    if (!facts) return finish("emptyState", harness.host, [`no element matches "${root}"`], []);
    const problems = [
      ...emptyStateProblems(facts, container, lang),
      ...startScreenOpenProblems(facts, fileOpen, lang),
    ];

    await inPage(page, blurProbe, null);
    const stops: Array<{ owner: string; description: string }> = [];
    for (let press = 0; press < START_SCREEN_TABS; press++) {
      await page.keyboard.press("Tab");
      stops.push(await inPage(page, focusOwnerProbe, { root }));
    }
    problems.push(...emptyStateTabProblems(stops));

    await inPage(page, blurProbe, null);
    // Control+0 too: a low-vision user resets a stored page zoom with it (WCAG 1.4.4).
    for (const key of ["Control+Equal", "Control+Minus", "Control+Digit0", "Shift+Digit1"]) {
      await inPage(page, clearKeysProbe, null);
      const before = (await inPage(page, afterPressProbe, { root })).zoom;
      await page.keyboard.press(key);
      const after = await inPage(page, afterPressProbe, { root });
      problems.push(...emptyStateKeyProblems(key, before, after.zoom, after.keys));
    }

    const showToast = harness.show?.toast;
    if (showToast) problems.push(...(await toastFocusOnStartScreen(page, root, showToast)));

    const start = facts.buttons[0];
    if (start) {
      await page.mouse.click(start.client.x, start.client.y);
      await settle(page);
      const after = await pollUntil(
        page,
        () => startScreen(page, root),
        (state) => state === null || !state.shown,
        1000,
      );
      if (after)
        problems.push(...afterStartProblems(after, await inPage(page, focusOwnerProbe, { root })));
    }
    return finish("emptyState", harness.host, problems, []);
  },
};

// ---- toasts ----

function toasts(page: PageLike, root: string): Promise<ToastsFacts | null> {
  return inPage(page, toastsProbe, { root });
}

/**
 * Clicks the Close button of every visible toast, oldest first, and parks the pointer away from the
 * stack: a toast appearing under it would be hovered, which pauses and protects it.
 */
async function dismissAll(page: PageLike, root: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const close = (await toasts(page, root))?.toasts[0]?.buttons.at(-1);
    if (!close) break;
    await page.mouse.click(close.client.x, close.client.y);
    await settle(page);
  }
  await page.mouse.move(PARK.x, PARK.y);
}

/** Waits until `ms` after `since` (Node's clock), then reads which of `texts` are shown. */
async function presentAt(
  page: PageLike,
  root: string,
  since: number,
  ms: number,
  texts: readonly string[],
): Promise<Set<string>> {
  const wait = since + ms - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await settle(page);
  const shown = (await toasts(page, root))?.toasts ?? [];
  return new Set(texts.filter((text) => shown.some((toast) => toast.text.includes(text))));
}

async function toastAnatomy<P extends PageLike>(
  page: P,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
  lang: string,
): Promise<string[]> {
  const problems: string[] = [];
  // Read before any toast of the case: a region that only comes with its first text is too late.
  const before = (await toasts(page, root))?.live ?? [];
  for (const status of TOAST_STATUSES) {
    const text = `Conformance: a ${status} toast`;
    await show(page, { status, text });
    await settle(page);
    const shown = await toasts(page, root);
    const toast = shown?.toasts.find((candidate) => candidate.text.includes(text));
    if (!toast) {
      problems.push(`toasts: show.toast with a ${status} toast shows nothing`);
      continue;
    }
    if (shown?.stack) problems.push(...toastWidthProblems(toast, status, shown.stack.box.width));
    const persistent = toastLiveRegion(before, status) !== undefined;
    const reached = (facts: ToastsFacts | null): boolean =>
      toastLiveRegion(facts?.live ?? [], status)?.text.includes(text) ?? false;
    const announced =
      persistent &&
      reached(await pollUntil(page, () => toasts(page, root), reached, TOAST_ANNOUNCE_WAIT_MS));
    problems.push(...toastAnatomyProblems(toast, status, lang, { persistent, announced }));
    const close = toast.buttons.at(-1);
    if (close) {
      await page.mouse.click(close.client.x, close.client.y);
      await page.mouse.move(PARK.x, PARK.y);
      await settle(page);
      const still = (await toasts(page, root))?.toasts.some((candidate) =>
        candidate.text.includes(text),
      );
      if (still) problems.push(`toasts: Close does not close the ${status} toast`);
    }
  }
  await dismissAll(page, root);
  return problems;
}

async function toastStack<P extends PageLike>(
  page: P,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
): Promise<string[]> {
  const texts = ["A", "B", "C", "D"].map((letter) => `Conformance: stacked ${letter}`);
  const [first, second, third, fourth] = texts as [string, string, string, string];
  await show(page, { status: "info", text: first, actionLabel: "Undo" });
  for (const text of [second, third, fourth]) await show(page, { status: "success", text });
  await settle(page);
  const problems = toastStackProblems((await toasts(page, root))?.toasts ?? [], texts, [
    first,
    third,
    fourth,
  ]);
  await show(page, { status: "success", text: third });
  await settle(page);
  problems.push(...repeatedToastProblems((await toasts(page, root))?.toasts ?? [], third));
  await dismissAll(page, root);
  return problems;
}

async function toastTiming<P extends PageLike>(
  page: P,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
): Promise<string[]> {
  const lifetime = TOAST_DURATION_MS.success;
  const plain = "Conformance: a plain toast";
  const hovered = "Conformance: a hovered toast";
  const focused = "Conformance: a focused toast";
  const texts = [plain, hovered, focused];
  for (const text of texts) await show(page, { status: "success", text });
  const shownAt = Date.now();
  await settle(page);
  const target = (await toasts(page, root))?.toasts.find((toast) => toast.text.includes(hovered));
  if (target) await page.mouse.move(target.client.x, target.client.y);
  const focusTarget = (await toasts(page, root))?.toasts.find((toast) =>
    toast.text.includes(focused),
  );
  const closeName = focusTarget?.buttons.at(-1)?.name ?? "";
  await inPage(page, focusToastButtonProbe, { root, text: focused, name: closeName });

  const timings: ToastTiming[] = [];
  const record = (
    shown: Set<string>,
    after: number,
    expect: Array<[string, ToastTiming["expectation"], ToastTiming["condition"]]>,
  ) => {
    for (const [text, expectation, condition] of expect) {
      timings.push({ text, expectation, after, present: shown.has(text), condition });
    }
  };
  const early = lifetime - 800;
  record(await presentAt(page, root, shownAt, early, texts), early, [[plain, "present", "plain"]]);
  const late = lifetime + TOAST_MARGIN_MS;
  record(await presentAt(page, root, shownAt, late, texts), late, [
    [plain, "gone", "plain"],
    [hovered, "present", "hovered"],
    [focused, "present", "focused"],
  ]);

  await page.mouse.move(PARK.x, PARK.y);
  await inPage(page, blurProbe, null);
  const leftAt = Date.now();
  const resumed = TOAST_RESUME_MS - 500;
  record(await presentAt(page, root, leftAt, resumed, texts), resumed, [
    [hovered, "present", "resumed"],
    [focused, "present", "resumed"],
  ]);
  const gone = lifetime + TOAST_MARGIN_MS;
  record(await presentAt(page, root, leftAt, gone, texts), gone, [
    [hovered, "gone", "resumed"],
    [focused, "gone", "resumed"],
  ]);

  const action = "Conformance: a toast with an action";
  await show(page, { status: "info", text: action, actionLabel: "Undo" });
  const actionAt = Date.now();
  const actionWait = TOAST_DURATION_MS.info + TOAST_MARGIN_MS;
  record(await presentAt(page, root, actionAt, actionWait, [action]), actionWait, [
    [action, "present", "action"],
  ]);
  await dismissAll(page, root);
  return toastTimingProblems(timings);
}

/**
 * Web host: a toast shown while a `showModal()` dialog is open stays above it (API.md, Toasts): the
 * stack, already shown for an earlier toast, is shown again in the top layer, above the dialog.
 * A modal dialog makes everything outside it inert, so the kit reads the popover's toggles instead
 * of hit-testing the toast.
 */
async function toastAboveModal<P extends PageLike>(
  page: P,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
): Promise<string[]> {
  const before = "Conformance: a toast before the dialog";
  const text = "Conformance: a toast above the dialog";
  await show(page, { status: "info", text: before, actionLabel: "Undo" });
  await settle(page);
  const problems: string[] = [];
  if ((await toasts(page, root))?.stack?.popover !== "manual") {
    problems.push(
      'toasts: the web app\'s stack is no popover="manual"; it stays above a showModal() dialog only in the top layer (API.md, Toasts)',
    );
  } else if (await inPage(page, watchToastStackProbe, { root })) {
    if (await inPage(page, showModalProbe, null)) {
      await show(page, { status: "success", text });
      await settle(page);
      const shown =
        (await toasts(page, root))?.toasts.some((toast) => toast.text.includes(text)) ?? false;
      const { toggles, open } = await inPage(page, toastStackTogglesProbe, { root });
      if (!shown) problems.push("toasts: show.toast with a showModal() dialog open shows nothing");
      else if (!open || toggles.at(-1) !== "open") {
        problems.push(
          "toasts: a toast shown with a showModal() dialog open does not raise the stack above it; the stack is shown again with every toast (API.md, Toasts)",
        );
      }
    }
  }
  await inPage(page, removeInjectedProbe, null);
  await settle(page);
  await dismissAll(page, root);
  return problems;
}

/**
 * Guide §8 (design system 1.15.0): the stack rises only where the centred column of its widest card
 * would come closer than 8px to the zoom panel, the legal line or the pill. Measured with a toast
 * that stays, at the two widths of `toastLiftProbes`.
 */
async function toastLift<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
  show: (page: P, toast: ToastFixture) => Promise<void>,
): Promise<string[]> {
  await show(page, { status: "info", text: "Conformance: the stack's lift", actionLabel: "Undo" });
  await settle(page);
  const measured = await measureChrome(page, root);
  const viewport = await inPage(page, viewportProbe, null);
  const frameWidth = viewport.width - measured.container.width;
  const problems: string[] = [];
  for (const probe of toastLiftProbes(measured)) {
    await page.setViewportSize({ width: probe.width + frameWidth, height: viewport.height });
    await settle(page);
    const measurement = await measureChrome(page, root);
    const stack = measurement.islands.toasts;
    const bottom = chromeExpectations(measurement, harness.host).boxes.toasts?.bottom;
    if (!stack || bottom === undefined) continue;
    problems.push(
      ...boxMismatches("toasts", stack, { bottom }, measurement.container).map(
        (problem) =>
          `[${Math.round(measurement.container.width)}px wide, the widest card ${probe.distance}px beside the bottom row] ${problem}`,
      ),
    );
  }
  await page.setViewportSize(viewport);
  await settle(page);
  await dismissAll(page, root);
  return problems;
}

const toastsCase: ShellConformanceCase = {
  name: "toasts",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("toasts", harness, ["toast"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = sizeOf(harness);
    const show = harness.show?.toast;
    if (harness.host !== "web") {
      const host = harness.host === "ide" ? "IDE" : "embedded";
      const owner =
        harness.host === "ide"
          ? "the extension shows the host's notification (guide §13.5)"
          : "the embedding host shows its own feedback (guide §5.2, §9)";
      await openHarness(page, harness, { size, requested: LIGHT });
      if (show)
        await show(page, { status: "success", text: `Conformance: a toast in the ${host} host` });
      await settle(page);
      const facts = await toasts(page, root);
      const problems: string[] = [];
      if (facts?.stack) {
        problems.push(
          `toasts: the ${host} host renders a toast stack [data-chrome="toasts"]; it shows no toasts, ${owner}`,
        );
      }
      if ((facts?.toasts.length ?? 0) > 0 || (facts?.strays.length ?? 0) > 0) {
        problems.push(`toasts: show.toast shows a toast in the ${host} host; ${owner}`);
      }
      return finish("toasts", harness.host, problems, []);
    }
    if (!show) return unfed(harness, "toast") ? skipFor("toast", "the toasts") : undefined;

    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const lang = await inPage(page, documentLangProbe, null);
    await dismissAll(page, root);
    const problems = [
      ...(await toastAnatomy(page, root, show, lang)),
      ...(await toastStack(page, root, show)),
      ...(await toastTiming(page, root, show)),
      ...(await toastLift(page, harness, root, show)),
      ...(await toastAboveModal(page, root, show)),
    ];
    return finish("toasts", harness.host, problems, []);
  },
};

// ---- problemsList ----

function popover(page: PageLike, root: string): Promise<PopoverFacts | null> {
  return inPage(page, popoverProbe, { root });
}

async function clickPill(page: PageLike, root: string): Promise<PopoverFacts | null> {
  const pill = (await popover(page, root))?.pill;
  if (!pill?.visible) return null;
  await page.mouse.click(pill.client.x, pill.client.y);
  await settle(page);
  return popover(page, root);
}

/**
 * Opens the list from the pill with Enter, then walks it with ArrowDown to the last row and jumps
 * back with Home and to the end with End; every step must land on its row, inside the list.
 */
async function keyboardRows(page: PageLike, root: string): Promise<string[]> {
  if (!(await focusTarget(page, root, "pill"))) return ["problems: the pill cannot take the focus"];
  await page.keyboard.press("Enter");
  await settle(page);
  const opened = await popover(page, root);
  const count = opened?.rows.length ?? 0;
  if (!opened?.popover?.visible || count === 0) {
    await closeByEscape(page);
    return opened?.popover?.visible
      ? []
      : ["problems-popover: Enter on the pill does not open the list"];
  }
  const steps: PopoverKeyStep[] = [
    { key: "Enter on the pill", expected: 0, focused: opened.focusedRow },
  ];
  for (let index = 1; index < count; index++) {
    await page.keyboard.press("ArrowDown");
    steps.push({
      key: "ArrowDown",
      expected: index,
      focused: (await popover(page, root))?.focusedRow ?? null,
    });
  }
  if (count > 1) {
    await page.keyboard.press("Home");
    steps.push({
      key: "Home",
      expected: 0,
      focused: (await popover(page, root))?.focusedRow ?? null,
    });
    await page.keyboard.press("End");
    steps.push({
      key: "End",
      expected: count - 1,
      focused: (await popover(page, root))?.focusedRow ?? null,
    });
  }
  await closeByEscape(page);
  return popoverKeyboardProblems(steps, count);
}

const problemsListCase: ShellConformanceCase = {
  name: "problemsList",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("problemsList", harness, ["problems"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = sizeOf(harness);
    const show = harness.show?.problems;
    if (!show)
      return unfed(harness, "problems") ? skipFor("problems", "the problems list") : undefined;
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    await show(page);
    await settle(page);
    const before = await popover(page, root);
    const problems: string[] = [];
    if (!before?.pill?.visible) {
      return finish(
        "problemsList",
        harness.host,
        ["problems: the pill is not visible after show.problems"],
        [],
      );
    }
    const opensList =
      harness.host === "web" || before.pill.attributes["aria-haspopup"] === "dialog";
    if (!opensList) {
      const after = await clickPill(page, root);
      if (after?.popover?.visible) {
        problems.push(
          `problems-popover: the ${harness.host} host shows a problems list; its pill opens the host's own view (guide §5.10)`,
        );
      }
      return finish("problemsList", harness.host, problems, []);
    }
    const lang = await inPage(page, documentLangProbe, null);
    const container = (await measureChrome(page, root)).container;
    const opened = await clickPill(page, root);
    if (!opened)
      return finish("problemsList", harness.host, ["problems: the pill cannot be clicked"], []);
    problems.push(...openPopoverProblems(opened, container, lang));

    await closeByEscape(page);
    const escaped = await popover(page, root);
    if (escaped) problems.push(...closedPopoverProblems(escaped, "Escape"));

    await clickPill(page, root);
    await page.mouse.click(PARK.x, PARK.y);
    await settle(page);
    const outside = await popover(page, root);
    if (outside) problems.push(...closedPopoverProblems(outside, "an outside click"));

    problems.push(...(await keyboardRows(page, root)));

    const skipped: ShellSkip[] = [];
    const reopened = await clickPill(page, root);
    const row = reopened?.rows.find((candidate) => candidate.button);
    if (row) {
      await page.mouse.click(row.client.x, row.client.y);
      await settle(page);
      const selected = await popover(page, root);
      if (selected) problems.push(...closedPopoverProblems(selected, "a row with an element"));
    } else {
      await closeByEscape(page);
      if ((reopened?.rows.length ?? 0) > 0 && !harness.absent?.includes("problemSelection")) {
        skipped.push({
          hook: "problems",
          reason:
            'show.problems gives no item with an elementId: a row that selects its element was not verified (absent: ["problemSelection"] for a modeler whose problems never point at an element)',
        });
      }
    }
    return finish("problemsList", harness.host, problems, skipped);
  },
};

// ---- dropZone ----

function drag(page: PageLike, spec: DragSpec): Promise<DropZoneFacts | null> {
  return inPage(page, dragProbe, spec);
}

/** A file the drop zone forbids as the second of two. */
function secondFile(file: DropFixture): DropFixture {
  return { ...file, name: `second-${file.name}` };
}

const dropZoneCase: ShellConformanceCase = {
  name: "dropZone",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("dropZone", harness, ["drop", "emptyState"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = sizeOf(harness);
    const fixtures = harness.drop;
    if (harness.host === "web" && !fixtures) {
      return harness.absent?.includes("drop") ? undefined : skipFor("drop", "the drop zone");
    }
    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    const problems: string[] = [];
    const probeFile: DropFixture = {
      name: "conformance.txt",
      type: "text/plain",
      text: "conformance",
    };

    if (harness.host !== "web" || !fixtures) {
      const facts = await drag(page, {
        root,
        files: [probeFile],
        steps: ["dragenter", "dragover"],
      });
      if (facts && (facts.state !== null || facts.zone?.visible)) {
        problems.push(
          `drop-zone: a file drag shows a drop zone in the ${harness.host} host; its files belong to the host (guide §5.2)`,
        );
      }
      await drag(page, { root, files: [probeFile], steps: ["dragleave"] });
      return finish("dropZone", harness.host, problems, []);
    }

    const container = (await measureChrome(page, root)).container;
    const { accepted, rejected } = fixtures;
    const check = async (
      files: readonly DropFixture[],
      strings: readonly string[],
      expected: ExpectedDrop,
      context: string,
    ) => {
      const over = await drag(page, { root, files, strings, steps: ["dragenter", "dragover"] });
      if (over) problems.push(...dropStateProblems(over, expected, context, container));
      const left = await drag(page, { root, files, strings, steps: ["dragleave"] });
      if (left && expected !== "none") {
        problems.push(
          ...dropStateProblems(left, "none", `${context}, once it left the page,`, container),
        );
      }
    };
    await check([accepted], [], "over", `a drag of "${accepted.name}"`);
    await check(
      [accepted, secondFile(accepted)],
      [],
      fixtures.multiple ? "over" : "forbidden",
      fixtures.multiple ? "a drag of two files (multiple)" : "a drag of two files",
    );
    if (await inPage(page, injectProbe, { root, kind: "modal" })) {
      await check([accepted], [], "forbidden", "a file drag with a modal dialog open");
    }
    await inPage(page, removeInjectedProbe, null);
    await check([], ["Conformance text"], "none", "a text drag");

    const emptyState = harness.show?.emptyState;
    if (emptyState) {
      await emptyState(page);
      await settle(page);
    }
    const onStartScreen = async () =>
      (await inPage(page, emptyStateProbe, { root, work: [] }))?.shown ?? false;
    const started = await onStartScreen();
    if (rejected) {
      await drag(page, { root, files: [rejected], steps: ["dragenter", "dragover", "drop"] });
      const shown = await pollUntil(
        page,
        () => toasts(page, root),
        (facts) => facts?.toasts.some((toast) => toast.status === "danger") ?? false,
        DROP_WAIT_MS,
      );
      if (!shown?.toasts.some((toast) => toast.status === "danger")) {
        problems.push(
          `drop-zone: dropping "${rejected.name}" shows no danger toast (guide §9, or the modeler's onReject)`,
        );
      }
      if (started && !(await onStartScreen())) {
        problems.push(
          `drop-zone: dropping "${rejected.name}" opened it; a file outside accept opens nothing`,
        );
      }
      await dismissAll(page, root);
    }
    const dropped = await drag(page, {
      root,
      files: [accepted],
      steps: ["dragenter", "dragover", "drop"],
    });
    if (dropped?.events.find((event) => event.type === "drop")?.defaultPrevented === false) {
      problems.push(
        `drop-zone: the drop of "${accepted.name}" is not prevented, so the browser would open the file`,
      );
    }
    if (started) {
      const opened = await pollUntil(page, onStartScreen, (shown) => !shown, DROP_WAIT_MS);
      if (opened)
        problems.push(
          `drop-zone: dropping "${accepted.name}" on the start screen does not open it (the card stays)`,
        );
    }
    const after = await drag(page, { root, files: [], steps: [] });
    if (after && (after.state !== null || after.zone?.visible)) {
      problems.push("drop-zone: the drop zone still shows after the drop");
    }
    return finish("dropZone", harness.host, problems, []);
  },
};

/**
 * The web column's cases (0.2), in this order after the 0.1 cases of `createCases`: `webChrome`
 * (primary action, legal line, raised zoom row, File entries), `emptyState`, `toasts`,
 * `problemsList` and `dropZone`. Each runs in every host; outside the hosts it applies to it
 * asserts that nothing of it shows (API.md, `./testing`).
 */
export function createWebCases(): ShellConformanceCase[] {
  return [webChromeCase, emptyStateCase, toastsCase, problemsListCase, dropZoneCase];
}
