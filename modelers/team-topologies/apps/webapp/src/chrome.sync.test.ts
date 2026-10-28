import { describe, expect, it } from "vitest";
import {
  commandKeyLabel,
  defaultMessages,
  resolveMessages,
  type LegendOptions,
  type MenuGroups,
  type Platform,
  type ShellHandle,
  type ShortcutGroup,
} from "@miragon/modeler-shell";
import {
  diagramMenu,
  diagramShortcuts,
  renderLegend,
  type DiagramMenu,
  type ShortcutsChrome,
  type TitleDialogChrome,
} from "@miragon/team-topologies-renderer";

/*
 * The renderer builds the diagram's menu entries, shortcut tables and legend without importing the
 * shell (only the apps mount it), so it mirrors the shell's types and its key labels. These tests
 * pin the mirror: the File rows use the chips the shell writes, and menu, dialogs and legend take
 * what the shell hands them. The pin of the View rows against the tooltips lives in the shell:
 * `shell.showShortcutsDialog` shows the chrome's own rows for them and leaves out the renderer's,
 * checked in every modeler by the kit's `shortcutsDialog` case.
 */

const GERMAN = resolveMessages({
  openFile: "Öffnen…",
  keyNames: { ctrl: "Strg", shift: "Umschalt" },
});

describe("the renderer's chrome content against @miragon/modeler-shell", () => {
  for (const [lang, messages] of [
    ["en", defaultMessages],
    ["de", GERMAN],
  ] as const) {
    for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
      it(`the File rows name the shell's Open… and write its key chips (${lang}, ${platform})`, () => {
        const [file] = diagramShortcuts({ platform, lang, messages }, { fileKeys: true });

        expect(file).toEqual({
          title: "File",
          rows: [
            {
              action: messages.openFile,
              keys: [commandKeyLabel("O", platform, messages.keyNames)],
            },
            { action: "Export as JSON", keys: [commandKeyLabel("S", platform, messages.keyNames)] },
          ],
        });
      });
    }
  }

  it("hands the shell its shortcut groups as data for showShortcutsDialog", () => {
    const groups: readonly ShortcutGroup[] = diagramShortcuts(
      { platform: "mac", lang: "en", messages: defaultMessages },
      { fileKeys: true },
    );
    expect(groups.map((group) => group.title)).toEqual(["File", "View", "Edit", "Tools"]);
  });

  it("hands the shell a menu and a legend renderer, and takes a shell handle as chrome", () => {
    const menu: DiagramMenu = diagramMenu({
      editTitle: () => undefined,
      exports: { png: { onSelect: () => undefined }, svg: { onSelect: () => undefined } },
      showKeyboardShortcuts: () => undefined,
      shortcutsKey: "?",
    });
    const groups: MenuGroups = menu;
    const render: LegendOptions["render"] = renderLegend;
    const shortcutsChrome = (shell: ShellHandle): ShortcutsChrome => shell;
    const titleChrome = (shell: ShellHandle): TitleDialogChrome => shell;

    expect(groups.model?.map((entry) => entry.id)).toEqual(["diagram-title"]);
    expect(render).toBe(renderLegend);
    expect(shortcutsChrome).toBeTypeOf("function");
    expect(titleChrome).toBeTypeOf("function");
  });
});
