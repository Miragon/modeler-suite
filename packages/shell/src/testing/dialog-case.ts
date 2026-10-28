import type { Appearance, ShortcutGroup } from "../core/index.js";
import { DEFAULT_SIZES, LIGHT, PARK, finish, hover, openHarness, pollUntil } from "./case-tools.js";
import {
  CHROME_ROW_ORDER,
  closedProblems,
  dialogRingProblems,
  forcedDialogProblems,
  shortcutsDialogProblems,
  trapProblems,
  type ChromeTooltip,
} from "./dialog-checks.js";
import {
  dialogFocusProbe,
  shellDialogProbe,
  tooltipPartsProbe,
  type ShellDialogFacts,
} from "./dialog-facts.js";
import { DEFAULT_ROOT } from "./geometry.js";
import type {
  ShellConformanceCase,
  ShellConformanceHarness,
  ShellSkip,
  ShortcutsDialogHooks,
} from "./harness.js";
import { focusRingProblems } from "./media-checks.js";
import { focusRingProbe, forcedColorsProbe } from "./media-facts.js";
import type { PageLike } from "./page.js";
import {
  afterPressProbe,
  focusTarget,
  hostPageModeProbe,
  inPage,
  settle,
  type ChromeTarget,
} from "./page-tools.js";

/** Room for the dialog to show after the hook resolved (a page that opens it a frame later). */
const DIALOG_WAIT_MS = 500;

/** The kit's groups for a page that cannot hand the hook the modeler's own. */
export const SHORTCUTS_FIXTURE: readonly ShortcutGroup[] = [
  { title: "View", rows: [{ action: "Move the canvas", keys: ["⌘←", "⌘→", "⌘↑", "⌘↓"] }] },
  {
    title: "Edit",
    rows: [
      { action: "Undo", keys: ["⌘Z"] },
      { action: "Redo", keys: ["⌘⇧Z"] },
      { action: "Delete", keys: ["Del", "Backspace"] },
    ],
  },
  {
    title: "Tools",
    rows: [
      { action: "Lasso", keys: ["L"] },
      { action: "Hand", keys: ["H"] },
    ],
  },
];

const HIGH_CONTRAST: Appearance = { theme: "light", kontrast: "hoch" };

const ZOOM_TARGETS: Readonly<Record<(typeof CHROME_ROW_ORDER)[number], ChromeTarget>> = {
  zoomIn: "zoom-in",
  zoomOut: "zoom-out",
  zoomToActual: "zoom-actual",
  fit: "zoom-fit",
};

/** What the zoom panel's tooltips show, which the View rows repeat. */
async function chromeTooltips(page: PageLike, root: string): Promise<ChromeTooltip[]> {
  const tooltips: ChromeTooltip[] = [];
  for (const key of CHROME_ROW_ORDER) {
    if (!(await hover(page, root, ZOOM_TARGETS[key]))) continue;
    const parts = await inPage(page, tooltipPartsProbe, { root });
    if (parts) tooltips.push({ key, ...parts });
  }
  await page.mouse.move(PARK.x, PARK.y);
  return tooltips;
}

interface Scope {
  root: string;
  wholeDocument: boolean;
}

/** The menu trigger takes the focus, as the Help entry leaves it, then the hook shows the dialog. */
async function showFromTrigger<P extends PageLike>(
  page: P,
  hooks: ShortcutsDialogHooks<P>,
  scope: Scope,
): Promise<ShellDialogFacts> {
  await focusTarget(page, scope.root, "menu");
  await hooks.show(page, SHORTCUTS_FIXTURE);
  await settle(page);
  return pollUntil(
    page,
    () => inPage(page, shellDialogProbe, scope),
    (facts) => facts.open > 0,
    DIALOG_WAIT_MS,
  );
}

async function focusFacts(page: PageLike, scope: Scope) {
  await settle(page);
  return inPage(page, dialogFocusProbe, scope);
}

/** Tab and Shift+Tab, one more time each than the dialog has stops: the focus stays inside. */
async function trapWalk(page: PageLike, scope: Scope, stops: number): Promise<string[]> {
  const problems: string[] = [];
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let press = 1; press <= stops + 1; press++) {
      await page.keyboard.press(key);
      const found = trapProblems(`${key} × ${press}`, await focusFacts(page, scope));
      if (found.length > 0) {
        problems.push(...found);
        return problems;
      }
    }
  }
  return problems;
}

/** Guide §5.8: the zoom keys do nothing while a modal dialog is open. */
async function zoomKeyProblems(page: PageLike, root: string): Promise<string[]> {
  const before = (await inPage(page, afterPressProbe, { root })).zoom;
  await page.keyboard.press("Control+Equal");
  const after = (await inPage(page, afterPressProbe, { root })).zoom;
  if (before === after) return [];
  return [
    `shortcuts dialog: Control+Equal zoomed from ${before}% to ${after}% behind the open modal dialog; the zoom keys do not act while it shows (guide §5.8)`,
  ];
}

/**
 * Opens `shell.showShortcutsDialog` through the harness's hook from the menu trigger and checks
 * guide §5.1, §5.4, §5.6, §5.8, §8 and §12: a modal `<dialog>` in the top layer, named by its
 * 21px/600 title, never larger than the window minus 32px, centred over the part of its container
 * that shows while it fits there with 16px around it and else in the window, the panel, backdrop (`grayscale(1)`), header, body and Close
 * of §8, one labelled table per group with the tooltip's chips, the chrome's zoom and fit keys
 * first in the View group as their tooltips show them and nowhere twice; the focus inside on open,
 * kept there by Tab and Shift+Tab, its ring in `--cd-ui-fokus`; the zoom keys blocked; Escape,
 * Close and a click on the backdrop close it and return the focus to the menu trigger. Then the
 * same dialog in high contrast (no shadow, `--cd-ui-kontur`, a 3px ring) and under forced colours
 * (CanvasText border, Highlight ring).
 */
export const shortcutsDialogCase: ShellConformanceCase = {
  name: "shortcutsDialog",
  async run<P extends PageLike>(page: P, harness: ShellConformanceHarness<P>) {
    const hooks = harness.shortcutsDialog;
    if (!hooks) {
      return {
        skipped: [
          {
            hook: "shortcutsDialog",
            reason:
              "harness.shortcutsDialog is undefined: the shell's dialog and its keyboard shortcuts were not verified",
          },
        ],
      };
    }
    const root = harness.root ?? DEFAULT_ROOT;
    const scope: Scope = { root, wholeDocument: harness.host !== "embedded" };
    const size = (harness.sizes ?? DEFAULT_SIZES)[0] ?? DEFAULT_SIZES[0]!;
    const problems: string[] = [];
    const skipped: ShellSkip[] = [];

    await openHarness(page, harness, { size, requested: LIGHT });
    await settle(page);
    await page.mouse.move(PARK.x, PARK.y);
    const tooltips = await chromeTooltips(page, root);
    if (tooltips.length < CHROME_ROW_ORDER.length) {
      problems.push(
        `shortcuts dialog: only ${tooltips.length} of the zoom panel's four tooltips showed on hover, so not every View row was compared with its tooltip`,
      );
    }

    const shown = await showFromTrigger(page, hooks, scope);
    problems.push(...shortcutsDialogProblems(shown, { tooltips, highContrast: false }));
    if (shown.dialog) {
      const { roles, tabStops } = shown.dialog;
      problems.push(...(await trapWalk(page, scope, tabStops)));
      problems.push(...dialogRingProblems(await focusFacts(page, scope), roles.fokus, false));
      problems.push(...(await zoomKeyProblems(page, root)));
      await page.keyboard.press("Escape");
      problems.push(...closedProblems("Escape", await focusFacts(page, scope)));

      const again = await showFromTrigger(page, hooks, scope);
      if (again.dialog?.close) {
        await page.mouse.click(again.dialog.close.client.x, again.dialog.close.client.y);
        problems.push(...closedProblems("a click on Close", await focusFacts(page, scope)));
      }

      const third = await showFromTrigger(page, hooks, scope);
      if (third.dialog) {
        const { box } = third.dialog;
        // Above the panel, in the backdrop's band of at least 16px around it (guide §8).
        await page.mouse.click(box.left + box.width / 2, Math.max(2, box.top / 2));
        problems.push(...closedProblems("a click on the backdrop", await focusFacts(page, scope)));
      }
    }

    await openHarness(page, harness, { size, requested: HIGH_CONTRAST });
    if (harness.host === "embedded") {
      await inPage(page, hostPageModeProbe, { theme: "light", kontrast: "hoch" });
    }
    await settle(page);
    const contrast = await showFromTrigger(page, hooks, scope);
    problems.push(
      ...shortcutsDialogProblems(contrast, { tooltips, highContrast: true }).map(
        (problem) => `[high contrast] ${problem}`,
      ),
    );
    if (contrast.dialog) {
      await page.keyboard.press("Tab");
      problems.push(
        ...dialogRingProblems(await focusFacts(page, scope), contrast.dialog.roles.fokus, true).map(
          (problem) => `[high contrast] ${problem}`,
        ),
      );
      await page.keyboard.press("Escape");
    }

    const emulateMedia = page.emulateMedia?.bind(page);
    if (!emulateMedia) {
      skipped.push({
        hook: "open",
        reason:
          "page.emulateMedia is undefined: the shortcuts dialog under forced colours was not verified",
      });
    } else {
      await emulateMedia({ forcedColors: "active" });
      try {
        await openHarness(page, harness, { size, requested: LIGHT });
        await settle(page);
        const forced = await showFromTrigger(page, hooks, scope);
        const system = (await inPage(page, forcedColorsProbe, { root }))?.system;
        if (system) {
          problems.push(...forcedDialogProblems(forced, system));
          if (forced.dialog) {
            await page.keyboard.press("Tab");
            await settle(page);
            problems.push(
              ...focusRingProblems(
                await inPage(page, focusRingProbe, { root }),
                system,
                "Tab in the shortcuts dialog",
              ),
            );
            await page.keyboard.press("Escape");
          }
        }
      } finally {
        await emulateMedia({ forcedColors: null });
      }
    }
    return finish("shortcutsDialog", harness.host, problems, skipped);
  },
};
