import { createChromeDialog, element, type ChromeDialog, type DialogChrome } from "./dialog.js";
import {
  contextMapShortcuts,
  type ContextMapShortcutOptions,
  type ShortcutGroup,
  type ShortcutsChrome,
} from "./shortcuts.js";

const DIALOG_CLASS = "cm-shortcuts";
const TITLE_ID = "cm-shortcuts-title";

/**
 * What the dialog needs of the chrome around the map; a `@miragon/modeler-shell` handle fits.
 *
 * @deprecated With `createShortcutsDialog`; removal due in 0.9.0 (issue 261 of Miragon/modeler-suite).
 */
export interface ShortcutsDialogChrome extends ShortcutsChrome, DialogChrome {
  readonly messages: ShortcutsChrome["messages"] & DialogChrome["messages"];
}

/** @deprecated With `createShortcutsDialog`; removal due in 0.9.0 (issue 261 of Miragon/modeler-suite). */
export type ShortcutsDialog = ChromeDialog;

function shortcutTable(group: ShortcutGroup, index: number): HTMLElement {
  const section = element("section", `${DIALOG_CLASS}-group`);
  const headingId = `${TITLE_ID}-group-${index}`;
  const heading = element("h4", `${DIALOG_CLASS}-group-title`, group.title);
  heading.id = headingId;
  const table = element("table", `${DIALOG_CLASS}-table`);
  table.setAttribute("aria-labelledby", headingId);
  const body = table.createTBody();
  for (const row of group.rows) {
    const line = body.insertRow();
    const action = element("th", `${DIALOG_CLASS}-action`, row.action);
    action.scope = "row";
    const keys = element("td", `${DIALOG_CLASS}-keys`);
    for (const key of row.keys) keys.append(element("kbd", `${DIALOG_CLASS}-key`, key));
    line.append(action, keys);
  }
  section.append(heading, table);
  return section;
}

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8): one table per group, the
 * keys as chips like the chrome tooltip's.
 *
 * @deprecated Show `contextMapShortcuts(chrome, options)` with `shell.showShortcutsDialog(groups)`
 * of `@miragon/modeler-shell` (0.7), or with its standalone `showShortcutsDialog(groups, { container })`
 * in a host without a mounted shell. Removal due in 0.9.0 (issue 261 of Miragon/modeler-suite).
 */
export function createShortcutsDialog(
  chrome: ShortcutsDialogChrome,
  options: ContextMapShortcutOptions = {},
): ShortcutsDialog {
  return createChromeDialog(chrome, {
    className: DIALOG_CLASS,
    titleId: TITLE_ID,
    title: "Keyboard shortcuts",
    content() {
      const body = element("div", "cm-dialog-body cm-shortcuts-body");
      body.append(...contextMapShortcuts(chrome, options).map(shortcutTable));
      return [body];
    },
  });
}
