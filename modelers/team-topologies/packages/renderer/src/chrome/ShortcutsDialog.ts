import { createChromeDialog, element, type ChromeDialog, type DialogChrome } from "./dialog.js";
import {
  diagramShortcuts,
  type DiagramShortcutOptions,
  type ShortcutGroup,
  type ShortcutsChrome,
} from "./shortcuts.js";

const DIALOG_CLASS = "tt-shortcuts";
const TITLE_ID = "tt-shortcuts-title";

/**
 * What the dialog needs of the chrome around the diagram; a `@miragon/modeler-shell` handle fits.
 *
 * @deprecated Since 0.16.0, removed in 0.17.0 (#259) with `createShortcutsDialog`. Type the chrome
 * as `ShortcutsChrome` and hand the shell's `showShortcutsDialog` the groups of `diagramShortcuts`.
 */
export interface ShortcutsDialogChrome extends ShortcutsChrome, DialogChrome {
  readonly messages: ShortcutsChrome["messages"] & DialogChrome["messages"];
}

/** @deprecated Since 0.16.0, removed in 0.17.0 (#259) with `createShortcutsDialog`. */
export type ShortcutsDialog = ChromeDialog;

function shortcutTable(group: ShortcutGroup, index: number): HTMLElement {
  const section = element("section", `${DIALOG_CLASS}__group`);
  const headingId = `${TITLE_ID}-group-${index}`;
  const heading = element("h3", `${DIALOG_CLASS}__group-title`, group.title);
  heading.id = headingId;
  const table = element("table", `${DIALOG_CLASS}__table`);
  table.setAttribute("aria-labelledby", headingId);
  const body = table.createTBody();
  for (const row of group.rows) {
    const line = body.insertRow();
    const action = element("th", `${DIALOG_CLASS}__action`, row.action);
    action.scope = "row";
    const keys = element("td", `${DIALOG_CLASS}__keys`);
    for (const key of row.keys) keys.append(element("kbd", `${DIALOG_CLASS}__key`, key));
    line.append(action, keys);
  }
  section.append(heading, table);
  return section;
}

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8): one table per group, the
 * action on the left and its keys as the chrome tooltip's chips on the right.
 *
 * @deprecated Since 0.16.0, removed in 0.17.0 (#259). `@miragon/modeler-shell` owns the dialog:
 * `shell.showShortcutsDialog(diagramShortcuts(shell, options))`, or its standalone
 * `showShortcutsDialog` in a host without a mounted shell.
 */
export function createShortcutsDialog(
  chrome: ShortcutsDialogChrome,
  options: DiagramShortcutOptions = {},
): ShortcutsDialog {
  return createChromeDialog(chrome, {
    className: DIALOG_CLASS,
    titleId: TITLE_ID,
    title: "Keyboard shortcuts",
    content() {
      const body = element("div", `tt-dialog__body ${DIALOG_CLASS}__body`);
      body.append(...diagramShortcuts(chrome, options).map(shortcutTable));
      return [body];
    },
  });
}
