import { describe, expect, it } from "vitest";
import { PARENT_VIEW_KEY, VIEWS_KEY } from "../src/menu/menu.js";
import {
  SMART_DELETE_ROW,
  c4Shortcuts,
  commandKeyLabel,
  diagramShortcuts,
  type ShortcutGroup,
} from "../src/menu/shortcuts.js";

const MESSAGES = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomToActual: (percent: string) => `Zoom to ${percent}`,
  fit: "Fit",
  keyNames: { ctrl: "Strg", shift: "Umschalt", plus: "Plus", minus: "Minus" },
};

function rowsOf(
  groups: readonly ShortcutGroup[],
  title: string,
): Record<string, readonly string[]> {
  const group = groups.find((candidate) => candidate.title === title);
  if (!group) throw new Error(`no group ${title}`);
  return Object.fromEntries(group.rows.map((row) => [row.action, row.keys]));
}

describe("the shortcut rows (SPEC 5.7)", () => {
  it("groups the diagram's keys as View, Edit, Tools and Navigation; the shell leads View", () => {
    expect(c4Shortcuts("web").map((group) => group.title)).toEqual([
      "View",
      "Edit",
      "Tools",
      "Navigation",
    ]);
    expect(rowsOf(c4Shortcuts("web", { platform: "mac" }), "View")).toEqual({
      "Move the canvas": ["⌘←", "⌘↑", "⌘→", "⌘↓"],
    });
  });

  it("lists the web app's file keys first, in their own File group", () => {
    const mac = c4Shortcuts("web", { platform: "mac", fileKeys: true });
    expect(mac[0]).toEqual({
      title: "File",
      rows: [
        { action: "Open…", keys: ["⌘O"] },
        { action: "Export as .c4", keys: ["⌘S"] },
      ],
    });
    const other = c4Shortcuts("web", {
      fileKeys: true,
      openFile: "Öffnen…",
      keyNames: { ctrl: "Strg", shift: "Umschalt" },
    });
    expect(rowsOf(other, "File")).toEqual({ "Öffnen…": ["Strg+O"], "Export as .c4": ["Strg+S"] });
    expect(c4Shortcuts("web").map((group) => group.title)).not.toContain("File");
  });

  it("names every key the canvas and its label editor bind (wave 1 too)", () => {
    const groups = c4Shortcuts("web", { platform: "mac" });
    expect(rowsOf(groups, "Edit")).toMatchObject({
      "Clear the selection": ["Esc"],
      "Edit name, or a relationship's description": ["E"],
      "Edit the text under the pointer": ["Double-click"],
      "Save a label": ["Enter"],
      "Next field while editing a label": ["Tab"],
      "Line break in a description": ["⇧Enter"],
      "Discard a label edit": ["Esc"],
    });
    expect(rowsOf(groups, "Tools")).toEqual({
      Lasso: ["L"],
      "Lasso by dragging": ["⇧ Drag"],
      "Add to or remove from the selection": ["⇧ Click"],
      Hand: ["H"],
      "Hand while held": ["Space"],
      Connect: ["C"],
      "Add the palette element in the middle": ["Enter", "Space"],
    });
    const other = c4Shortcuts("web", { keyNames: { ctrl: "Strg", shift: "Umschalt" } });
    expect(rowsOf(other, "Edit")["Line break in a description"]).toEqual(["Umschalt+Enter"]);
    expect(rowsOf(other, "Tools")["Lasso by dragging"]).toEqual(["Umschalt+Drag"]);
    expect(rowsOf(other, "View")["Move the canvas"]).toEqual([
      "Strg+←",
      "Strg+↑",
      "Strg+→",
      "Strg+↓",
    ]);
  });

  it("names the Mac keys", () => {
    const groups = c4Shortcuts("web", { platform: "mac" });
    expect(rowsOf(groups, "Edit")).toMatchObject({
      Undo: ["⌘Z"],
      Redo: ["⌘⇧Z"],
      [SMART_DELETE_ROW]: ["⌫"],
      "Delete from model…": ["⇧⌫"],
      "Move selection": ["←", "↑", "→", "↓"],
      "Select all": ["⌘A"],
    });
  });

  it("names the keys elsewhere in the chrome's key names", () => {
    const groups = c4Shortcuts("web", { keyNames: { ctrl: "Strg", shift: "Umschalt" } });
    expect(rowsOf(groups, "Edit")).toMatchObject({
      Undo: ["Strg+Z"],
      Redo: ["Strg+Umschalt+Z", "Strg+Y"],
      [SMART_DELETE_ROW]: ["Del", "Backspace"],
      "Delete from model…": ["Umschalt+Del"],
      "Select all": ["Strg+A"],
    });
  });

  it("says what Delete does depending on the other views", () => {
    expect(SMART_DELETE_ROW).toBe(
      "Delete: remove from this view, or from the model when no other view shows it",
    );
  });

  it("leaves undo and redo to VS Code in the IDE host", () => {
    const edit = rowsOf(c4Shortcuts("ide"), "Edit");
    expect(edit).not.toHaveProperty("Undo");
    expect(edit).not.toHaveProperty("Redo");
    expect(edit).toHaveProperty("Edit name, or a relationship's description");
  });

  it("lists the navigation with the keys the canvas binds", () => {
    const groups = c4Shortcuts("web");
    expect(rowsOf(groups, "Navigation")).toEqual({
      "Open the view of the selected system or container": ["Enter"],
      "Parent view": [PARENT_VIEW_KEY],
      "Views…": [VIEWS_KEY],
    });
  });

  it("adds a Help group for the key that opens the dialog", () => {
    expect(c4Shortcuts("web", { shortcutsKey: "?" }).at(-1)).toEqual({
      title: "Help",
      rows: [{ action: "Keyboard shortcuts", keys: ["?"] }],
    });
  });

  it("puts the zoom panel's View rows first for a host without the shell's chrome", () => {
    for (const platform of ["mac", "other"] as const) {
      const groups = diagramShortcuts(
        { platform, lang: "de", messages: MESSAGES },
        { host: "ide" },
      );
      expect(groups[0]?.title).toBe("View");
      expect(groups[0]?.rows.map((row) => row.action)).toEqual([
        "Zoom in",
        "Zoom out",
        `Zoom to ${new Intl.NumberFormat("de", { style: "percent" }).format(1)}`,
        "Fit",
        "Move the canvas",
      ]);
      expect(rowsOf(groups, "Edit")).not.toHaveProperty("Undo");
    }
    expect(
      rowsOf(diagramShortcuts({ platform: "other", lang: "en", messages: MESSAGES }), "View"),
    ).toEqual({
      "Zoom in": ["Strg+Plus"],
      "Zoom out": ["Strg+Minus"],
      "Zoom to 100%": ["Strg+0"],
      Fit: ["Umschalt+1"],
      "Move the canvas": ["Strg+←", "Strg+↑", "Strg+→", "Strg+↓"],
    });
  });

  it("names Cmd on macOS and Ctrl elsewhere", () => {
    expect(commandKeyLabel("Z", "mac", MESSAGES.keyNames)).toBe("⌘Z");
    expect(commandKeyLabel("Z", "other", MESSAGES.keyNames)).toBe("Strg+Z");
  });
});
