import type { ChromeKey } from "../core/index.js";
import type { DialogFocusFacts, ShellDialogFacts } from "./dialog-facts.js";
import type { BorderSideFacts, SystemColorFacts } from "./media-facts.js";

/*
 * The judgements of the `shortcutsDialog` case (guide §5.4, §5.6, §8, §5.14), unit-tested in Node.
 */

/** What the zoom panel's tooltip of `key` shows, which the dialog's View row repeats. */
export interface ChromeTooltip {
  key: ChromeKey;
  label: string;
  shortcut: string;
}

/** The zoom panel's order, the order of the View group's chrome rows (guide §5.8). */
export const CHROME_ROW_ORDER: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

const SIDES = ["top", "right", "bottom", "left"] as const;

const within = (actual: number, expected: number, tolerance = 1) =>
  Math.abs(actual - expected) <= tolerance;

const transparent = (color: string) =>
  color === "transparent" || /^rgba\([^)]*,\s*0\)$/.test(color) || /\/\s*0\)$/.test(color);

function sideText(side: BorderSideFacts): string {
  return `${side.width}px ${side.style} ${side.color}`;
}

/** Guide §8: the dialog itself, its panel, header, Close and backdrop, in normal or high contrast. */
function lookProblems(
  dialog: NonNullable<ShellDialogFacts["dialog"]>,
  highContrast: boolean,
): string[] {
  const problems: string[] = [];
  const { roles, viewport, box } = dialog;
  const at = `shortcuts dialog (${dialog.description})`;
  if (!dialog.modal) {
    problems.push(
      `${at}: not modal; it opens with showModal(), in the top layer above every island, with the page behind it inert (guide §5.13, §8)`,
    );
  }
  if (!dialog.name || dialog.name.text === "") {
    problems.push(`${at}: aria-labelledby names no title, so the dialog has no accessible name`);
  }
  if (dialog.title && (dialog.title.fontSize !== "21px" || dialog.title.fontWeight !== "600")) {
    problems.push(
      `${at}: the title is ${dialog.title.fontSize}/${dialog.title.fontWeight}, expected 21px/600 (guide §8, h3)`,
    );
  }
  if (dialog.background !== roles.flaecheHoch) {
    problems.push(
      `${at}: the panel is ${dialog.background}, expected --cd-ui-flaeche-hoch (${roles.flaecheHoch}) (guide §8)`,
    );
  }
  const borderColor = highContrast ? roles.kontur : roles.linie;
  const borderRole = highContrast ? "--cd-ui-kontur" : "--cd-ui-linie";
  const wrongSides = SIDES.filter((name) => {
    const side = dialog.border[name];
    return side.width !== 1 || side.style !== "solid" || side.color !== borderColor;
  });
  if (wrongSides.length > 0) {
    problems.push(
      `${at}: the ${wrongSides.join(", ")} border is ${sideText(dialog.border[wrongSides[0]!])}, expected 1px solid ${borderRole} (${borderColor}) (guide §8${highContrast ? ", §6 high contrast" : ""})`,
    );
  }
  if (dialog.radius !== roles.radiusMd) {
    problems.push(`${at}: radius ${dialog.radius}, expected --cd-radius-md (${roles.radiusMd})`);
  }
  const shadow = highContrast ? "none" : roles.shadow3;
  if (dialog.boxShadow !== shadow) {
    problems.push(
      highContrast
        ? `${at}: shadow ${dialog.boxShadow} in high contrast, expected none (guide §6)`
        : `${at}: shadow ${dialog.boxShadow}, expected --cd-shadow-3 (${roles.shadow3}) (guide §8)`,
    );
  }
  const width = Math.min(560, viewport.width - 32);
  if (!within(box.width, width)) {
    problems.push(
      `${at}: ${box.width}px wide in a ${viewport.width}px window, expected min(560px, 100% - 32px) = ${width}px (guide §8)`,
    );
  }
  if (box.height > viewport.height - 32 + 1) {
    problems.push(
      `${at}: ${box.height}px high in a ${viewport.height}px window, expected at most 100% - 32px, the body scrolling (guide §8)`,
    );
  }
  if (!within(box.left, (viewport.width - box.width) / 2)) {
    problems.push(`${at}: not centred in the window (left ${box.left}px)`);
  }
  if (dialog.backdrop.background !== roles.backdrop) {
    problems.push(
      `${at}: the backdrop is ${dialog.backdrop.background}, expected --cd-ui-backdrop (${roles.backdrop}) (guide §8)`,
    );
  }
  if (
    !/grayscale\(1\)/.test(dialog.backdrop.filter) ||
    !/blur\(3px\)/.test(dialog.backdrop.filter)
  ) {
    problems.push(
      `${at}: the backdrop filters "${dialog.backdrop.filter}", expected blur(3px) grayscale(1) in both modes, so nothing under it turns navy (guide §8)`,
    );
  }
  if (dialog.headerPadding !== "16px 16px 8px 24px") {
    problems.push(
      `${at}: the header's padding is ${dialog.headerPadding ?? "missing"}, expected 16px 16px 8px 24px (guide §8)`,
    );
  }
  if (dialog.bodyPadding !== "8px 24px 24px") {
    problems.push(
      `${at}: the body's padding is ${dialog.bodyPadding ?? "missing"}, expected 8px 24px 24px (guide §8)`,
    );
  }
  const { close } = dialog;
  if (!close) {
    problems.push(`${at}: no Close button in the header (guide §8)`);
  } else {
    if (close.name === "") problems.push(`${at}: Close has no accessible name ("Close")`);
    if (!within(close.width, 32) || !within(close.height, 32)) {
      problems.push(
        `${at}: Close is ${close.width} × ${close.height}, expected 32 × 32 (guide §8)`,
      );
    }
    if (!close.icon || !within(close.icon.width, 16) || !within(close.icon.height, 16)) {
      problems.push(`${at}: Close shows no 16px icon (Lucide x, guide §8, §5.14)`);
    }
    if (!transparent(close.background)) {
      problems.push(`${at}: Close is filled ${close.background} at rest, expected a ghost button`);
    }
  }
  return problems;
}

/** Guide §5.4 and §5.6: one labelled table per group, the keys as the chrome tooltip's chips. */
function tableProblems(dialog: NonNullable<ShellDialogFacts["dialog"]>): string[] {
  const problems: string[] = [];
  if (dialog.groups.length === 0) {
    problems.push("shortcuts dialog: no table of shortcuts (guide §5.4: one table per group)");
  }
  for (const group of dialog.groups) {
    const at = `shortcuts dialog, group "${group.heading}"`;
    if (group.heading === "") problems.push("shortcuts dialog: a group without a heading");
    if (!group.labelled) problems.push(`${at}: the table is not labelled by the group's heading`);
    if (group.rows.length === 0) problems.push(`${at}: an empty table`);
    for (const row of group.rows) {
      if (row.action === "" || !row.rowHeader) {
        problems.push(`${at}: the row "${row.action}" has no <th scope="row"> naming its action`);
      }
      if (row.keys.length === 0) problems.push(`${at}: the row "${row.action}" shows no key chip`);
    }
  }
  const { roles } = dialog;
  const chipProblem = dialog.chips
    .map((chip) => {
      const found: string[] = [];
      if (!/^"?Geist Mono/.test(chip.fontFamily)) found.push(`font ${chip.fontFamily}`);
      if (chip.fontSize !== "13px" || chip.fontWeight !== "400") {
        found.push(`${chip.fontSize}/${chip.fontWeight}`);
      }
      if (chip.color !== roles.textLeise) found.push(`text ${chip.color}`);
      if (chip.background !== roles.grund) found.push(`fill ${chip.background}`);
      if (
        chip.border.width !== 1 ||
        chip.border.style !== "solid" ||
        chip.border.color !== roles.linie
      ) {
        found.push(`border ${sideText(chip.border)}`);
      }
      if (chip.radius !== roles.radiusSm) found.push(`radius ${chip.radius}`);
      if (chip.padding !== "1px 6px") found.push(`padding ${chip.padding}`);
      if (chip.boxShadow !== "none") found.push(`shadow ${chip.boxShadow}`);
      return found.length > 0 ? `the chip "${chip.text}" has ${found.join(", ")}` : undefined;
    })
    .find((problem) => problem !== undefined);
  if (chipProblem) {
    problems.push(
      `shortcuts dialog: ${chipProblem}; a chip is the tooltip's: Geist Mono 13px/400, --cd-ui-text-leise (${roles.textLeise}) on --cd-ui-grund (${roles.grund}), 1px --cd-ui-linie, --cd-radius-sm, padding 1px 6px, no shadow (guide §5.6)`,
    );
  }
  return problems;
}

/**
 * Guide §5.4 and §5.8: the View group holds the chrome's zoom and fit keys first, in the zoom
 * panel's order and as its tooltips name and chip them, each once in the whole dialog.
 */
export function viewRowProblems(
  dialog: NonNullable<ShellDialogFacts["dialog"]>,
  tooltips: readonly ChromeTooltip[],
): string[] {
  const problems: string[] = [];
  const view = dialog.groups.find((group) => group.rows.some((row) => row.chromeKey !== null));
  if (!view) {
    return [
      "shortcuts dialog: no group holds the chrome's zoom and fit keys; the shell fills the View group with them (guide §5.4)",
    ];
  }
  const chromeRows = dialog.groups.flatMap((group) =>
    group.rows.filter((row) => row.chromeKey !== null).map((row) => ({ group, row })),
  );
  const keys = chromeRows.map(({ row }) => row.chromeKey);
  if (
    keys.join() !== CHROME_ROW_ORDER.join() ||
    chromeRows.some(({ group }) => group !== view) ||
    view.rows.slice(0, CHROME_ROW_ORDER.length).some((row) => row.chromeKey === null)
  ) {
    problems.push(
      `shortcuts dialog: the chrome's rows are ${keys.join(", ")}, expected ${CHROME_ROW_ORDER.join(", ")} at the top of the View group "${view.heading}"`,
    );
  }
  for (const tooltip of tooltips) {
    const row = view.rows.find((candidate) => candidate.chromeKey === tooltip.key);
    if (!row) continue;
    if (row.action !== tooltip.label || row.keys.join(" ") !== tooltip.shortcut) {
      problems.push(
        `shortcuts dialog: the View row of ${tooltip.key} says "${row.action}" with ${row.keys.map((key) => `"${key}"`).join(", ")}, but its tooltip says "${tooltip.label}" with "${tooltip.shortcut}" (guide §5.4, §5.6)`,
      );
    }
  }
  const chromeActions = new Set(chromeRows.map(({ row }) => row.action));
  for (const group of dialog.groups) {
    for (const row of group.rows) {
      if (row.chromeKey === null && chromeActions.has(row.action)) {
        problems.push(
          `shortcuts dialog: "${row.action}" shows twice, as the chrome's row and as a row of group "${group.heading}"`,
        );
      }
    }
  }
  return problems;
}

/** The dialog as shown right after `shortcutsDialog.show`, with the focus inside it. */
export function shortcutsDialogProblems(
  facts: ShellDialogFacts,
  options: { tooltips: readonly ChromeTooltip[]; highContrast: boolean },
): string[] {
  if (facts.open === 0 || !facts.dialog) {
    return [
      "shortcuts dialog: shortcutsDialog.show opened no dialog.cd-shell-dialog (shell.showShortcutsDialog)",
    ];
  }
  const problems: string[] = [];
  if (facts.open > 1) problems.push(`shortcuts dialog: ${facts.open} dialogs open, expected one`);
  if (!facts.focus.inDialog) {
    problems.push(
      `shortcuts dialog: after it opened the focus is on ${facts.focus.description}, outside the dialog (guide §8)`,
    );
  }
  problems.push(...lookProblems(facts.dialog, options.highContrast));
  if (!options.highContrast) {
    problems.push(
      ...tableProblems(facts.dialog),
      ...viewRowProblems(facts.dialog, options.tooltips),
    );
  }
  return problems;
}

/** Guide §8: Tab and Shift+Tab never take the focus out of the open dialog. */
export function trapProblems(step: string, facts: DialogFocusFacts): string[] {
  if (!facts.open) return [`shortcuts dialog: ${step} closed the dialog`];
  if (facts.inDialog) return [];
  return [
    `shortcuts dialog: after ${step} the focus is on ${facts.description}, outside the dialog; a modal dialog keeps it (guide §8, §12)`,
  ];
}

/** Guide §8 and §5.14: the keyboard focus inside shows a solid ring in --cd-ui-fokus, 2px or 3px in high contrast. */
export function dialogRingProblems(
  facts: DialogFocusFacts,
  fokus: string,
  highContrast: boolean,
): string[] {
  const width = highContrast ? 3 : 2;
  const { outline } = facts;
  if (outline.style === "solid" && outline.width === width && outline.color === fokus) return [];
  return [
    `shortcuts dialog: the focus ring of ${facts.description} is ${outline.style} ${outline.width}px in ${outline.color}, expected solid ${width}px in --cd-ui-fokus (${fokus}) (guide §8${highContrast ? ", 3px in high contrast" : ""})`,
  ];
}

/** Guide §8 and §12: Escape, Close and the backdrop close it, and the focus goes back where it was. */
export function closedProblems(how: string, facts: DialogFocusFacts): string[] {
  if (facts.open) return [`shortcuts dialog: ${how} does not close it (guide §8)`];
  if (facts.onMenuTrigger) return [];
  return [
    `shortcuts dialog: after ${how} the focus is on ${facts.description}, expected back on the menu trigger, which had it before (guide §8, §12)`,
  ];
}

/** Guide §5.3 and §5.14: under forced colours the panel keeps its border, in CanvasText. */
export function forcedDialogProblems(facts: ShellDialogFacts, system: SystemColorFacts): string[] {
  const { dialog } = facts;
  if (!dialog) return ["forced colours: shortcutsDialog.show opened no dialog.cd-shell-dialog"];
  const wrong = SIDES.filter((name) => {
    const side = dialog.border[name];
    return (
      side.width < 1 || ["none", "hidden"].includes(side.style) || side.color !== system.canvasText
    );
  });
  if (wrong.length === 0) return [];
  return [
    `forced colours: the shortcuts dialog (${dialog.description}) has its ${wrong.join(", ")} border as ${sideText(dialog.border[wrong[0]!])}, expected CanvasText (${system.canvasText}) (guide §5.3, §5.14)`,
  ];
}
