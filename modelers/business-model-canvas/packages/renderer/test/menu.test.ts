import { describe, expect, it } from "vitest";
import { SHORTCUTS_KEY, diagramMenu, diagramShortcuts } from "../src/menu/index.js";

const MESSAGES = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomToActual: (percent: string) => `Zoom to ${percent}`,
  fit: "Fit",
  keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
};

const MODEL = {
  showCanvasTitle() {},
};

describe("the diagram menu", () => {
  it("opens the canvas title from the Model group", () => {
    let opened = false;
    const menu = diagramMenu({
      model: { showCanvasTitle: () => (opened = true) },
      exports: { png: { onSelect() {} }, svg: { onSelect() {} } },
      showKeyboardShortcuts() {},
    });
    expect(menu.model.map((entry) => entry.label)).toEqual(["Canvas title…"]);
    const canvasTitle = menu.model[0];
    if (canvasTitle?.kind === "dialog") canvasTitle.onSelect();
    expect(opened).toBe(true);
  });

  it("toggles the notes panel from the Model group, also on a read-only canvas", () => {
    let open = false;
    const menu = diagramMenu({
      model: MODEL,
      notes: { isOpen: () => open, toggle: () => (open = !open) },
      exports: { png: { onSelect() {} }, svg: { onSelect() {} } },
      showKeyboardShortcuts() {},
    });
    const notes = menu.model.at(-1);
    expect(notes).toMatchObject({
      kind: "checkbox",
      label: "Notes",
      keepEnabledWhenReadOnly: true,
    });
    if (notes?.kind !== "checkbox") return;
    notes.onToggle(true);
    expect(notes.checked()).toBe(true);
  });

  it("lists PNG before SVG and the shortcuts dialog under Help", () => {
    const menu = diagramMenu({
      model: MODEL,
      exports: { png: { onSelect() {} }, svg: { onSelect() {} } },
      showKeyboardShortcuts() {},
    });
    expect(menu.export.map((entry) => entry.label)).toEqual(["Export as PNG", "Export as SVG"]);
    expect(menu.help.map((entry) => entry.label)).toEqual(["Keyboard shortcuts…"]);
  });

  it("shows the key that opens the shortcuts dialog as its Help entry's chip", () => {
    const help = (shortcutsKey?: string) =>
      diagramMenu({
        model: MODEL,
        exports: { png: { onSelect() {} }, svg: { onSelect() {} } },
        showKeyboardShortcuts() {},
        shortcutsKey,
      }).help[0];
    expect(help(SHORTCUTS_KEY)?.shortcut).toBe("?");
    expect(help()).not.toHaveProperty("shortcut");
  });

  it("lists the key that opens the dialog in a Help group of its own, last", () => {
    const groups = (shortcutsKey?: string) =>
      diagramShortcuts({ platform: "mac", lang: "en", messages: MESSAGES }, { shortcutsKey });
    expect(groups(SHORTCUTS_KEY).at(-1)).toEqual({
      title: "Help",
      rows: [{ action: "Keyboard shortcuts", keys: ["?"] }],
    });
    expect(groups().map((group) => group.title)).toEqual(["Edit", "Tools", "View"]);
  });

  it("names Cmd on macOS and Ctrl elsewhere", () => {
    const undo = (platform: "mac" | "other") =>
      diagramShortcuts({ platform, lang: "en", messages: MESSAGES })[0]?.rows[0]?.keys;
    expect(undo("mac")).toEqual(["⌘Z"]);
    expect(undo("other")).toEqual(["Ctrl+Z"]);
  });
});
