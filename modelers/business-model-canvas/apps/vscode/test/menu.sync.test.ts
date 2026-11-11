import { describe, expect, it } from "vitest";
import {
  commandKeyLabel as shellCommandKeyLabel,
  defaultMessages,
  formatPercent,
  resolveMessages,
  shortcutLabel,
  type ChromeKey,
  type MenuGroups,
  type ShellMessages,
} from "@miragon/modeler-shell";
import {
  commandKeyLabel,
  diagramMenu,
  diagramShortcuts,
  TEXT_EXPORT_LABEL,
} from "@miragon/business-model-canvas-renderer";

/*
 * The renderer builds its menu entries and shortcut rows without importing the shell (only the
 * apps mount it), so it mirrors the shell's types and key labels structurally. These tests pin the
 * mirror: a shell release that renames a field or relabels a key fails here.
 */

const VIEW_KEYS: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

const GERMAN = resolveMessages({
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  zoomToActual: (percent) => `Auf ${percent}`,
  fit: "Einpassen",
  keyNames: { ctrl: "Strg", shift: "Umschalt" },
});

function viewActions(messages: ShellMessages, lang: string): string[] {
  return [
    messages.zoomIn,
    messages.zoomOut,
    messages.zoomToActual(formatPercent(1, lang)),
    messages.fit,
  ];
}

describe("the renderer's menu and shortcuts against @miragon/modeler-shell", () => {
  for (const [lang, messages] of [
    ["en", defaultMessages],
    ["de", GERMAN],
  ] as const) {
    for (const platform of ["mac", "other"] as const) {
      it(`the View rows say what the zoom panel says (${lang}, ${platform})`, () => {
        const view = diagramShortcuts({ platform, lang, messages }).find(
          (group) => group.title === "View",
        );

        expect(view?.rows).toEqual(
          viewActions(messages, lang).map((action, index) => ({
            action,
            keys: [shortcutLabel(VIEW_KEYS[index]!, platform, messages.keyNames)],
          })),
        );
      });

      it(`the File rows take the shell's Open… and Cmd/Ctrl chips (${lang}, ${platform})`, () => {
        const [file] = diagramShortcuts({ platform, lang, messages }, { fileKeys: true });

        expect(file).toEqual({
          title: "File",
          rows: [
            {
              action: messages.openFile,
              keys: [shellCommandKeyLabel("O", platform, messages.keyNames)],
            },
            {
              action: TEXT_EXPORT_LABEL,
              keys: [shellCommandKeyLabel("S", platform, messages.keyNames)],
            },
          ],
        });
      });

      it(`writes Cmd/Ctrl chips as the shell does (${lang}, ${platform})`, () => {
        expect(commandKeyLabel("Z", platform, messages.keyNames)).toBe(
          shellCommandKeyLabel("Z", platform, messages.keyNames),
        );
      });
    }
  }

  it("is a menu the shell takes", () => {
    const action = { onSelect() {} };
    const groups: MenuGroups = diagramMenu({
      model: {
        showCanvasTitle() {},
      },
      exports: { png: action, svg: action },
      showKeyboardShortcuts() {},
    });

    expect(Object.keys(groups)).toEqual(["model", "export", "help"]);
  });
});
