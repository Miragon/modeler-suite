/*
 * The rows of the "Keyboard shortcuts…" dialog (SPEC 5.7). The View rows say what the shell's zoom
 * panel tooltips say, so the chrome's key labels are mirrored here structurally (the renderer never
 * imports the shell) and apps/vscode/test/menu.sync.test.ts pins them against the shell.
 */
import { PARENT_VIEW_KEY, TEXT_EXPORT_LABEL, VIEWS_KEY } from "./menu.js";

export type ShortcutPlatform = "mac" | "other";

export type ShortcutHost = "web" | "ide";

export interface ShortcutKeyNames {
  readonly ctrl: string;
  readonly shift: string;
  readonly plus: string;
  readonly minus: string;
}

/** What the rows need of the chrome around the diagram; a `@miragon/modeler-shell` handle fits. */
export interface ShortcutsChrome {
  readonly platform: ShortcutPlatform;
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
  readonly keys: readonly string[];
}

export interface ShortcutGroup {
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export interface C4ShortcutsOptions {
  /** Default "other". */
  readonly platform?: ShortcutPlatform | undefined;
  /** The chrome's key names; default English. */
  readonly keyNames?: Pick<ShortcutKeyNames, "ctrl" | "shift"> | undefined;
  /** The key that opens the dialog itself, listed in a Help group. */
  readonly shortcutsKey?: string | undefined;
  /** The web app's file keys, listed first: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .c4. */
  readonly fileKeys?: boolean | undefined;
  /** The File group's "Open…"; default "Open…". */
  readonly openFile?: string | undefined;
}

export interface DiagramShortcutsOptions {
  /** The key that opens the dialog itself, listed in a Help group. */
  readonly shortcutsKey?: string | undefined;
  /** "ide": VS Code owns undo and redo, so their rows go (SPEC 1.6). Default "web". */
  readonly host?: ShortcutHost | undefined;
  /** The web app's file keys (`C4ShortcutsOptions.fileKeys`). */
  readonly fileKeys?: boolean | undefined;
}

const ARROWS = ["←", "↑", "→", "↓"] as const;
const ENGLISH_KEYS: Pick<ShortcutKeyNames, "ctrl" | "shift"> = { ctrl: "Ctrl", shift: "Shift" };

/** The Delete row (SPEC 5.4): what Delete does depends on the other views. */
export const SMART_DELETE_ROW =
  "Delete: remove from this view, or from the model when no other view shows it";

/** A Cmd/Ctrl key chip: `⌘Z` on macOS, `Ctrl+Z` elsewhere, as the shell's `commandKeyLabel`. */
export function commandKeyLabel(
  key: string,
  platform: ShortcutPlatform,
  keyNames: Pick<ShortcutKeyNames, "ctrl">,
): string {
  return platform === "mac" ? `⌘${key}` : `${keyNames.ctrl}+${key}`;
}

/**
 * The diagram's own groups (SPEC 5.7): File where the web app binds its keys, View with the keys
 * the canvas adds to the chrome's, Edit, Tools, Navigation, and Help where a key opens the dialog.
 * The shell's dialog puts the chrome's zoom rows at the top of the View group
 * (`withChromeShortcuts`). In the IDE host VS Code owns undo and redo, so their rows go.
 */
export function c4Shortcuts(host: ShortcutHost, options: C4ShortcutsOptions = {}): ShortcutGroup[] {
  const mac = options.platform === "mac";
  const { ctrl, shift } = options.keyNames ?? ENGLISH_KEYS;
  const command = (key: string) => (mac ? `⌘${key}` : `${ctrl}+${key}`);
  const shifted = (key: string) => (mac ? `⇧${key}` : `${shift}+${key}`);
  const withPointer = (gesture: string) => (mac ? `⇧ ${gesture}` : `${shift}+${gesture}`);
  const history: ShortcutRow[] =
    host === "web"
      ? [
          { action: "Undo", keys: [command("Z")] },
          { action: "Redo", keys: mac ? ["⌘⇧Z"] : [`${ctrl}+${shift}+Z`, `${ctrl}+Y`] },
        ]
      : [];
  const file: ShortcutGroup[] = options.fileKeys
    ? [
        {
          title: "File",
          rows: [
            { action: options.openFile ?? "Open…", keys: [command("O")] },
            { action: TEXT_EXPORT_LABEL, keys: [command("S")] },
          ],
        },
      ]
    : [];
  return [
    ...file,
    { title: "View", rows: [{ action: "Move the canvas", keys: ARROWS.map(command) }] },
    {
      title: "Edit",
      rows: [
        ...history,
        { action: "Select all", keys: [command("A")] },
        { action: "Clear the selection", keys: ["Esc"] },
        { action: "Edit name, or a relationship's description", keys: ["E"] },
        { action: "Edit the text under the pointer", keys: ["Double-click"] },
        { action: "Save a label", keys: ["Enter"] },
        { action: "Next field while editing a label", keys: ["Tab"] },
        { action: "Line break in a description", keys: [shifted("Enter")] },
        { action: "Discard a label edit", keys: ["Esc"] },
        { action: SMART_DELETE_ROW, keys: mac ? ["⌫"] : ["Del", "Backspace"] },
        { action: "Delete from model…", keys: mac ? ["⇧⌫"] : [`${shift}+Del`] },
        { action: "Move selection", keys: ARROWS },
        { action: "Move selection in large steps", keys: ARROWS.map(shifted) },
        { action: "Go to the context pad of the selection", keys: ["Tab"] },
        { action: "Move through the context pad", keys: ["↑", "↓", "Home", "End"] },
        { action: "Run a context pad entry", keys: ["Enter", "Space"] },
        { action: "Back to the canvas from the context pad", keys: ["Esc"] },
      ],
    },
    {
      title: "Tools",
      rows: [
        { action: "Lasso", keys: ["L"] },
        { action: "Lasso by dragging", keys: [withPointer("Drag")] },
        { action: "Add to or remove from the selection", keys: [withPointer("Click")] },
        { action: "Hand", keys: ["H"] },
        { action: "Hand while held", keys: ["Space"] },
        { action: "Connect", keys: ["C"] },
        { action: "Add the palette element in the middle", keys: ["Enter", "Space"] },
      ],
    },
    {
      title: "Navigation",
      rows: [
        { action: "Open the view of the selected system or container", keys: ["Enter"] },
        { action: "Parent view", keys: [PARENT_VIEW_KEY] },
        { action: "Views…", keys: [VIEWS_KEY] },
      ],
    },
    ...(options.shortcutsKey
      ? [{ title: "Help", rows: [{ action: "Keyboard shortcuts", keys: [options.shortcutsKey] }] }]
      : []),
  ];
}

/**
 * Every group of the dialog: the diagram's own (`c4Shortcuts`), its View group led by the rows the
 * zoom panel's tooltips show, which the shell's dialog replaces with its own. For a host without
 * the shell's chrome as well.
 */
export function diagramShortcuts(
  chrome: ShortcutsChrome,
  options: DiagramShortcutsOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const { keyNames } = messages;
  const mac = platform === "mac";
  const command = (key: string) => commandKeyLabel(key, platform, keyNames);
  const percent = percentOfActualSize(chrome.lang);
  const zoomRows: ShortcutRow[] = [
    { action: messages.zoomIn, keys: [mac ? "⌘+" : `${keyNames.ctrl}+${keyNames.plus}`] },
    { action: messages.zoomOut, keys: [mac ? "⌘−" : `${keyNames.ctrl}+${keyNames.minus}`] },
    { action: messages.zoomToActual(percent), keys: [command("0")] },
    { action: messages.fit, keys: [mac ? "⇧1" : `${keyNames.shift}+1`] },
  ];
  const groups = c4Shortcuts(options.host ?? "web", {
    platform,
    keyNames,
    shortcutsKey: options.shortcutsKey,
    fileKeys: options.fileKeys,
    openFile: messages.openFile,
  });
  return groups.map((group) =>
    group.title === "View" ? { title: group.title, rows: [...zoomRows, ...group.rows] } : group,
  );
}

function percentOfActualSize(lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: "percent" }).format(1);
  } catch {
    return new Intl.NumberFormat("en", { style: "percent" }).format(1);
  }
}
