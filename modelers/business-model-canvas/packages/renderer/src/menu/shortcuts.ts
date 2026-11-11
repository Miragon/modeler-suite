import { TEXT_EXPORT_LABEL } from "./menu.js";

/*
 * The rows of the "Keyboard shortcuts…" dialog. The View rows say what the shell's zoom panel
 * tooltips say, so the chrome's key labels are mirrored here structurally (the renderer never
 * imports the shell) and apps/vscode/test/menu.sync.test.ts pins them against the shell.
 */

export type ShortcutPlatform = "mac" | "other";

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

export interface DiagramShortcutsOptions {
  /** The key that opens the dialog itself, listed in a Help group. */
  readonly shortcutsKey?: string | undefined;
  /** The web app's own file keys, Cmd/Ctrl+O and Cmd/Ctrl+S, in a File group first. */
  readonly fileKeys?: boolean | undefined;
}

/** A Cmd/Ctrl key chip: `⌘Z` on macOS, `Ctrl+Z` elsewhere, as the shell's `commandKeyLabel`. */
export function commandKeyLabel(
  key: string,
  platform: ShortcutPlatform,
  keyNames: Pick<ShortcutKeyNames, "ctrl">,
): string {
  return platform === "mac" ? `⌘${key}` : `${keyNames.ctrl}+${key}`;
}

export function diagramShortcuts(
  chrome: ShortcutsChrome,
  options: DiagramShortcutsOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const { keyNames } = messages;
  const mac = platform === "mac";
  const command = (key: string) => commandKeyLabel(key, platform, keyNames);
  const option = (key: string) => (mac ? `⌥${key}` : `Alt+${key}`);
  const percent = new Intl.NumberFormat(chrome.lang, { style: "percent" }).format(1);
  return [
    ...(options.fileKeys
      ? [
          {
            title: "File",
            rows: [
              { action: "Open…", keys: [command("O")] },
              { action: TEXT_EXPORT_LABEL, keys: [command("S")] },
            ],
          },
        ]
      : []),
    {
      title: "Edit",
      rows: [
        { action: "Undo", keys: [command("Z")] },
        { action: "Redo", keys: [mac ? "⌘⇧Z" : `${keyNames.ctrl}+Y`] },
        { action: "Edit label", keys: ["E"] },
        { action: "Show or hide notes", keys: ["N"] },
        { action: "Delete", keys: [mac ? "⌫" : "Del"] },
        { action: "Move sticky up or down", keys: [option("↑"), option("↓")] },
        { action: "Move sticky to the block before or after", keys: [option("←"), option("→")] },
        { action: "Select all", keys: [command("A")] },
      ],
    },
    {
      title: "Tools",
      rows: [
        { action: "Lasso", keys: ["L"] },
        { action: "Hand", keys: ["H"] },
      ],
    },
    {
      title: "View",
      rows: [
        { action: messages.zoomIn, keys: [mac ? "⌘+" : `${keyNames.ctrl}+${keyNames.plus}`] },
        { action: messages.zoomOut, keys: [mac ? "⌘−" : `${keyNames.ctrl}+${keyNames.minus}`] },
        { action: messages.zoomToActual(percent), keys: [command("0")] },
        { action: messages.fit, keys: [mac ? "⇧1" : `${keyNames.shift}+1`] },
      ],
    },
    ...(options.shortcutsKey
      ? [{ title: "Help", rows: [{ action: "Keyboard shortcuts", keys: [options.shortcutsKey] }] }]
      : []),
  ];
}
