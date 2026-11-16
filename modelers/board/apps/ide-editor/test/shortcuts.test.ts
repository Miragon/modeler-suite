import { describe, expect, it } from "vitest";
import { chromeShortcutRows, defaultMessages } from "@miragon/modeler-shell/core";
import { BOARD_EXPORT_LABEL, boardShortcuts } from "../src/shortcuts.js";

const rowsFor = (platform: "mac" | "other"): Record<string, readonly string[]> => {
  const groups = boardShortcuts({ platform, messages: defaultMessages });
  expect(groups.map((group) => group.title)).toEqual(["Edit"]);
  return Object.fromEntries((groups[0]?.rows ?? []).map((row) => [row.action, row.keys]));
};

describe("the rows of the board's shortcuts dialog", () => {
  it("name the board's keys as a keyboard without a Command key has them", () => {
    expect(rowsFor("other")).toEqual({
      Undo: ["Ctrl+Z"],
      Redo: ["Ctrl+Y"],
      "Delete the selection": ["Del", "Backspace"],
      "Move the selection": ["←", "→", "↑", "↓"],
      "Add to the selection": ["Ctrl+click"],
      "Select with a box": ["Shift+drag"],
      "Edit a note or a model": ["Double-click"],
      "Finish a note": ["Esc", "Ctrl+Enter"],
    });
  });

  it("name them as a Mac has them", () => {
    expect(rowsFor("mac")).toMatchObject({
      Undo: ["⌘Z"],
      Redo: ["⌘⇧Z"],
      "Delete the selection": ["⌫", "⌦"],
      "Add to the selection": ["⌘ click"],
      "Select with a box": ["⇧ drag"],
      "Finish a note": ["Esc", "⌘Enter"],
    });
  });

  it("take the names of the keys from the shell's messages", () => {
    const messages = {
      ...defaultMessages,
      shortcutsEdit: "Bearbeiten",
      keyNames: { ...defaultMessages.keyNames, ctrl: "Strg", shift: "Umschalt" },
    };
    const [group] = boardShortcuts({ platform: "other", messages });
    expect(group?.title).toBe("Bearbeiten");
    expect(group?.rows.find((row) => row.action === "Undo")?.keys).toEqual(["Strg+Z"]);
    expect(group?.rows.find((row) => row.action === "Select with a box")?.keys).toEqual([
      "Umschalt+drag",
    ]);
  });

  it("have no File group where the host owns the file: an IDE binds those keys itself", () => {
    for (const options of [undefined, {}, { fileKeys: false }, { fileKeys: undefined }]) {
      const groups = boardShortcuts({ platform: "other", messages: defaultMessages }, options);
      expect(groups.map((group) => group.title)).toEqual(["Edit"]);
    }
  });

  it("list a web app's two file keys first, the download under its menu label", () => {
    const chrome = { platform: "other" as const, messages: defaultMessages };
    const groups = boardShortcuts(chrome, { fileKeys: true });

    expect(groups.map((group) => group.title)).toEqual(["File", "Edit"]);
    expect(groups[0]?.rows).toEqual([
      { action: "Open…", keys: ["Ctrl+O"] },
      { action: "Export as .board", keys: ["Ctrl+S"] },
    ]);
    expect(BOARD_EXPORT_LABEL).toBe("Export as .board");
    // the board's own rows are the ones a host without file keys gets
    expect(groups[1]).toEqual(boardShortcuts(chrome)[0]);
  });

  it("name the file keys as a Mac has them", () => {
    const [file] = boardShortcuts(
      { platform: "mac", messages: defaultMessages },
      { fileKeys: true },
    );

    expect(file?.rows.map((row) => row.keys)).toEqual([["⌘O"], ["⌘S"]]);
  });

  it("leave the zoom and fit keys to the shell, which adds them itself", () => {
    const chrome = chromeShortcutRows({ platform: "other", lang: "en", messages: defaultMessages });
    const own = Object.keys(rowsFor("other"));
    expect(chrome.map((row) => row.action).filter((action) => own.includes(action))).toEqual([]);
  });
});
