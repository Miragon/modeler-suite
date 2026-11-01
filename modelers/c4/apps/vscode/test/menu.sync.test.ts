import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ariaKeyShortcutsFromLabel,
  commandKeyLabel as shellCommandKeyLabel,
  defaultMessages,
  formatPercent,
  openShellDialog,
  resolveMessages,
  shortcutLabel,
  type ChromeKey,
  type MenuGroups,
  type Platform,
  type ShellHandle,
  type ShellMessages,
} from "@miragon/modeler-shell";
import { isChromeShortcutRow, withChromeShortcuts } from "@miragon/modeler-shell/core";
import {
  c4Menu,
  c4Shortcuts,
  commandKeyLabel,
  diagramShortcuts,
  type C4MenuModeler,
  type DialogChrome,
  type DiagramMenu,
  type DiagramMenuEntry,
  type ShortcutsDialogChrome,
} from "@miragon/c4-renderer";
import { GO_TO_VIEW_COMMAND, WEBVIEW_COMMANDS } from "../src/commands.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

/*
 * The renderer builds its menu entries and shortcut rows without importing the shell (only the
 * apps mount it), so it mirrors the shell's types and key labels structurally. These tests pin the
 * mirror: a shell release that renames a field or relabels a key fails here. They also pin the
 * Command Palette to the webview's menu: a command and the entry it mirrors do the same and are
 * called the same, the command in VS Code's Title Case (guide §13.5).
 */

const VIEW_KEYS: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

const GERMAN = resolveMessages({
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  zoomToActual: (percent) => `Auf ${percent}`,
  fit: "Einpassen",
  keyNames: { ctrl: "Strg", shift: "Umschalt" },
});

const EXPORTS = { png: { onSelect() {} }, svg: { onSelect() {} } };

/** A diagram at a container view: every entry of the Model group is enabled. */
const MODELER: C4MenuModeler = {
  views: {
    active: () => ({
      key: "Containers-shop",
      state: "written",
      type: "container",
      scopeId: "shop",
      editable: true,
      title: "Container diagram for Shop",
      definition: undefined,
    }),
    parent: () => undefined,
    open: () => true,
  },
  c4: { layOutAutomatically: () => undefined, applyC4Colours: () => undefined },
  diagram: {
    get<T>(): T {
      throw new Error("no service");
    },
  },
};

function viewActions(messages: ShellMessages, lang: string): string[] {
  return [
    messages.zoomIn,
    messages.zoomOut,
    messages.zoomToActual(formatPercent(1, lang)),
    messages.fit,
  ];
}

function menuEntries(menu: DiagramMenu): DiagramMenuEntry[] {
  return [...(menu.model ?? []), ...menu.export, ...menu.help];
}

/** Words VS Code's Title Case keeps in lower case unless they come first: "Export as PNG". */
const MINOR_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "as",
  "at",
  "for",
  "in",
  "of",
  "on",
  "to",
]);

/** VS Code's Title Case of a sentence-case menu label: "Parent view" is "Parent View". */
function titleCase(label: string): string {
  return label
    .split(" ")
    .map((word, index) =>
      index > 0 && MINOR_WORDS.has(word) ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
}

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  contributes: { commands: Array<{ command: string; title: string }> };
};
const commandTitle = new Map(
  manifest.contributes.commands.map((command) => [command.command, command.title]),
);

describe("the renderer's menu and shortcuts against @miragon/modeler-shell", () => {
  for (const [lang, messages] of [
    ["en", defaultMessages],
    ["de", GERMAN],
  ] as const) {
    for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
      it(`the View rows say what the zoom panel says (${lang}, ${platform})`, () => {
        const view = diagramShortcuts({ platform, lang, messages }, { host: "ide" }).find(
          (group) => group.title === "View",
        );

        expect(view?.rows).toEqual(
          viewActions(messages, lang).map((action, index) => ({
            action,
            keys: [shortcutLabel(VIEW_KEYS[index]!, platform, messages.keyNames)],
          })),
        );
      });
    }
  }

  it("writes Cmd/Ctrl chips as the shell does, and the shell reads them back", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const messages of [defaultMessages, GERMAN]) {
        expect(commandKeyLabel("Z", platform, messages.keyNames)).toBe(
          shellCommandKeyLabel("Z", platform, messages.keyNames),
        );
      }
    }
    expect(ariaKeyShortcutsFromLabel(commandKeyLabel("A", "mac", defaultMessages.keyNames))).toBe(
      "Meta+A",
    );
  });

  for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
    it(`the shell's dialog shows the zoom keys once, as its own rows (${platform})`, () => {
      const chrome = { platform, lang: "en", messages: defaultMessages };

      const shown = withChromeShortcuts(diagramShortcuts(chrome, { host: "ide" }), chrome);

      expect(shown.map((group) => group.title)).toEqual(["View", "Edit", "Tools", "Navigation"]);
      const view = shown.find((group) => group.title === defaultMessages.shortcutsView);
      expect(view?.rows).toHaveLength(4);
      expect(view?.rows.every(isChromeShortcutRow)).toBe(true);
    });
  }

  it("lists no undo or redo in VS Code, whose document history owns them", () => {
    const actions = c4Shortcuts("ide").flatMap((group) => group.rows.map((row) => row.action));
    expect(actions).not.toContain("Undo");
    expect(actions).not.toContain("Redo");
  });

  it("is a menu the shell takes, and a shell handle is the chrome of the dialogs", () => {
    const groups: MenuGroups = c4Menu({
      modeler: MODELER,
      exports: EXPORTS,
      showKeyboardShortcuts() {},
    });
    const shortcutsChrome = (shell: ShellHandle): ShortcutsDialogChrome => shell;
    const dialogChrome = (shell: ShellHandle): DialogChrome => ({
      container: shell.root,
      openDialog: openShellDialog,
    });

    expect(groups.model).toHaveLength(7);
    expect(Object.keys(groups)).toEqual(["model", "export", "help"]);
    expect([shortcutsChrome, dialogChrome].every((check) => typeof check === "function")).toBe(
      true,
    );
  });
});

describe("the Command Palette against the webview's menu (guide §13.5)", () => {
  const entries = menuEntries(
    c4Menu({ modeler: MODELER, exports: EXPORTS, showKeyboardShortcuts() {} }),
  );
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  /** The menu entry each webview command runs; Fit is the zoom panel's (the shell's). */
  const MIRRORED = {
    parentView: "parent-view",
    exportPng: "export-png",
    exportSvg: "export-svg",
  } as const;

  it.each(Object.entries(MIRRORED))("%s is called as its menu entry is", (name, id) => {
    const entry = entryById.get(id);
    expect(entry, id).toBeDefined();
    const command = WEBVIEW_COMMANDS[name as keyof typeof MIRRORED];
    expect(commandTitle.get(command)).toBe(titleCase(entry!.label));
  });

  it("Fit to View is the zoom panel's Fit to view", () => {
    expect(commandTitle.get(WEBVIEW_COMMANDS.fitView)).toBe(titleCase(defaultMessages.fit));
  });

  it("Go to View… lists what Views… lists, and both open a dialog-like list", () => {
    expect(entryById.get("views")).toMatchObject({ kind: "dialog", label: "Views…" });
    expect(commandTitle.get(GO_TO_VIEW_COMMAND)).toMatch(/…$/);
  });
});
