/**
 * The rows of the board's "Keyboard shortcuts…" dialog. The zoom and fit keys are the shell's
 * and the shell adds them itself; these are the board's own keys and gestures, and in a web app
 * the two file keys the app binds.
 */
import {
  commandKeyLabel,
  type Platform,
  type ShellMessages,
  type ShortcutGroup,
} from "@miragon/modeler-shell/core";

/** What the rows need of the chrome. A `ShellHandle` fits. */
export interface ShortcutsChrome {
  readonly platform: Platform;
  readonly messages: Pick<ShellMessages, "keyNames" | "shortcutsEdit">;
}

/** The label of the board file's download: its menu entry and its row in the dialog. */
export const BOARD_EXPORT_LABEL = "Export as .board";

/**
 * How a picture gets onto a board beside the Image button: pasted, and dropped. `shift-drop`
 * where the host takes a dropped file for itself unless Shift is held, as VS Code does, which
 * opens the file in an editor of its own.
 */
export type PictureGestures = "drop" | "shift-drop";

export interface BoardShortcutsOptions {
  /** A web app's own file keys, Cmd/Ctrl+O and Cmd/Ctrl+S, in a File group first. */
  fileKeys?: boolean | undefined;
  /** The row for a pasted and a dropped picture. Absent: a board that keeps no pictures. */
  pictures?: PictureGestures | undefined;
}

export function boardShortcuts(
  chrome: ShortcutsChrome,
  options: BoardShortcutsOptions = {},
): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const { keyNames } = messages;
  const mac = platform === "mac";
  const command = (key: string): string => commandKeyLabel(key, platform, keyNames);
  const fileGroup: ShortcutGroup = {
    title: "File",
    rows: [
      { action: "Open…", keys: [command("O")] },
      { action: BOARD_EXPORT_LABEL, keys: [command("S")] },
    ],
  };
  const shiftDrop = mac ? "⇧ drop" : `${keyNames.shift}+drop`;
  const pictureRows = options.pictures
    ? [
        {
          action: "Add a picture",
          keys: [command("V"), options.pictures === "shift-drop" ? shiftDrop : "Drop"],
        },
      ]
    : [];
  return [
    ...(options.fileKeys === true ? [fileGroup] : []),
    {
      title: messages.shortcutsEdit,
      rows: [
        { action: "Undo", keys: [command("Z")] },
        { action: "Redo", keys: [mac ? "⌘⇧Z" : `${keyNames.ctrl}+Y`] },
        { action: "Delete the selection", keys: mac ? ["⌫", "⌦"] : ["Del", "Backspace"] },
        { action: "Move the selection", keys: ["←", "→", "↑", "↓"] },
        { action: "Add to the selection", keys: [mac ? "⌘ click" : `${keyNames.ctrl}+click`] },
        { action: "Select with a box", keys: [mac ? "⇧ drag" : `${keyNames.shift}+drag`] },
        { action: "Edit a note or a model", keys: ["Double-click"] },
        { action: "Finish a note", keys: ["Esc", command("Enter")] },
        ...pictureRows,
      ],
    },
  ];
}
