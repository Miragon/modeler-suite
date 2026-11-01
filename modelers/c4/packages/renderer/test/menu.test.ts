import { describe, expect, it, vi } from "vitest";
import type { MenuGroups, ShellHandle, openShellDialog } from "@miragon/modeler-shell";
import type { ViewEntry } from "@miragon/c4-schema-model";
import type { InspectorSlot } from "../src/inspector/Inspector.js";
import {
  SHORTCUTS_KEY,
  c4Menu,
  diagramMenu,
  type C4MenuModeler,
  type DiagramMenuEntry,
} from "../src/menu/menu.js";
import { diagramShortcuts } from "../src/menu/shortcuts.js";
import type { DialogChrome, OpenDialog } from "../src/navigation/types.js";

const MESSAGES = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomToActual: (percent: string) => `Zoom to ${percent}`,
  fit: "Fit",
  keyNames: { ctrl: "Ctrl", shift: "Shift", plus: "Plus", minus: "Minus" },
};

const EXPORTS = { png: { onSelect() {} }, svg: { onSelect() {} } };

function view(key: string, type: ViewEntry["type"], editable = true): ViewEntry {
  return {
    key,
    state: "written",
    type,
    scopeId: type === "systemLandscape" ? undefined : "shop",
    editable,
    title: key,
    definition: undefined,
  };
}

/** A diagram as the Model group reads it: a current view, its parent, the dialogs. */
function fakeModeler(active: ViewEntry, parent?: ViewEntry) {
  const dialogs = {
    showViews: vi.fn(),
    showAddElement: vi.fn(),
    showViewSettings: vi.fn(),
    showWorkspaceSettings: vi.fn(),
  };
  const modeler = {
    views: {
      active: () => active,
      parent: () => parent,
      open: vi.fn(() => true),
    },
    c4: { layOutAutomatically: vi.fn(), applyC4Colours: vi.fn() },
    diagram: {
      get: <T>(name: string): T => {
        if (name === "c4Dialogs") return dialogs as T;
        throw new Error(`no service ${name}`);
      },
    },
  } satisfies C4MenuModeler;
  return { modeler, dialogs };
}

function model(modeler: C4MenuModeler): readonly DiagramMenuEntry[] {
  return c4Menu({ modeler, exports: EXPORTS, showKeyboardShortcuts() {} }).model ?? [];
}

function entry(entries: readonly DiagramMenuEntry[], id: string): DiagramMenuEntry {
  const found = entries.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

/** The shell kit's `isCanvasMenuAction`: an enabled, non-danger action that opens no dialog. */
function firstCanvasAction(entries: readonly DiagramMenuEntry[]): string | undefined {
  return entries.find(
    (candidate) =>
      candidate.kind === "action" &&
      !(candidate.disabled?.() ?? false) &&
      !("danger" in candidate && candidate.danger),
  )?.label;
}

describe("the Model group (SPEC 7.1)", () => {
  it("lists the C4 entries in their order, the dialogs ending in an ellipsis", () => {
    const { modeler } = fakeModeler(view("Landscape", "systemLandscape"));
    const entries = model(modeler);
    expect(entries.map((candidate) => [candidate.kind, candidate.label])).toEqual([
      ["dialog", "Views…"],
      ["action", "Parent view"],
      ["action", "Lay out automatically"],
      ["dialog", "Add existing element…"],
      ["dialog", "View settings…"],
      ["dialog", "Workspace settings…"],
      ["action", "Apply C4 colours"],
    ]);
    expect(entry(entries, "views")).toMatchObject({ shortcut: "G" });
    expect(entry(entries, "parent-view")).toMatchObject({ shortcut: "U" });
  });

  it("at a landscape disables Parent view, so Lay out automatically is the first canvas action", () => {
    const { modeler } = fakeModeler(view("Landscape", "systemLandscape"));
    const entries = model(modeler);
    expect(entry(entries, "parent-view").disabled?.()).toBe(true);
    for (const id of ["lay-out-automatically", "add-existing-element", "view-settings"]) {
      expect(entry(entries, id).disabled?.(), id).toBe(false);
    }
    expect(firstCanvasAction(entries)).toBe("Lay out automatically");
  });

  it("enables Parent view below a landscape and opens the parent as the user's switch", () => {
    const parent = view("Landscape", "systemLandscape");
    const { modeler } = fakeModeler(view("Containers", "container"), parent);
    const parentView = entry(model(modeler), "parent-view");
    expect(parentView.disabled?.()).toBe(false);
    parentView.onSelect();
    expect(modeler.views.open).toHaveBeenCalledWith("Landscape", { cause: "user" });
  });

  it("disables what edits the view on a view the modeler can't edit", () => {
    const { modeler } = fakeModeler(view("Filtered", "container", false));
    const entries = model(modeler);
    for (const id of ["lay-out-automatically", "add-existing-element", "view-settings"]) {
      expect(entry(entries, id).disabled?.(), id).toBe(true);
    }
    expect(entry(entries, "views").disabled?.() ?? false).toBe(false);
  });

  it("keeps only the navigation usable on a read-only canvas", () => {
    const { modeler } = fakeModeler(view("Landscape", "systemLandscape"));
    const kept = model(modeler)
      .filter((candidate) => candidate.keepEnabledWhenReadOnly)
      .map((candidate) => candidate.id);
    expect(kept).toEqual(["views", "parent-view"]);
  });

  it("runs each entry's action: the dialogs, the layout and the colours", () => {
    const { modeler, dialogs } = fakeModeler(view("Landscape", "systemLandscape"));
    const entries = model(modeler);
    entry(entries, "views").onSelect();
    entry(entries, "add-existing-element").onSelect();
    entry(entries, "view-settings").onSelect();
    entry(entries, "workspace-settings").onSelect();
    entry(entries, "lay-out-automatically").onSelect();
    entry(entries, "apply-c4-colours").onSelect();
    expect(dialogs.showViews).toHaveBeenCalledOnce();
    expect(dialogs.showAddElement).toHaveBeenCalledOnce();
    expect(dialogs.showViewSettings).toHaveBeenCalledOnce();
    expect(dialogs.showWorkspaceSettings).toHaveBeenCalledOnce();
    expect(modeler.c4.layOutAutomatically).toHaveBeenCalledOnce();
    expect(modeler.c4.applyC4Colours).toHaveBeenCalledOnce();
  });

  it("comes before Export and Help", () => {
    const { modeler } = fakeModeler(view("Landscape", "systemLandscape"));
    const menu = c4Menu({
      modeler,
      exports: { ...EXPORTS, text: { onSelect() {} }, structurizr: { onSelect() {} } },
      showKeyboardShortcuts() {},
      shortcutsKey: SHORTCUTS_KEY,
    });
    expect(Object.keys(menu)).toEqual(["model", "export", "help"]);
    expect(menu.export.map((candidate) => candidate.label)).toEqual([
      "Export as PNG",
      "Export as SVG",
      "Export as .c4",
      "Export as Structurizr DSL (.dsl)",
    ]);
    expect(menu.help[0]).toMatchObject({ label: "Keyboard shortcuts…", shortcut: "?" });
  });
});

describe("the text exports", () => {
  it("run the native .c4 export and the Structurizr DSL export each on its own entry", () => {
    const text = { onSelect: vi.fn() };
    const structurizr = { onSelect: vi.fn() };
    const menu = diagramMenu({
      exports: { ...EXPORTS, text, structurizr },
      showKeyboardShortcuts() {},
    });
    const byId = (id: string) => menu.export.find((candidate) => candidate.id === id);

    byId("export-text")?.onSelect();
    expect(text.onSelect).toHaveBeenCalledOnce();
    expect(structurizr.onSelect).not.toHaveBeenCalled();
    byId("export-structurizr")?.onSelect();
    expect(structurizr.onSelect).toHaveBeenCalledOnce();
  });

  it("are absent where the host is the file", () => {
    const menu = diagramMenu({ exports: EXPORTS, showKeyboardShortcuts() {} });
    expect(menu.export.map((candidate) => candidate.id)).toEqual(["export-png", "export-svg"]);
  });
});

describe("the diagram menu", () => {
  it("lists PNG before SVG and the shortcuts dialog under Help, without a Model group", () => {
    const menu = diagramMenu({ exports: EXPORTS, showKeyboardShortcuts() {} });
    expect(menu.model).toBeUndefined();
    expect(menu.export.map((candidate) => candidate.label)).toEqual([
      "Export as PNG",
      "Export as SVG",
    ]);
    expect(menu.help.map((candidate) => candidate.label)).toEqual(["Keyboard shortcuts…"]);
  });

  it("shows the key that opens the shortcuts dialog as its Help entry's chip", () => {
    const help = (shortcutsKey?: string) =>
      diagramMenu({ exports: EXPORTS, showKeyboardShortcuts() {}, shortcutsKey }).help[0];
    expect(help(SHORTCUTS_KEY)?.shortcut).toBe("?");
    expect(help()).not.toHaveProperty("shortcut");
  });

  it("lists the dialog's own key in a Help group of its own, last", () => {
    const groups = (shortcutsKey?: string) =>
      diagramShortcuts({ platform: "mac", lang: "en", messages: MESSAGES }, { shortcutsKey });
    expect(groups(SHORTCUTS_KEY).at(-1)).toEqual({
      title: "Help",
      rows: [{ action: "Keyboard shortcuts", keys: ["?"] }],
    });
    expect(groups().map((group) => group.title)).toEqual(["View", "Edit", "Tools", "Navigation"]);
  });
});

describe("the parts the apps hand the shell, and the shell's parts the renderer takes", () => {
  it("fit structurally: the menu, the dialog opener and the inspector slot", () => {
    const { modeler } = fakeModeler(view("Landscape", "systemLandscape"));
    const groups: MenuGroups = c4Menu({ modeler, exports: EXPORTS, showKeyboardShortcuts() {} });
    const opener = (open: typeof openShellDialog): OpenDialog => open;
    const chrome = (shell: ShellHandle, open: typeof openShellDialog): DialogChrome => ({
      container: shell.root,
      openDialog: open,
    });
    const slot = (shell: ShellHandle): InspectorSlot | undefined => shell.inspector;
    expect(groups.model).toHaveLength(7);
    expect([opener, chrome, slot].every((check) => typeof check === "function")).toBe(true);
  });
});
