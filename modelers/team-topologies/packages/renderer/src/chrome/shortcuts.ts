import { JSON_EXPORT_LABEL, SHORTCUTS_DIALOG_KEY } from "./menu.js";

/*
 * Every keyboard shortcut of the diagram for the "Keyboard shortcuts…" dialog, in the groups of
 * guide §5.4 (View, Edit, the notation's tools). The chrome's texts and key names come in
 * structurally (a `@miragon/modeler-shell` handle fits), so the View rows say what the zoom
 * panel's tooltips say.
 */

export type ShortcutPlatform = "mac" | "other";

export interface ShortcutKeyNames {
  readonly ctrl: string;
  readonly shift: string;
  readonly plus: string;
  readonly minus: string;
}

/** What the shortcuts need of the chrome around the diagram. */
export interface ShortcutsChrome {
  readonly platform: ShortcutPlatform;
  /** The tool's UI language, for the percentage in "Zoom to 100%". */
  readonly lang: string;
  readonly messages: {
    readonly zoomIn: string;
    readonly zoomOut: string;
    zoomToActual(percent: string): string;
    readonly fit: string;
    /** The File group's "Open…" (the shell's `messages.openFile`); default "Open…". */
    readonly openFile?: string | undefined;
    readonly keyNames: ShortcutKeyNames;
  };
}

export interface ShortcutRow {
  readonly action: string;
  /** Alternative key combinations, each shown as its own chip. */
  readonly keys: readonly string[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export interface DiagramShortcutOptions {
  /** The web app's own keys: Open…, Export as JSON and "?" for this dialog. */
  readonly fileKeys?: boolean | undefined;
}

const ARROWS = ["←", "↑", "→", "↓"] as const;

function percentOfActualSize(lang: string): string {
  const options: Intl.NumberFormatOptions = { style: "percent", maximumFractionDigits: 0 };
  try {
    return new Intl.NumberFormat(lang, options).format(1);
  } catch {
    return new Intl.NumberFormat("en", options).format(1);
  }
}

/** The chrome's zoom and fit keys as its tooltips name them (guide §5.8). */
function viewKeys(platform: ShortcutPlatform, keyNames: ShortcutKeyNames) {
  if (platform === "mac") {
    return { zoomIn: "⌘+", zoomOut: "⌘−", zoomToActual: "⌘0", fit: "⇧1" };
  }
  const { ctrl, shift, plus, minus } = keyNames;
  return {
    zoomIn: `${ctrl}+${plus}`,
    zoomOut: `${ctrl}+${minus}`,
    zoomToActual: `${ctrl}+0`,
    fit: `${shift}+1`,
  };
}

function platformKeys(platform: ShortcutPlatform, keyNames: ShortcutKeyNames) {
  if (platform === "mac") {
    return {
      undo: ["⌘Z"],
      redo: ["⌘⇧Z"],
      selectAll: ["⌘A"],
      copy: ["⌘C"],
      paste: ["⌘V"],
      remove: ["⌫"],
      coarseMove: ARROWS.map((arrow) => `⇧${arrow}`),
      shiftDrag: ["⇧ Drag"],
      shiftClick: ["⇧ Click"],
      newLine: ["⇧Enter"],
      open: ["⌘O"],
      save: ["⌘S"],
    };
  }
  const { ctrl, shift } = keyNames;
  return {
    undo: [`${ctrl}+Z`],
    redo: [`${ctrl}+${shift}+Z`, `${ctrl}+Y`],
    selectAll: [`${ctrl}+A`],
    copy: [`${ctrl}+C`],
    paste: [`${ctrl}+V`],
    remove: ["Del", "Backspace"],
    coarseMove: ARROWS.map((arrow) => `${shift}+${arrow}`),
    shiftDrag: [`${shift}+Drag`],
    shiftClick: [`${shift}+Click`],
    newLine: [`${shift}+Enter`],
    open: [`${ctrl}+O`],
    save: [`${ctrl}+S`],
  };
}

/**
 * Every shortcut of the diagram, grouped as guide §5.4 asks (View, Edit, Tools), after the web
 * app's File keys where it binds them.
 */
export function diagramShortcuts(
  chrome: ShortcutsChrome,
  options: DiagramShortcutOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const view = viewKeys(platform, messages.keyNames);
  const keys = platformKeys(platform, messages.keyNames);
  const groups: ShortcutGroup[] = [
    {
      title: "View",
      rows: [
        { action: messages.zoomIn, keys: [view.zoomIn] },
        { action: messages.zoomOut, keys: [view.zoomOut] },
        {
          action: messages.zoomToActual(percentOfActualSize(chrome.lang)),
          keys: [view.zoomToActual],
        },
        { action: messages.fit, keys: [view.fit] },
        ...(options.fileKeys
          ? [{ action: "Keyboard shortcuts", keys: [SHORTCUTS_DIALOG_KEY] }]
          : []),
      ],
    },
    {
      title: "Edit",
      rows: [
        { action: "Undo", keys: keys.undo },
        { action: "Redo", keys: keys.redo },
        { action: "Select all", keys: keys.selectAll },
        { action: "Copy", keys: keys.copy },
        { action: "Paste", keys: keys.paste },
        { action: "Delete", keys: keys.remove },
        { action: "Move selection", keys: ARROWS },
        { action: "Move selection in large steps", keys: keys.coarseMove },
        { action: "Clear the selection", keys: ["Esc"] },
      ],
    },
    {
      title: "Tools",
      rows: [
        { action: "Lasso by dragging", keys: keys.shiftDrag },
        { action: "Add to or remove from the selection", keys: keys.shiftClick },
        { action: "Add the palette element in the middle", keys: ["Enter", "Space"] },
        { action: "Edit a name or text", keys: ["Double-click"] },
        { action: "Save the text", keys: ["Enter"] },
        { action: "Start a new line", keys: keys.newLine },
        { action: "Discard the change", keys: ["Esc"] },
      ],
    },
  ];
  if (options.fileKeys) {
    groups.unshift({
      title: "File",
      rows: [
        { action: messages.openFile ?? "Open…", keys: keys.open },
        { action: JSON_EXPORT_LABEL, keys: keys.save },
      ],
    });
  }
  return groups;
}
