import { describe, expect, it } from "vitest";
import { shortcutLabel, type ChromeKey, type Platform } from "./keymap.js";
import { defaultMessages, resolveMessages, type ShellMessages } from "./messages.js";
import {
  chromeShortcutRows,
  isChromeShortcutRow,
  withChromeShortcuts,
  type ShortcutChrome,
  type ShortcutGroup,
} from "./shortcuts.js";
import { formatPercent } from "./zoom.js";

const VIEW_KEYS: readonly ChromeKey[] = ["zoomIn", "zoomOut", "zoomToActual", "fit"];

const GERMAN = resolveMessages({
  zoomIn: "Vergrößern",
  zoomOut: "Verkleinern",
  zoomToActual: (percent) => `Auf ${percent}`,
  fit: "Einpassen",
  shortcutsView: "Ansicht",
  keyNames: { ctrl: "Strg", shift: "Umschalt" },
});

/** What the zoom panel's tooltips say: the same texts and chips (dom/zoom-panel.ts). */
function tooltipRows(messages: ShellMessages, lang: string, platform: Platform) {
  const labels = [
    messages.zoomIn,
    messages.zoomOut,
    messages.zoomToActual(formatPercent(1, lang)),
    messages.fit,
  ];
  return labels.map((action, index) => ({
    chromeKey: VIEW_KEYS[index],
    action,
    keys: [shortcutLabel(VIEW_KEYS[index]!, platform, messages.keyNames)],
  }));
}

const MAC: ShortcutChrome = { platform: "mac", lang: "en", messages: defaultMessages };

const EDIT: ShortcutGroup = {
  title: "Edit",
  rows: [
    { action: "Undo", keys: ["⌘Z"] },
    { action: "Delete", keys: ["⌫"] },
  ],
};

describe("chromeShortcutRows", () => {
  for (const [lang, messages] of [
    ["en", defaultMessages],
    ["de", GERMAN],
  ] as const) {
    for (const platform of ["mac", "other"] as const satisfies readonly Platform[]) {
      it(`equals the zoom panel's tooltips (${lang}, ${platform})`, () => {
        expect(chromeShortcutRows({ platform, lang, messages })).toEqual(
          tooltipRows(messages, lang, platform),
        );
      });
    }
  }

  it("writes the chips of guide §5.8 on macOS and elsewhere", () => {
    expect(chromeShortcutRows(MAC).map((row) => row.keys)).toEqual([
      ["⌘+"],
      ["⌘−"],
      ["⌘0"],
      ["⇧1"],
    ]);
    expect(
      chromeShortcutRows({ platform: "other", lang: "de", messages: GERMAN }).map(
        (row) => row.keys,
      ),
    ).toEqual([["Strg+Plus"], ["Strg+Minus"], ["Strg+0"], ["Umschalt+1"]]);
  });

  it("falls back to English for a language tag the shell falls back on", () => {
    const [, , actual] = chromeShortcutRows({ ...MAC, lang: "" });
    expect(actual?.action).toBe(defaultMessages.zoomToActual(formatPercent(1, "")));
    expect(actual?.action).toBe("Zoom to 100%");
  });

  it("formats 100 % in the tool's language", () => {
    const [, , actual] = chromeShortcutRows({ platform: "mac", lang: "de", messages: GERMAN });
    expect(actual?.action).toBe("Auf 100 %");
  });
});

describe("withChromeShortcuts", () => {
  it("puts the shell's View group first when the modeler gives none", () => {
    const shown = withChromeShortcuts([EDIT], MAC);
    expect(shown.map((group) => group.title)).toEqual(["View", "Edit"]);
    expect(shown[0]?.rows).toEqual(chromeShortcutRows(MAC));
    expect(shown[1]).toBe(EDIT);
  });

  it("fills the modeler's View group in its place, the chrome's keys first", () => {
    const file: ShortcutGroup = { title: "File", rows: [{ action: "Open…", keys: ["⌘O"] }] };
    const view: ShortcutGroup = {
      title: "View",
      rows: [{ action: "Move the canvas", keys: ["⌘←", "⌘→"] }],
    };
    const shown = withChromeShortcuts([file, view, EDIT], MAC);
    expect(shown.map((group) => group.title)).toEqual(["File", "View", "Edit"]);
    expect(shown[1]?.rows).toEqual([
      ...chromeShortcutRows(MAC),
      { action: "Move the canvas", keys: ["⌘←", "⌘→"] },
    ]);
  });

  it("leaves out the modeler's own rows for the chrome's keys, which the chrome's rows stand for", () => {
    const renderersView: ShortcutGroup = {
      title: "View",
      rows: [
        ...chromeShortcutRows(MAC).map(({ action, keys }) => ({ action, keys })),
        { action: "Keyboard shortcuts", keys: ["?"] },
      ],
    };
    const [view] = withChromeShortcuts([renderersView], MAC);
    expect(view?.rows.map((row) => row.action)).toEqual([
      "Zoom in",
      "Zoom out",
      "Zoom to 100%",
      "Fit to view",
      "Keyboard shortcuts",
    ]);
    expect(view?.rows.filter(isChromeShortcutRow)).toHaveLength(4);
  });

  it("finds the View group by the messages' title, in the tool's language", () => {
    const ansicht: ShortcutGroup = { title: "Ansicht", rows: [] };
    const shown = withChromeShortcuts([EDIT, ansicht], {
      platform: "other",
      lang: "de",
      messages: GERMAN,
    });
    expect(shown.map((group) => group.title)).toEqual(["Edit", "Ansicht"]);
    expect(shown[1]?.rows.map((row) => row.action)).toEqual([
      "Vergrößern",
      "Verkleinern",
      "Auf 100 %",
      "Einpassen",
    ]);
  });

  it("drops the modeler's empty groups", () => {
    const shown = withChromeShortcuts([{ title: "Tools", rows: [] }, EDIT], MAC);
    expect(shown.map((group) => group.title)).toEqual(["View", "Edit"]);
  });

  it("leaves the groups it was given unchanged", () => {
    const view: ShortcutGroup = { title: "View", rows: [{ action: "Zoom in", keys: ["⌘+"] }] };
    withChromeShortcuts([view], MAC);
    expect(view.rows).toEqual([{ action: "Zoom in", keys: ["⌘+"] }]);
  });
});
