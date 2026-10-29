import { describe, expect, it } from "vitest";
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
  STORM_EXPORT_LABEL,
  boardMenu,
  boardShortcuts,
  commandKeyLabel,
  type AggregatesDialogChrome,
  type BoardMenu,
  type ShortcutsChrome,
} from "@miragon/event-storming-renderer";

/*
 * The renderer builds the board's menu entries and shortcut tables without importing the shell
 * (only the apps mount it), so it mirrors the shell's types and its key labels. These tests pin
 * the mirror: the View rows of the shortcuts dialog say what the zoom panel's tooltips say, and
 * the menu and the shell's dialog take what the shell hands them.
 */

const VIEW_KEYS: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

function viewActions(messages: ShellMessages, lang: string): string[] {
  return [
    messages.zoomIn,
    messages.zoomOut,
    messages.zoomToActual(formatPercent(1, lang)),
    messages.fit,
  ];
}

const GERMAN = resolveMessages({
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  zoomToActual: (percent) => `Auf ${percent}`,
  fit: "Einpassen",
  keyNames: { ctrl: "Strg", shift: "Umschalt" },
});

describe("the board menu and shortcuts against @miragon/modeler-shell", () => {
  for (const [lang, messages] of [
    ["en", defaultMessages],
    ["de", GERMAN],
  ] as const) {
    for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
      it(`the View rows equal the chrome tooltips (${lang}, ${platform})`, () => {
        const view = boardShortcuts({ platform, lang, messages }).find(
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

  it("writes an app key chip the shell reads back as aria-keyshortcuts", () => {
    expect(ariaKeyShortcutsFromLabel(commandKeyLabel("O", "mac", defaultMessages.keyNames))).toBe(
      "Meta+O",
    );
    expect(ariaKeyShortcutsFromLabel(commandKeyLabel("S", "other", defaultMessages.keyNames))).toBe(
      "Control+S",
    );
  });

  it("writes the app key chips as the shell does", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const messages of [defaultMessages, GERMAN]) {
        expect(commandKeyLabel("O", platform, messages.keyNames)).toBe(
          shellCommandKeyLabel("O", platform, messages.keyNames),
        );
      }
    }
  });

  it('names the File row "Open…" as the shell’s File group does', () => {
    const file = boardShortcuts(
      { platform: "mac", lang: "en", messages: { ...defaultMessages, openFile: "Öffnen…" } },
      { fileKeys: true },
    ).find((group) => group.title === "File");

    expect(file?.rows[0]).toEqual({ action: "Öffnen…", keys: ["⌘O"] });
    expect(file?.rows[1]?.action).toBe(STORM_EXPORT_LABEL);
  });

  for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
    it(`the shell's dialog shows the zoom keys once, as its own rows (${platform})`, () => {
      const chrome = { platform, lang: "en", messages: defaultMessages };

      const shown = withChromeShortcuts(boardShortcuts(chrome, { fileKeys: true }), chrome);

      expect(shown.map((group) => group.title)).toEqual(["File", "View", "Edit", "Tools"]);
      const view = shown.find((group) => group.title === defaultMessages.shortcutsView);
      expect(view?.rows).toHaveLength(4);
      expect(view?.rows.every(isChromeShortcutRow)).toBe(true);
    });
  }

  it("the board menu is a menu the shell takes, and a shell handle is the chrome of the groups", () => {
    const menu: BoardMenu = boardMenu({
      levels: { getLevel: () => "design", setLevel: () => undefined },
      typeCaptions: { typeCaptionsVisible: () => true, setTypeCaptionsVisible: () => undefined },
      exports: { png: { onSelect: () => undefined }, svg: { onSelect: () => undefined } },
      showKeyboardShortcuts: () => undefined,
    });
    const groups: MenuGroups = menu;
    const chrome = (shell: ShellHandle): ShortcutsChrome => shell;
    const showGroups = (shell: ShellHandle) => shell.showShortcutsDialog(boardShortcuts(shell));

    expect(groups.model).toHaveLength(2);
    expect(chrome).toBeTypeOf("function");
    expect(showGroups).toBeTypeOf("function");
  });

  it('"Aggregates…" is a dialog entry the shell takes, and the shell\'s dialog is what it opens', () => {
    const menu: MenuGroups = boardMenu({
      levels: { getLevel: () => "design", setLevel: () => undefined },
      typeCaptions: { typeCaptionsVisible: () => true, setTypeCaptionsVisible: () => undefined },
      aggregates: { hasAggregates: () => true, showAggregates: () => undefined },
      exports: { png: { onSelect: () => undefined }, svg: { onSelect: () => undefined } },
      showKeyboardShortcuts: () => undefined,
    });
    const chrome = (shell: ShellHandle): AggregatesDialogChrome => ({
      container: shell.root,
      openDialog: openShellDialog,
    });

    expect(menu.model?.at(-1)).toMatchObject({
      kind: "dialog",
      id: "aggregates",
      label: "Aggregates…",
      keepEnabledWhenReadOnly: true,
    });
    expect(chrome).toBeTypeOf("function");
  });
});
