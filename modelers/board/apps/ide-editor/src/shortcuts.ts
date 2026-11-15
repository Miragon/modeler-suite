/**
 * The rows of the board's "Keyboard shortcuts…" dialog. The zoom and fit keys are the shell's
 * and the shell adds them itself; these are the board's own keys and gestures.
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

export function boardShortcuts(chrome: ShortcutsChrome): ShortcutGroup[] {
  const { platform, messages } = chrome;
  const { keyNames } = messages;
  const mac = platform === "mac";
  const command = (key: string): string => commandKeyLabel(key, platform, keyNames);
  return [
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
      ],
    },
  ];
}
