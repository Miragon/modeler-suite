import { FIT_ANIMATION_MS, type ShellHost } from "../core/index.js";
import {
  DEFAULT_SIZES,
  LIGHT,
  PARK,
  SHOWN_ISLANDS,
  assertHooksConsistent,
  closeByEscape,
  fail,
  finish,
  hover,
  missingHooks,
  openHarness,
  openMenuByClick,
  pollUntil,
  shapes,
} from "./case-tools.js";
import { isToolEntry } from "./checks.js";
import { menuEntriesProbe, paletteEntriesProbe, zoomButtonsProbe } from "./facts.js";
import { DEFAULT_ROOT } from "./geometry.js";
import type {
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellSkip,
  ToastFixture,
} from "./harness.js";
import {
  MOTION_THRESHOLD_MS,
  dialogBorderProblems,
  fitJumpProblems,
  focusRingProblems,
  forcedColorsProblems,
  pressedToolProblems,
  reducedMotionProblems,
} from "./media-checks.js";
import {
  dialogPanelsProbe,
  focusRingProbe,
  forcedColorsProbe,
  hostReduceMotionProbe,
  motionStylesProbe,
  motionWatchProbe,
  viewWatchProbe,
  watchMotionProbe,
  watchViewProbe,
  type ForcedColorsFacts,
  type MotionScope,
} from "./media-facts.js";
import type { PageLike } from "./page.js";
import {
  CHROME_TARGET_SELECTORS,
  focusTarget,
  inPage,
  menuItemProbe,
  scriptedClickProbe,
  settle,
} from "./page-tools.js";

/** Room after a click on Fit for its 250ms glide to show, and a frame or two on either side. */
const FIT_WATCH_MS = FIT_ANIMATION_MS + 250;

/** Room for a dialog a menu entry opens to show up (a modeler that builds it a frame later). */
const DIALOG_WAIT_MS = 500;

/** Shown by the `reducedMotion` case, so the toast's slide-in is part of the walk. */
const MOTION_TOAST: ToastFixture = { status: "info", text: "Conformance: a toast without motion" };

/** The steps of the walk under reduced motion, each with what it leaves open for the probes. */
interface MotionStep {
  state: string;
  act(): Promise<unknown>;
  /** Closes what `act` opened, after the probes ran. */
  after?(): Promise<unknown>;
}

/**
 * One walk under reduced motion: for each step, the transitions and animations its computed styles
 * set and the animations that ran while it happened; then the jump of an explicit fit.
 * `prepare` runs before every step (VS Code's body class, put back after a navigation).
 */
async function motionWalk<P extends PageLike>(
  page: P,
  harness: ShellConformanceHarness<P>,
  root: string,
  prepare: () => Promise<unknown>,
): Promise<{ problems: string[]; skipped: ShellSkip[] }> {
  const scope: MotionScope = {
    root,
    wholeDocument: harness.host !== "embedded",
    thresholdMs: MOTION_THRESHOLD_MS,
  };
  const problems: string[] = [];
  const skipped: ShellSkip[] = [];
  // A style that sets motion is reported in the first state that shows it, not in every later one.
  const styledBefore = new Set<string>();
  const run = async (step: MotionStep): Promise<void> => {
    await prepare();
    await inPage(page, watchMotionProbe, scope);
    await step.act();
    await settle(page);
    const styled = await inPage(page, motionStylesProbe, scope);
    if (!styled)
      fail("reducedMotion", harness.host, [`no element matches the shell root selector "${root}"`]);
    const unseen = styled.filter((record) => {
      const key = `${record.description} ${record.kind} ${record.name}`;
      return !styledBefore.has(key) && styledBefore.add(key);
    });
    problems.push(
      ...reducedMotionProblems(step.state, unseen, await inPage(page, motionWatchProbe, null)),
    );
    await step.after?.();
  };

  await settle(page);
  await page.mouse.move(PARK.x, PARK.y);
  await run({ state: "as opened", act: async () => undefined });
  await run({
    state: "with the menu open",
    act: () => openMenuByClick(page, root),
    after: () => closeByEscape(page),
  });
  await run({
    state: "with a chrome tooltip",
    act: () => hover(page, root, "zoom-in"),
    after: () => page.mouse.move(PARK.x, PARK.y),
  });
  const shape = (await shapes(page, root)).find((candidate) => candidate.hit);
  if (shape) {
    await run({
      state: `with "${shape.id}" selected`,
      async act() {
        await page.mouse.click(shape.client.x, shape.client.y);
        await page.mouse.move(PARK.x, PARK.y);
      },
    });
  } else {
    skipped.push({
      hook: "open",
      reason:
        "the opened document shows no shape a pointer reaches: the motion of a selection was not verified",
    });
  }
  for (const island of SHOWN_ISLANDS) {
    const show = harness.show?.[island];
    if (show) await run({ state: `after show.${island}`, act: () => show(page) });
  }
  const toast = harness.host === "web" ? harness.show?.toast : undefined;
  if (toast) await run({ state: "with a toast", act: () => toast(page, MOTION_TOAST) });

  await prepare();
  const buttons = await inPage(page, zoomButtonsProbe, { root });
  if (!buttons.in || !buttons.fit) {
    problems.push(
      "fit: no zoom in or Fit control, so whether an explicit fit jumps was not verified",
    );
    return { problems, skipped };
  }
  const click = (target: "zoom-in" | "zoom-fit") =>
    inPage(page, scriptedClickProbe, { root, selector: CHROME_TARGET_SELECTORS[target] });
  await click("zoom-in");
  await click("zoom-in");
  await settle(page);
  const fit = (await inPage(page, zoomButtonsProbe, { root })).fit;
  if (fit?.attributes["aria-disabled"] === "true") {
    skipped.push({
      hook: "open",
      reason:
        "Fit is aria-disabled on the opened document: whether an explicit fit jumps was not verified",
    });
    return { problems, skipped };
  }
  await run({
    state: "while Fit jumps",
    async act() {
      await inPage(page, watchViewProbe, { root });
      await click("zoom-fit");
      await page.waitForTimeout(FIT_WATCH_MS);
      problems.push(...fitJumpProblems(await inPage(page, viewWatchProbe, null)));
    },
  });
  return { problems, skipped };
}

/**
 * Guide §5.14 and §7: under `prefers-reduced-motion: reduce` (every host, through
 * `page.emulateMedia`) and under VS Code's reduce motion (`ide`, its body class) nothing moves, and
 * an explicit fit jumps (§5.9).
 */
export const reducedMotionCase: ShellConformanceCase = {
  name: "reducedMotion",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("reducedMotion", harness, [...SHOWN_ISLANDS, "toast"]);
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    const skipped: ShellSkip[] = [...missingHooks(harness, "the motion")];
    const walk = async (label: string, prepare: () => Promise<unknown>) => {
      const result = await motionWalk(page, harness, root, prepare);
      problems.push(...result.problems.map((problem) => `[${label}] ${problem}`));
      skipped.push(...result.skipped);
    };
    const emulateMedia = page.emulateMedia?.bind(page);
    if (emulateMedia) {
      await emulateMedia({ reducedMotion: "reduce" });
      try {
        await openHarness(page, harness, { size, requested: LIGHT });
        await walk("prefers-reduced-motion", async () => undefined);
      } finally {
        await emulateMedia({ reducedMotion: null });
      }
    } else {
      skipped.push({
        hook: "open",
        reason:
          "page.emulateMedia is undefined: the modeler under prefers-reduced-motion was not verified",
      });
    }
    if (harness.host === "ide") {
      await openHarness(page, harness, { size, requested: LIGHT });
      try {
        await walk("VS Code's reduce motion", () => inPage(page, hostReduceMotionProbe, true));
      } finally {
        // Only a closed page fails here, and it has no body class left to take back.
        await inPage(page, hostReduceMotionProbe, false).catch(() => undefined);
      }
    }
    return finish("reducedMotion", harness.host, problems, skipped);
  },
};

async function forcedFacts(
  page: PageLike,
  root: string,
  host: ShellHost,
): Promise<ForcedColorsFacts> {
  const facts = await inPage(page, forcedColorsProbe, { root });
  if (!facts) fail("forcedColors", host, [`no element matches the shell root selector "${root}"`]);
  return facts;
}

/**
 * The open dropdown's border, then each dialog entry of the menu outside the File group (whose
 * Open… asks the browser for a file) clicked: the border of the dialog it shows, if one shows in the
 * page (a host's own dialog does not).
 */
async function menuAndDialogBorders(
  page: PageLike,
  root: string,
  host: ShellHost,
  system: ForcedColorsFacts["system"],
): Promise<{ menu: string[]; dialogs: string[] }> {
  if (!(await openMenuByClick(page, root)))
    return { menu: ["menu: no visible menu trigger to open it"], dialogs: [] };
  const menu = forcedColorsProblems(await forcedFacts(page, root, host));
  const dialogs: string[] = [];
  const entries = ((await inPage(page, menuEntriesProbe, { root })) ?? []).filter(
    (entry) =>
      entry.popup === "dialog" && !entry.disabled && entry.group !== "file" && entry.menuId,
  );
  await closeByEscape(page);
  let previous: string | undefined;
  for (const [index, entry] of entries.entries()) {
    const after = previous === undefined ? "" : ` after the dialog of "${previous}"`;
    const opened =
      (await openMenuByClick(page, root)) &&
      (await inPage(page, menuEntriesProbe, { root })) !== null;
    if (!opened) {
      const unchecked = entries.slice(index).map((rest) => `"${rest.name}"`);
      const what =
        unchecked.length === 1
          ? `the border of the dialog of ${unchecked[0]} was`
          : `the borders of the dialogs of ${unchecked.join(", ")} were`;
      dialogs.push(`forced colours: the menu did not open again${after}, so ${what} not verified`);
      break;
    }
    const item = await inPage(page, menuItemProbe, { root, menuId: entry.menuId! });
    if (!item) {
      dialogs.push(
        `forced colours: the open menu no longer shows "${entry.name}"${after}, so the border of its dialog was not verified`,
      );
      await closeByEscape(page);
      continue;
    }
    previous = entry.name;
    await page.mouse.click(item.x, item.y);
    await settle(page);
    const panels = await pollUntil(
      page,
      () => inPage(page, dialogPanelsProbe, { root, wholeDocument: host !== "embedded" }),
      (found) => found.length > 0,
      DIALOG_WAIT_MS,
    );
    dialogs.push(...dialogBorderProblems(entry.name, panels, system));
    await closeByEscape(page);
  }
  return { menu, dialogs };
}

/**
 * Guide §5.14 and §12 under `forced-colors: active` (every host, through `page.emulateMedia`):
 * islands, the open dropdown and the modeler's dialogs keep their border in CanvasText, the
 * pressed tool its 2px inset ring in Highlight, the keyboard focus its ring in Highlight, the
 * status box its bar in CanvasText, the tools' icons their CanvasText.
 */
export const forcedColorsCase: ShellConformanceCase = {
  name: "forcedColors",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    assertHooksConsistent("forcedColors", harness, SHOWN_ISLANDS);
    const emulateMedia = page.emulateMedia?.bind(page);
    if (!emulateMedia) {
      return {
        skipped: [
          {
            hook: "open",
            reason:
              "page.emulateMedia is undefined: the modeler under forced colours was not verified",
          },
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    // A part that loses its border is reported in the first state that shows it, not in every later one.
    const reported = new Set<string>();
    const report = (state: string, found: readonly string[]) => {
      for (const problem of found)
        if (!reported.has(problem) && reported.add(problem)) problems.push(`[${state}] ${problem}`);
    };
    await emulateMedia({ forcedColors: "active" });
    try {
      await openHarness(page, harness, { size, requested: LIGHT });
      await settle(page);
      await page.mouse.move(PARK.x, PARK.y);
      const opened = await forcedFacts(page, root, harness.host);
      const { system } = opened;
      report("as opened", forcedColorsProblems(opened));

      const tools = (await inPage(page, paletteEntriesProbe, { root })).filter(
        (entry) => isToolEntry(entry) && !entry.disabled,
      );
      const tool = tools.find((entry) => entry.action === "lasso-tool") ?? tools[0];
      if (tool) {
        await page.mouse.click(tool.client.x, tool.client.y);
        await settle(page);
        await page.mouse.move(PARK.x, PARK.y);
        const pressed = (await forcedFacts(page, root, harness.host)).entries.find(
          (entry) => entry.action === tool.action,
        );
        if (pressed?.pressed) problems.push(...pressedToolProblems(pressed, system));
        else
          problems.push(
            `palette: clicking tool "${tool.action}" does not set aria-pressed="true" (guide §5.5)`,
          );
        await closeByEscape(page);
      }

      if (await focusTarget(page, root, "zoom-out")) {
        await page.keyboard.press("Tab");
        problems.push(
          ...focusRingProblems(
            await inPage(page, focusRingProbe, { root }),
            system,
            "Tab from zoom out",
          ),
        );
      }

      const { menu, dialogs } = await menuAndDialogBorders(page, root, harness.host, system);
      report("with the menu open", menu);
      problems.push(...dialogs);

      for (const island of SHOWN_ISLANDS) {
        const show = harness.show?.[island];
        if (!show) continue;
        await show(page);
        await settle(page);
        report(
          `after show.${island}`,
          forcedColorsProblems(await forcedFacts(page, root, harness.host)),
        );
      }
    } finally {
      await emulateMedia({ forcedColors: null });
    }
    return finish(
      "forcedColors",
      harness.host,
      problems,
      missingHooks(harness, "the forced colours"),
    );
  },
};
