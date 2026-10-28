import { shortcutLabel, type ChromeKey, type Platform } from "./keymap.js";
import type { ShellMessages } from "./messages.js";
import { formatPercent } from "./zoom.js";

/** One row of the "Keyboard shortcuts…" dialog (guide §5.4): what the keys do, and the keys. */
export interface ShortcutRow {
  /** The action in Sentence case: "Zoom in", "Select all". */
  readonly action: string;
  /** Alternative keys or gestures, each shown as its own chip: `["⌘⇧Z"]`, `["Del", "Backspace"]`. */
  readonly keys: readonly string[];
}

/** One table of the dialog: View, Edit, the notation's tools (guide §5.4). */
export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

/** A row of the chrome's own keys in the View group, with the key it stands for. */
export interface ChromeShortcutRow extends ShortcutRow {
  readonly chromeKey: ChromeKey;
}

/** A row as the dialog shows it: a modeler's row, or one of the chrome's keys. */
export type ShownShortcutRow = ShortcutRow | ChromeShortcutRow;

/** A table as the dialog shows it, the View group's chrome rows included. */
export interface ShownShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShownShortcutRow[];
}

/** What the View rows need of the chrome: its platform, language and texts. */
export interface ShortcutChrome {
  readonly platform: Platform;
  /** The tool's UI language, for the percentage in "Zoom to 100%". */
  readonly lang: string;
  readonly messages: Pick<
    ShellMessages,
    "zoomIn" | "zoomOut" | "zoomToActual" | "fit" | "keyNames" | "shortcutsView"
  >;
}

/** The zoom panel's order: zoom in, zoom out, 100 %, fit (guide §5.8). */
const CHROME_KEYS: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

function chromeAction(key: ChromeKey, chrome: ShortcutChrome): string {
  const { messages } = chrome;
  switch (key) {
    case "zoomIn":
      return messages.zoomIn;
    case "zoomOut":
      return messages.zoomOut;
    case "zoomToActual":
      return messages.zoomToActual(formatPercent(1, chrome.lang));
    case "fit":
      return messages.fit;
  }
}

/**
 * The chrome's zoom and fit keys as rows of the View group, each named and chipped as the zoom
 * panel's tooltip shows it (guide §5.6, §5.8): "Zoom in" with `⌘+`, "Zoom to 100%" with `⌘0`,
 * elsewhere `Ctrl+Plus` and `Ctrl+0` with the key names of the messages table.
 */
export function chromeShortcutRows(chrome: ShortcutChrome): ChromeShortcutRow[] {
  return CHROME_KEYS.map((chromeKey) => ({
    chromeKey,
    action: chromeAction(chromeKey, chrome),
    keys: [shortcutLabel(chromeKey, chrome.platform, chrome.messages.keyNames)],
  }));
}

/**
 * The tables of the shell's shortcuts dialog: `groups` in their order, without empty ones, with the
 * chrome's keys at the top of the View group (the group titled `messages.shortcutsView`). A modeler
 * row of that group that names a chrome action (the same text) is left out, since the chrome's row
 * stands for it; the rest follow in their order. Without a View group the shell's comes first.
 */
export function withChromeShortcuts(
  groups: readonly ShortcutGroup[],
  chrome: ShortcutChrome,
): ShownShortcutGroup[] {
  const chromeRows = chromeShortcutRows(chrome);
  const chromeActions = new Set(chromeRows.map((row) => row.action));
  const title = chrome.messages.shortcutsView;
  const viewIndex = groups.findIndex((group) => group.title === title);
  const shown: ShownShortcutGroup[] = groups.map((group, index) =>
    index === viewIndex
      ? {
          title,
          rows: [...chromeRows, ...group.rows.filter((row) => !chromeActions.has(row.action))],
        }
      : group,
  );
  if (viewIndex < 0) shown.unshift({ title, rows: chromeRows });
  return shown.filter((group) => group.rows.length > 0);
}

/** Whether a shown row is one of the chrome's keys. */
export function isChromeShortcutRow(row: ShownShortcutRow): row is ChromeShortcutRow {
  return "chromeKey" in row;
}
