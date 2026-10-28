import { describe, expect, it } from "vitest";

import {
  absentIslandProblems,
  absentIslands,
  afterDestroyKeyProblem,
  appearanceProblems,
  ariaProblems,
  createProblems,
  expectedAppearance,
  expectedKeyShortcuts,
  focusHandBackProblems,
  harnessHookProblems,
  isCanvasMenuAction,
  isToolEntry,
  isViewAtActualSize,
  keptDocumentProblems,
  keyReachProblem,
  labelEditorCommitProblems,
  labelEditorOpenProblems,
  labelEditorStepProblems,
  leftoverProblems,
  legendStartProblems,
  lockedShapeProblems,
  menuClosedProblems,
  menuKeysAtDocumentProblems,
  menuOpenProblems,
  optionalIslandProblems,
  overlayLayerProblems,
  paletteColorProblems,
  paletteShortcutProblems,
  readOnlyMenuProblems,
  readOnlyPaletteProblems,
  readOnlyStateProblems,
  surroundProblems,
  tabSequenceProblems,
  type CreateFacts,
  type KeyReach,
  type LockedShapeFacts,
} from "./checks.js";
import type {
  AppearanceFacts,
  AriaFacts,
  CanvasStateFacts,
  LabelEditorFacts,
  MenuEntryFacts,
  MenuFacts,
  MenuItemFacts,
  ModeFacts,
  PaletteColorEntry,
  PaletteColorFacts,
  PaletteEntryState,
  ShapeFacts,
} from "./facts.js";
import type { ChromeMeasurement } from "./geometry.js";
import type { ElementFacts, LeftoverFacts, ModeChange, RecordedKey } from "./page-tools.js";
import {
  MIRAGON_DATENSCHUTZ,
  MIRAGON_HOME,
  MIRAGON_IMPRESSUM,
  afterStartProblems,
  appearanceChoiceProblems,
  closedPopoverProblems,
  dropStateProblems,
  emptyStateKeyProblems,
  emptyStateProblems,
  emptyStateTabProblems,
  expectedWebMode,
  labelledWidth,
  legalAriaProblems,
  legalContentProblems,
  legalReachProblems,
  legalWrapProblems,
  lightOnlyMenuProblems,
  menuGroupProblems,
  modeSwitchProblems,
  openPopoverProblems,
  popoverKeyboardProblems,
  pillPopupAriaProblems,
  primaryActivationProblems,
  primaryAriaProblems,
  primaryTooltipProblems,
  repeatedToastProblems,
  shownToasts,
  speaksEnglish,
  startScreenOpenProblems,
  toastAnatomyProblems,
  toastLiveRegion,
  toastLiftProbes,
  toastStackProblems,
  toastTimingProblems,
  toastWidthProblems,
  topRowProblems,
  webModeProblems,
  zoomRowBottomProblems,
  zoomRowProbes,
  type ToastTiming,
} from "./web-checks.js";
import type {
  DropZoneFacts,
  EmptyStateFacts,
  PopoverFacts,
  ToastFacts,
  TopRowFacts,
  WebModeFacts,
} from "./web-facts.js";

function element(tag: string, attributes: Record<string, string> = {}, text = ""): ElementFacts {
  return { tag, description: tag, attributes, text, visible: true, disabled: false };
}

function conformingAria(): AriaFacts {
  const shortcuts = expectedKeyShortcuts("mac");
  return {
    platform: "mac",
    documentLang: "en",
    rootLang: null,
    trigger: element("button", {
      "data-chrome": "menu",
      "aria-label": "Menu",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": "cd-shell-menu-1",
    }),
    controlled: element("div", { id: "cd-shell-menu-1", role: "menu", "aria-label": "Menu" }),
    palette: element("div", { "data-chrome": "palette" }),
    toolbar: element("div", { role: "toolbar", "aria-label": "Tools" }),
    canvas: element("svg", { tabindex: "0", role: "application", "aria-label": "Diagram" }),
    entries: [
      {
        ...element("div", {
          "data-action": "lasso-tool",
          role: "button",
          "aria-label": "Lasso",
          tabindex: "0",
          "aria-pressed": "false",
        }),
        group: "tools",
      },
      {
        ...element("div", {
          "data-action": "hand-tool",
          role: "button",
          "aria-label": "Hand",
          tabindex: "-1",
          "aria-pressed": "true",
        }),
        group: "tools",
      },
      {
        ...element("div", {
          "data-action": "create.box",
          role: "button",
          "aria-label": "Box",
          tabindex: "-1",
        }),
        group: "shapes",
      },
    ],
    zoom: element("div", { "data-chrome": "zoom", role: "group", "aria-label": "Zoom" }),
    zoomButtons: {
      out: element("button", { "aria-label": "Zoom out", "aria-keyshortcuts": shortcuts.out }),
      actual: element(
        "button",
        { "aria-label": "Zoom to 100% (now 86%)", "aria-keyshortcuts": shortcuts.actual },
        "86%",
      ),
      in: element("button", { "aria-label": "Zoom in", "aria-keyshortcuts": shortcuts.in }),
      fit: element("button", { "aria-label": "Fit to view", "aria-keyshortcuts": shortcuts.fit }),
    },
    order: ["menu", "palette", "canvas", "status", "problems", "zoom"],
    positiveTabindex: [],
    titled: [],
    problems: null,
    status: null,
    legend: null,
    legendTitle: null,
    legendClose: null,
    inspector: null,
    primary: null,
    primaryCollapsed: false,
    legal: null,
    legalLinks: [],
    problemsControlled: null,
  };
}

describe("expectedKeyShortcuts", () => {
  it("names the WAI-ARIA keys of the user's platform", () => {
    expect(expectedKeyShortcuts("mac")).toEqual({
      in: "Meta+= Meta+Plus",
      out: "Meta+-",
      actual: "Meta+0",
      fit: "Shift+1",
    });
    expect(expectedKeyShortcuts("other")).toEqual({
      in: "Control+= Control+Plus",
      out: "Control+-",
      actual: "Control+0",
      fit: "Shift+1",
    });
  });
});

describe("ariaProblems", () => {
  it("accepts the conforming chrome", () => {
    expect(ariaProblems(conformingAria(), "ide")).toEqual([]);
  });

  it("accepts a German readout whose label carries a no-break space", () => {
    const facts = conformingAria();
    facts.zoomButtons.actual = element(
      "button",
      { "aria-label": "Auf 100 % zoomen (jetzt 86 %)", "aria-keyshortcuts": "Meta+0" },
      "86 %",
    );
    expect(ariaProblems(facts, "ide")).toEqual([]);
  });

  it("checks the menu trigger", () => {
    const facts = conformingAria();
    facts.trigger!.attributes["aria-haspopup"] = "true";
    facts.trigger!.attributes["aria-expanded"] = "true";
    facts.controlled = element("div", { id: "cd-shell-menu-1" });
    expect(ariaProblems(facts, "ide")).toEqual([
      'menu: aria-haspopup is "true", expected "menu"',
      'menu: aria-expanded is "true" while closed, expected "false"',
      'menu: aria-controls names a div with role "", expected "menu"',
    ]);
  });

  it("checks the palette toolbar and its roving tabindex", () => {
    const facts = conformingAria();
    facts.toolbar = element("div", { class: "djs-palette-entries" });
    facts.entries[2]!.attributes.tabindex = "0";
    delete facts.entries[0]!.attributes["aria-pressed"];
    expect(ariaProblems(facts, "ide")).toEqual([
      'palette: .djs-palette-entries has no role="toolbar"',
      'palette: 2 entries with tabindex="0", expected exactly one (roving tabindex)',
      'palette: tool "lasso-tool" has no aria-pressed',
    ]);
  });

  it("checks the zoom panel's shortcuts, readout and disabled state", () => {
    const facts = conformingAria();
    facts.zoomButtons.in!.attributes["aria-keyshortcuts"] = "Control+= Control+Plus";
    facts.zoomButtons.out!.disabled = true;
    facts.zoomButtons.actual!.attributes["aria-label"] = "Zoom to 100%";
    expect(ariaProblems(facts, "ide")).toEqual([
      'zoom: [data-zoom="out"] is natively disabled; aria-disabled keeps the focus (guide §5.8)',
      'zoom: [data-zoom="in"] aria-keyshortcuts is "Control+= Control+Plus", expected "Meta+= Meta+Plus" (mac)',
      'zoom: the readout\'s aria-label "Zoom to 100%" does not name the current zoom "86%"',
    ]);
  });

  it("checks DOM order, positive tabindex and native titles", () => {
    const facts = conformingAria();
    facts.order = ["menu", "canvas", "palette", "status", "problems", "zoom"];
    facts.positiveTabindex = ['button[data-chrome="menu"] (tabindex="2")'];
    facts.titled = ['div[data-chrome="zoom"]'];
    expect(ariaProblems(facts, "ide")).toEqual([
      "DOM order is menu, canvas, palette, status, problems, zoom; expected menu, palette, canvas, status, problems, zoom (guide §5.14)",
      'positive tabindex on button[data-chrome="menu"] (tabindex="2") (guide §5.14)',
      'div[data-chrome="zoom"] has a native title; the chrome tooltip replaces it (guide §5.6)',
    ]);
  });

  it("wants the tool's lang on an embedded root", () => {
    expect(ariaProblems(conformingAria(), "embedded")).toEqual([
      "root: an embedded shell root carries the tool's lang itself (guide §2, §12)",
    ]);
    expect(ariaProblems({ ...conformingAria(), rootLang: "en" }, "embedded")).toEqual([]);
  });
});

describe("the canvas name, the tab sequence, palette shortcuts and menu keys", () => {
  it("wants a name on the focusable canvas", () => {
    const facts = conformingAria();
    facts.canvas = element("svg", { tabindex: "0" });
    expect(ariaProblems(facts, "ide")).toEqual([
      'canvas: the focusable <svg> has no accessible name (WCAG 4.1.2); shellModule names it role="application" with messages.canvas',
    ]);
    facts.canvas = element("svg", { tabindex: "0", "aria-labelledby": "board-title" });
    expect(ariaProblems(facts, "ide")).toEqual([]);
  });

  it("accepts trigger → palette → canvas, with the web app's primary action first", () => {
    const palette = { description: "div.entry", kind: "palette" } as const;
    const canvas = { description: "svg", kind: "canvas" } as const;
    expect(
      tabSequenceProblems([palette, canvas, { description: "button", kind: "other" }]),
    ).toEqual([]);
    expect(
      tabSequenceProblems([{ description: "button", kind: "primary" }, palette, canvas]),
    ).toEqual([]);
  });

  it("names an extra tab stop between palette and canvas, and a palette Tab skips", () => {
    const extra = { description: 'div.djs-container[tabindex="0"]', kind: "other" } as const;
    expect(
      tabSequenceProblems([
        { description: "div.entry", kind: "palette" },
        extra,
        { description: "svg", kind: "canvas" },
      ]),
    ).toEqual([
      'tab order: Tab from the palette lands on div.djs-container[tabindex="0"], expected the canvas <svg> (an unexpected tab stop, guide §5.14)',
    ]);
    expect(tabSequenceProblems([extra])).toEqual([
      `tab order: Tab from the menu trigger lands on div.djs-container[tabindex="0"], expected the palette's roving entry (guide §5.14)`,
    ]);
  });

  it("wants aria-keyshortcuts on a palette entry whose tooltip shows a shortcut", () => {
    expect(
      paletteShortcutProblems([
        { action: "lasso-tool", chip: "L", keyShortcuts: "L" },
        { action: "hand-tool", chip: "H", keyShortcuts: null },
        { action: "create.box", chip: "", keyShortcuts: null },
      ]),
    ).toEqual([
      'palette: entry "hand-tool" shows the shortcut "H" in its tooltip but has no aria-keyshortcuts (guide §5.6)',
    ]);
  });

  it("wants a palette entry's aria-keyshortcuts to name keys, not characters", () => {
    expect(
      paletteShortcutProblems([
        { action: "lasso-tool", chip: "L", keyShortcuts: "Shift+?" },
        { action: "hand-tool", chip: "H", keyShortcuts: "Equal" },
        { action: "create.note", chip: "/", keyShortcuts: "/" },
        { action: "create.box", chip: "B", keyShortcuts: "B" },
        { action: "help", chip: "?", keyShortcuts: null },
        { action: "create.mention", chip: "@", keyShortcuts: "Shift+2" },
        { action: "create.list", chip: "[", keyShortcuts: null },
      ]),
    ).toEqual([
      'palette: entry "lasso-tool" has aria-keyshortcuts="Shift+?", which names the character "?", not a key (guide §5.6)',
      'palette: entry "hand-tool" has aria-keyshortcuts="Equal", a KeyboardEvent code; name the key as WAI-ARIA does (guide §5.6)',
      'palette: entry "create.note" has aria-keyshortcuts="/" for the chip "/", expected "/ Shift+7": the keys of the US, then the German layout (guide §5.6)',
      'palette: entry "help" has no aria-keyshortcuts for the chip "?", expected "Shift+/ Shift+ß": the keys of the US, then the German layout (guide §5.6)',
      'palette: entry "create.mention" shows the shortcut "@" on a character that needs AltGr or ⌥, sits on a dead key or is missing on the US or the German layout; guide §5.6 rules such a shortcut out',
      'palette: entry "create.list" shows the shortcut "[" on a character that needs AltGr or ⌥, sits on a dead key or is missing on the US or the German layout; guide §5.6 rules such a shortcut out',
    ]);
  });

  it("reports menu keys that reached a document listener", () => {
    const recorded = (key: string): RecordedKey => ({
      key,
      code: key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: true,
    });
    expect(menuKeysAtDocumentProblems(["ArrowUp", "ArrowDown"], [])).toEqual([]);
    expect(menuKeysAtDocumentProblems(["ArrowUp", "ArrowDown"], [recorded("ArrowDown")])).toEqual([
      "menu: ArrowDown in the open menu reached a keydown listener on document; a modeler's document keyboard acts on it (stop it at the menu, guide §5.4)",
    ]);
  });
});

describe("optionalIslandProblems", () => {
  it("checks pill, status box, legend and inspector once shown", () => {
    const facts: AriaFacts = {
      ...conformingAria(),
      problems: element("button", { "aria-label": "2 problems, 1 error" }, "2 problems"),
      status: element("div", { role: "alert", "data-severity": "danger" }, "Invalid"),
      legend: element("section", { "aria-labelledby": "cd-shell-legend-title-1" }),
      legendTitle: "Legend",
      legendClose: element("button", { "aria-label": "Close legend" }),
      inspector: element("aside", { "aria-label": "Properties" }),
    };
    const all = new Set(["problems", "status", "legend", "inspector"]);
    expect(optionalIslandProblems(facts, all)).toEqual([]);

    const broken: AriaFacts = {
      ...facts,
      problems: element("div", { "aria-label": "Problems" }, "2 problems"),
      status: element("div", { role: "status", "data-severity": "danger" }),
      legendTitle: null,
      inspector: element("div", {}),
    };
    expect(optionalIslandProblems(broken, all)).toEqual([
      "problems: the pill is a <div>, expected a <button>",
      'problems: the aria-label "Problems" does not contain the visible text "2 problems"',
      'status: role is "status" for data-severity="danger", expected "alert"',
      "legend: the card is not labelled by its title (aria-labelledby)",
      "inspector: a <div>, expected an <aside>",
      "inspector: the <aside> has no aria-label",
    ]);
  });

  it('expects role="status" for a warning and reports islands a hook did not show', () => {
    const facts: AriaFacts = {
      ...conformingAria(),
      status: element("div", { role: "status", "data-severity": "warning" }),
      inspector: { ...element("aside", { "aria-label": "Properties" }), visible: false },
    };
    expect(optionalIslandProblems(facts, new Set(["status", "inspector"]))).toEqual([
      "inspector: the inspector is not visible after show.inspector",
    ]);
  });
});

const noChip = { shortcut: "", keyShortcuts: null, description: "" };

function openMenu(overrides: Partial<MenuFacts> = {}): MenuFacts {
  return {
    expanded: "true",
    controls: "cd-shell-menu-1",
    menu: element("div", { id: "cd-shell-menu-1", role: "menu", "aria-label": "Menu" }),
    items: [
      {
        role: "menuitemradio",
        name: "Big picture",
        checked: "true",
        disabled: null,
        haspopup: null,
        group: "Level",
        ...noChip,
      },
      {
        role: "menuitemcheckbox",
        name: "Snap to grid",
        checked: "false",
        disabled: null,
        haspopup: null,
        group: null,
        ...noChip,
      },
      {
        role: "menuitem",
        name: "Export as PNG",
        checked: null,
        disabled: null,
        haspopup: null,
        group: null,
        ...noChip,
      },
      {
        role: "menuitem",
        name: "Keyboard shortcuts…",
        checked: null,
        disabled: null,
        haspopup: "dialog",
        group: null,
        ...noChip,
      },
    ],
    active: 0,
    activeIsTrigger: false,
    ...overrides,
  };
}

describe("menu checks", () => {
  it("accepts an open menu focused on its first entry", () => {
    expect(menuOpenProblems(openMenu(), "first")).toEqual([]);
    expect(menuOpenProblems(openMenu({ active: 3 }), "last")).toEqual([]);
  });

  it("reports state, names, groups and focus", () => {
    const facts = openMenu({
      expanded: "false",
      active: -1,
      items: [
        {
          role: "menuitemradio",
          name: "Big picture",
          checked: null,
          disabled: null,
          haspopup: null,
          group: null,
          ...noChip,
        },
        {
          role: "menuitem",
          name: "Keyboard shortcuts...",
          checked: null,
          disabled: null,
          haspopup: "dialog",
          group: null,
          ...noChip,
        },
        {
          role: "menuitem",
          name: "",
          checked: null,
          disabled: null,
          haspopup: null,
          group: null,
          ...noChip,
        },
      ],
    });
    expect(menuOpenProblems(facts, "first")).toEqual([
      'menu: aria-expanded is "false" while open, expected "true"',
      'menu: "Big picture" (menuitemradio) has aria-checked ""',
      'menu: radio "Big picture" is not in a labelled role="group"',
      'menu: "Keyboard shortcuts..." opens a dialog, so its label ends with "…" (U+2026)',
      "menu: item 3 has no accessible name",
      "menu: focus is on no entry, expected the first entry",
    ]);
  });

  it("requires that assistive technology hears a shortcut chip, by aria-keyshortcuts or the description", () => {
    const action = (overrides: Partial<MenuItemFacts>): MenuItemFacts => ({
      role: "menuitem",
      name: "Export as SVG",
      checked: null,
      disabled: null,
      haspopup: null,
      group: null,
      ...noChip,
      ...overrides,
    });
    const facts = openMenu({
      items: [
        action({ shortcut: "⌘E", keyShortcuts: "Meta+E" }),
        action({ name: "Go to diagram", shortcut: "G then D", description: "G then D" }),
        action({
          name: "Keyboard shortcuts…",
          haspopup: "dialog",
          shortcut: "?",
          keyShortcuts: "Shift+/ Shift+ß",
        }),
        action({ name: "Print", shortcut: "⌘P" }),
        action({
          name: "About",
          shortcut: "F1",
          keyShortcuts: "",
          description: "Version and licences",
        }),
      ],
    });
    expect(menuOpenProblems(facts, "first")).toEqual([
      'menu: "Print" shows the shortcut "⌘P" but names it neither in aria-keyshortcuts nor in its description (guide §5.6)',
      'menu: "About" shows the shortcut "F1" but names it neither in aria-keyshortcuts nor in its description (guide §5.6)',
    ]);
  });

  it("requires aria-keyshortcuts to name the keys of a chip's character, for US and German", () => {
    const dialog = (keyShortcuts: string, shortcut = "?"): MenuItemFacts => ({
      role: "menuitem",
      name: "Keyboard shortcuts…",
      checked: null,
      disabled: null,
      haspopup: "dialog",
      group: null,
      shortcut,
      keyShortcuts,
      description: "",
    });
    const problems = (item: MenuItemFacts) => menuOpenProblems(openMenu({ items: [item] }));
    expect(problems(dialog("Shift+/ Shift+ß"))).toEqual([]);
    expect(problems(dialog("?"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="?", which names the character "?", not a key; expected "Shift+/ Shift+ß" (guide §5.6)',
    ]);
    expect(problems(dialog("Shift+?"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="Shift+?", which names the character "?", not a key; expected "Shift+/ Shift+ß" (guide §5.6)',
    ]);
    expect(problems(dialog("Shift+/"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="Shift+/" for the chip "?", expected "Shift+/ Shift+ß": the keys of the US, then the German layout (guide §5.6)',
    ]);
    expect(problems(dialog("Shift+ß Shift+/"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="Shift+ß Shift+/" for the chip "?", expected "Shift+/ Shift+ß": the keys of the US, then the German layout (guide §5.6)',
    ]);
    expect(problems(dialog("Meta+= Meta+Plus", "⌘+"))).toEqual([]);
    expect(problems(dialog("Meta+Shift+= Meta+Plus", "⌘+"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="Meta+Shift+= Meta+Plus" for the chip "⌘+", expected "Meta+= Meta+Plus": the keys of the US, then the German layout (guide §5.6)',
    ]);
    expect(problems(dialog("Meta++", "⌘+"))).toEqual([
      'menu: "Keyboard shortcuts…" has aria-keyshortcuts="Meta++", which names the character "+", not a key; expected "Meta+= Meta+Plus" (guide §5.6)',
    ]);
    // The opt-out ariaKeyShortcuts: "" makes the chip the description, which §5.6 does not allow
    // for a character that needs ⇧.
    expect(problems({ ...dialog("", "?"), keyShortcuts: null, description: "?" })).toEqual([
      'menu: "Keyboard shortcuts…" has no aria-keyshortcuts for the chip "?", expected "Shift+/ Shift+ß": the keys of the US, then the German layout (guide §5.6)',
    ]);
    expect(
      problems({ ...dialog("", "G then D"), keyShortcuts: null, description: "G then D" }),
    ).toEqual([]);
    const ruledOut =
      'menu: "Keyboard shortcuts…" shows the shortcut "@" on a character that needs AltGr or ⌥, sits on a dead key or is missing on the US or the German layout; guide §5.6 rules such a shortcut out';
    expect(problems({ ...dialog("", "@"), keyShortcuts: null, description: "@" })).toEqual([
      ruledOut,
    ]);
    expect(problems(dialog("Shift+2", "@"))).toEqual([ruledOut]);
  });

  it("requires the closed menu to hand the focus back to the trigger", () => {
    const closed = openMenu({
      expanded: "false",
      menu: null,
      items: [],
      active: -1,
      activeIsTrigger: true,
    });
    expect(menuClosedProblems(closed, true)).toEqual([]);
    expect(menuClosedProblems({ ...closed, activeIsTrigger: false }, true)).toEqual([
      "menu: Escape did not return the focus to the trigger",
    ]);
  });
});

describe("keyReachProblem", () => {
  const key = (defaultPrevented: boolean): RecordedKey => ({
    key: "=",
    code: "Equal",
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented,
  });

  it.each([
    ["handled", "ide", [], true],
    ["handled", "ide", [key(true)], false],
    ["blocked", "ide", [], true],
    ["canvas", "ide", [key(true)], false],
    ["free", "ide", [key(false)], true],
    ["free", "ide", [], false],
    ["handled", "web", [key(true)], true],
    ["handled", "web", [key(false)], false],
    ["handled", "embedded", [], false],
    ["blocked", "web", [key(false)], true],
    ["blocked", "embedded", [key(true)], false],
    ["canvas", "web", [key(true)], true],
    ["free", "web", [key(true)], false],
    ["free", "web", [key(false), key(false)], false],
  ] as const)(
    "%s key in the %s host, window saw %j: conforming %s",
    (reach, host, recorded, conforming) => {
      const problem = keyReachProblem("Control+Equal", reach as KeyReach, host, { keys: recorded });
      if (conforming) expect(problem).toBeUndefined();
      else expect(problem).toEqual(expect.any(String));
    },
  );

  it("names VS Code for a key that reaches window in the IDE host", () => {
    expect(
      keyReachProblem("Control+Equal on the canvas", "handled", "ide", { keys: [key(true)] }),
    ).toBe(
      "Control+Equal on the canvas reached a keydown listener on window; in the IDE host the shell stops it on document, or VS Code runs it again (guide §13.5)",
    );
  });

  it("reads preventDefault on document where the IDE host stops the key", () => {
    const stopped = (prevented: boolean) => ({ keys: [], documentKeys: [key(prevented)] });
    expect(keyReachProblem("Control+Equal", "handled", "ide", stopped(true))).toBeUndefined();
    expect(keyReachProblem("Control+Equal", "handled", "ide", stopped(false))).toBe(
      "Control+Equal was stopped but not prevented; a handled key also calls preventDefault",
    );
    expect(
      keyReachProblem("Control+KeyZ in a text field", "blocked", "ide", stopped(false)),
    ).toBeUndefined();
    expect(keyReachProblem("Control+KeyZ in a text field", "blocked", "ide", stopped(true))).toBe(
      "Control+KeyZ in a text field was prevented; the shell only stops it, so the field, dialog or browser still acts (guide §13.5)",
    );
  });
});

describe("expectedAppearance", () => {
  it("never shows a mode the modeler cannot show, and lets high contrast through", () => {
    expect(expectedAppearance({ theme: "dark" }, ["light"])).toEqual({ theme: "light" });
    expect(expectedAppearance({ theme: "dark", kontrast: "hoch" }, ["light"])).toEqual({
      theme: "light",
      kontrast: "hoch",
    });
    expect(expectedAppearance({ theme: "dark" }, ["light", "dark"])).toEqual({ theme: "dark" });
    expect(() => expectedAppearance({ theme: "dark" }, [])).toThrow(/harness.themes is empty/);
  });
});

const LIGHT_ROLES = {
  "--cd-ui-grund": "#F7F7F7",
  "--cd-ui-text": "#1D1D1D",
  "--cd-ui-flaeche-hoch": "#FFFFFF",
  "--cd-ui-linie": "#E0E0E0",
};

function part(
  name: string,
  colorScheme = "light",
  roles: Record<string, string> = LIGHT_ROLES,
): ModeFacts {
  return { name, description: name, colorScheme, roles: { ...roles } };
}

function appearance(overrides: Partial<AppearanceFacts> = {}): AppearanceFacts {
  return {
    documentClasses: ["cd-shell-document"],
    themed: [
      {
        description: "html",
        isDocument: true,
        relation: "ancestor",
        theme: "light",
        kontrast: "hoch",
      },
    ],
    parts: ["root", "canvas", "menu", "palette", "zoom", "dropdown", "tooltip"].map((name) =>
      part(name),
    ),
    ...overrides,
  };
}

describe("appearanceProblems", () => {
  const darkHigh = { theme: "dark", kontrast: "hoch" } as const;

  it("accepts a light-only modeler that stays light with high contrast", () => {
    expect(appearanceProblems(appearance(), "ide", darkHigh, ["light"])).toEqual({ problems: [] });
  });

  it("reports a dark subtree as half-dark", () => {
    const facts = appearance();
    facts.themed.push({
      description: 'div[data-chrome="zoom"]',
      isDocument: false,
      relation: "descendant",
      theme: "dark",
      kontrast: null,
    });
    facts.parts[4] = part("zoom", "dark", { ...LIGHT_ROLES, "--cd-ui-text": "#FFFFFF" });
    expect(appearanceProblems(facts, "ide", darkHigh, ["light"]).problems).toEqual([
      'div[data-chrome="zoom"] carries data-cd-theme="dark": a second mode inside the modeler is half-dark (guide §13.5)',
      'zoom: color-scheme is "dark" (requested dark + hoch, expected light + hoch)',
      'zoom: --cd-ui-text resolves to "#FFFFFF", the root to "#1D1D1D" (half-dark)',
    ]);
  });

  it("keeps the attributes on <html> alone in an own document", () => {
    const facts = appearance();
    facts.themed.push({
      description: "div.cd-shell",
      isDocument: false,
      relation: "self",
      theme: "light",
      kontrast: "hoch",
    });
    expect(appearanceProblems(facts, "ide", darkHigh, ["light"]).problems).toEqual([
      'div.cd-shell repeats data-cd-theme="light" data-cd-kontrast="hoch": in an own document the attributes stand only on <html> (guide §13.5)',
    ]);
  });

  it("wants the attributes on <html> in an own document, always", () => {
    const facts = appearance({
      themed: [],
      parts: appearance().parts.map((entry) => ({ ...entry, colorScheme: "normal" })),
    });
    expect(appearanceProblems(facts, "ide", { theme: "dark" }, ["light"]).problems).toEqual([
      '<html> has no data-cd-theme (requested dark, expected light); the host always writes it, also "light" (guide §13.3)',
    ]);
    const wrong = appearance({
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "dark",
          kontrast: null,
        },
      ],
    });
    expect(appearanceProblems(wrong, "web", darkHigh, ["light"]).problems).toEqual([
      'html has data-cd-theme="dark" (requested dark + hoch, expected light + hoch)',
      "html has no data-cd-kontrast (requested dark + hoch, expected light + hoch)",
    ]);
  });

  it("reports the own-document class in the wrong host", () => {
    expect(
      appearanceProblems(appearance({ documentClasses: [] }), "ide", darkHigh, ["light"]).problems,
    ).toEqual([
      "<html> lacks cd-shell-document in an own document (the reset of the webview's host styles)",
    ]);
    const embedded = appearance({
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "dark",
          kontrast: "hoch",
        },
        {
          description: "div.cd-shell",
          isDocument: false,
          relation: "self",
          theme: "light",
          kontrast: "hoch",
        },
      ],
    });
    expect(appearanceProblems(embedded, "embedded", darkHigh, ["light"]).problems).toEqual([
      "<html> of a foreign page carries cd-shell-document: the own-document reset restyles the host page",
    ]);
  });

  it("wants an embedded root to carry its own mode: without, it takes a dark page's", () => {
    const facts = appearance({
      documentClasses: [],
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "dark",
          kontrast: null,
        },
      ],
      parts: appearance().parts.map((entry) => ({ ...entry, colorScheme: "dark" })),
    });
    expect(appearanceProblems(facts, "embedded", { theme: "dark" }, ["light"]).problems).toEqual([
      "the embedded root has no data-cd-theme (host page dark, expected light): it takes the host page's mode instead of its own (guide §13.3)",
      'root: color-scheme is "dark" (host page dark, expected light)',
      'canvas: color-scheme is "dark" (host page dark, expected light)',
      'menu: color-scheme is "dark" (host page dark, expected light)',
      'palette: color-scheme is "dark" (host page dark, expected light)',
      'zoom: color-scheme is "dark" (host page dark, expected light)',
      'dropdown: color-scheme is "dark" (host page dark, expected light)',
      'tooltip: color-scheme is "dark" (host page dark, expected light)',
    ]);
  });

  it("keeps an embedded root in its first mode under a dark page and takes the page's contrast over", () => {
    const root = (kontrast: string | null) => ({
      description: "div.cd-shell",
      isDocument: false,
      relation: "self" as const,
      theme: "light",
      kontrast,
    });
    const page = (kontrast: string | null) => ({
      description: "html",
      isDocument: true,
      relation: "ancestor" as const,
      theme: "dark",
      kontrast,
    });
    const embedded = (themed: AppearanceFacts["themed"]) =>
      appearance({ documentClasses: [], themed });
    expect(
      appearanceProblems(embedded([page("hoch"), root("hoch")]), "embedded", darkHigh, ["light"]),
    ).toEqual({
      problems: [],
    });
    expect(
      appearanceProblems(embedded([page("hoch"), root("hoch")]), "embedded", darkHigh, [
        "light",
        "dark",
      ]),
    ).toEqual({ problems: [] });
    expect(
      appearanceProblems(embedded([page("hoch"), root(null)]), "embedded", darkHigh, ["light"])
        .problems,
    ).toEqual([
      "div.cd-shell has no data-cd-kontrast (host page dark + hoch, expected light + hoch)",
    ]);
    expect(
      appearanceProblems(embedded([page(null), root("hoch")]), "embedded", { theme: "dark" }, [
        "light",
      ]).problems,
    ).toEqual(['div.cd-shell has data-cd-kontrast="hoch" (host page dark, expected light)']);
  });

  it("requires the dropdown and tooltip to have been checked and the tokens to be loaded", () => {
    const facts = appearance({
      parts: [
        part("root", "light", { "--cd-ui-text": "" }),
        part("zoom", "light", { "--cd-ui-text": "" }),
      ],
    });
    expect(appearanceProblems(facts, "ide", darkHigh, ["light"]).problems).toEqual([
      "--cd-ui-text is empty at the shell root: the vendored cd-tokens.generated.css is not loaded",
      "dropdown: not visible when the kit opened it, so its mode was not checked",
      "tooltip: not visible when the kit opened it, so its mode was not checked",
    ]);
  });

  it("expects dark everywhere from a modeler that can show it", () => {
    const facts = appearance({
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "dark",
          kontrast: null,
        },
      ],
      parts: appearance().parts.map((entry) => ({ ...entry, colorScheme: "dark" })),
    });
    expect(appearanceProblems(facts, "ide", { theme: "dark" }, ["light", "dark"])).toEqual({
      problems: [],
    });
  });
});

function leftovers(overrides: Partial<LeftoverFacts> = {}): LeftoverFacts {
  return {
    classedElements: [],
    documentClasses: ["cd-shell-document"],
    chromeElements: [],
    rootClasses: [],
    rootAttributes: ["id"],
    errors: [],
    ...overrides,
  };
}

describe("leftoverProblems", () => {
  it("accepts a clean page and the host's own document class", () => {
    expect(leftoverProblems(leftovers(), "ide")).toEqual([]);
  });

  it("reports elements, classes, attributes and errors the shell left", () => {
    const facts = leftovers({
      classedElements: ["div.cd-shell-tooltip"],
      documentClasses: ["cd-shell-document", "cd-shell-no-transition"],
      chromeElements: ['div.cd-shell-zoom[data-chrome="zoom"]'],
      rootClasses: ["cd-shell"],
      rootAttributes: ["id", "data-palette", "data-cd-shell-host"],
      errors: [
        "ResizeObserver loop completed with undelivered notifications.",
        "TypeError: x is null",
      ],
    });
    expect(leftoverProblems(facts, "embedded")).toEqual([
      "div.cd-shell-tooltip is left after destroy",
      "<html> keeps the class cd-shell-document after destroy",
      "<html> keeps the class cd-shell-no-transition after destroy",
      'div.cd-shell-zoom[data-chrome="zoom"] is left after destroy',
      "the root keeps the class cd-shell after destroy",
      "the root keeps data-palette after destroy",
      "the root keeps data-cd-shell-host after destroy",
      "the page reported an error after destroy: TypeError: x is null",
    ]);
  });

  it("wants an embedded root to drop its own mode, an own document's root has none to drop", () => {
    const facts = leftovers({ rootAttributes: ["id", "data-cd-theme", "data-cd-kontrast"] });
    expect(leftoverProblems(facts, "embedded")).toEqual([
      "<html> keeps the class cd-shell-document after destroy",
      "the root keeps data-cd-theme after destroy",
      "the root keeps data-cd-kontrast after destroy",
    ]);
    expect(leftoverProblems(facts, "ide")).toEqual([]);
  });
});

describe("afterDestroyKeyProblem", () => {
  const recorded = (defaultPrevented: boolean): RecordedKey[] => [
    {
      key: "=",
      code: "Equal",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented,
    },
  ];

  it("wants every chrome key to pass untouched once the shell is gone", () => {
    expect(afterDestroyKeyProblem("Control+Equal", recorded(false))).toBeUndefined();
    expect(afterDestroyKeyProblem("Control+Equal", recorded(true))).toMatch(/still installed/);
    expect(afterDestroyKeyProblem("Control+Equal", [])).toMatch(/still stops it/);
  });
});

describe("absent islands and the harness's own consistency", () => {
  it("names only the islands of absent, never its invalid state", () => {
    expect(absentIslands(["invalid", "inspector", "legend"])).toEqual(["legend", "inspector"]);
    expect(absentIslands(undefined)).toEqual([]);
  });

  it("reports an absent island that shows anyway", () => {
    expect(
      absentIslandProblems(new Set(["menu", "palette", "legend"]), ["legend", "inspector"]),
    ).toEqual(["legend: visible, but harness.absent says the modeler has no legend"]);
    expect(absentIslandProblems(new Set(["legend"]), undefined)).toEqual([]);
  });

  it("reports a hook the harness both gives and declares absent", () => {
    const hook = async () => {};
    const harness = {
      host: "ide" as const,
      themes: ["light" as const],
      open: hook,
      show: { legend: hook, invalid: hook },
      absent: ["legend", "inspector", "invalid"] as const,
    };
    expect(harnessHookProblems(harness, ["legend", "inspector", "problems", "status"])).toEqual([
      'harness: absent lists "legend", but show.legend is given',
    ]);
    expect(harnessHookProblems(harness, ["invalid"])).toEqual([
      'harness: absent lists "invalid", but show.invalid is given',
    ]);
    const withoutMenuAction = {
      ...harness,
      absent: ["canvasMenuAction", "problemSelection"] as const,
    };
    expect(
      harnessHookProblems(withoutMenuAction, ["canvasMenuAction", "problemSelection"]),
    ).toEqual([]);
  });

  it("reports a label editor the harness both gives and declares absent", () => {
    const harness = {
      host: "ide" as const,
      themes: ["light" as const],
      open: async () => {},
      labelEditor: { open: async () => "Renamed", documentChanged: async () => false },
      absent: ["labelEditor"] as const,
    };
    expect(harnessHookProblems(harness, ["labelEditor"])).toEqual([
      'harness: absent lists "labelEditor", but harness.labelEditor is given',
    ]);
    expect(harnessHookProblems({ ...harness, labelEditor: undefined }, ["labelEditor"])).toEqual(
      [],
    );
  });
});

describe("surroundProblems", () => {
  const grund = "rgb(249, 247, 247)";

  it("accepts a surround painted in --cd-ui-grund", () => {
    expect(
      surroundProblems({
        container: true,
        painted: { description: "div.cd-shell-canvas", color: grund },
        grund,
      }),
    ).toEqual([]);
  });

  it("names the painting element and both colours when the surround leaves the mode", () => {
    expect(
      surroundProblems({
        container: true,
        painted: { description: "div.djs-container", color: "rgb(8, 10, 32)" },
        grund,
      }),
    ).toEqual([
      "canvas surround: div.djs-container paints rgb(8, 10, 32), but --cd-ui-grund resolves to rgb(249, 247, 247); the surround follows the mode (guide §10.1)",
    ]);
  });

  it("wants something to paint the surround, and a canvas to check", () => {
    expect(surroundProblems({ container: true, painted: null, grund })).toEqual([
      expect.stringMatching(
        /nothing from \.djs-container out to the root paints a background colour/,
      ),
    ]);
    expect(surroundProblems({ container: false, painted: null, grund })).toEqual([
      "canvas surround: no .djs-container in the root to check",
    ]);
  });
});

const ROLES = {
  text: "rgb(29, 29, 29)",
  interaktion: "rgb(51, 93, 229)",
  textLeise: "rgb(107, 102, 102)",
};

function colorEntry(overrides: Partial<PaletteColorEntry> = {}): PaletteColorEntry {
  return {
    action: "lasso-tool",
    group: "tools",
    pressed: false,
    disabled: false,
    hovered: false,
    color: ROLES.text,
    icon: { kind: "svg", color: ROLES.text },
    ...overrides,
  };
}

function colors(entries: PaletteColorEntry[]): PaletteColorFacts {
  return { roles: ROLES, entries };
}

describe("paletteColorProblems", () => {
  it("tells tools from notation previews by group and action", () => {
    expect(isToolEntry({ action: "lasso-tool", group: "tools" })).toBe(true);
    expect(isToolEntry({ action: "space-tool", group: "edit" })).toBe(true);
    expect(isToolEntry({ action: "drawing", group: "tools" })).toBe(true);
    expect(isToolEntry({ action: "create.box", group: "shapes" })).toBe(false);
  });

  it("accepts text at rest and pressed, interaktion hovered, text-leise disabled", () => {
    expect(
      paletteColorProblems(
        colors([
          colorEntry(),
          colorEntry({ action: "hand-tool", pressed: true }),
          colorEntry({
            action: "space-tool",
            hovered: true,
            color: ROLES.interaktion,
            icon: { kind: "::before", color: ROLES.interaktion },
          }),
          colorEntry({
            action: "drawing-tool",
            pressed: true,
            hovered: true,
            color: ROLES.interaktion,
            icon: { kind: "svg", color: ROLES.interaktion },
          }),
          colorEntry({
            action: "connect-tool",
            disabled: true,
            hovered: true,
            color: ROLES.textLeise,
            icon: null,
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("exempts notation previews, which keep their colours", () => {
    expect(
      paletteColorProblems(
        colors([
          colorEntry({
            action: "create.box",
            group: "shapes",
            color: "rgb(255, 0, 0)",
            icon: null,
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it("reports a renderer colour on the armed tool's icon and on a hovered entry", () => {
    expect(
      paletteColorProblems(
        colors([
          colorEntry({ pressed: true, icon: { kind: "svg", color: "rgb(29, 30, 33)" } }),
          colorEntry({ action: "hand-tool", hovered: true, color: ROLES.text, icon: null }),
          colorEntry({
            action: "space-tool",
            disabled: true,
            icon: { kind: "::before", color: ROLES.textLeise },
          }),
        ]),
      ),
    ).toEqual([
      'palette: the <svg> icon of tool "lasso-tool" pressed has color rgb(29, 30, 33), expected --cd-ui-text (rgb(29, 29, 29)); a renderer rule overrides the skin (guide §5.5)',
      'palette: tool "hand-tool" hovered has color rgb(29, 29, 29), expected --cd-ui-interaktion (rgb(51, 93, 229)) (guide §5.5)',
      'palette: tool "space-tool" aria-disabled has color rgb(29, 29, 29), expected --cd-ui-text-leise (rgb(107, 102, 102)) (guide §5.5)',
    ]);
  });
});

function shape(id: string, overrides: Partial<ShapeFacts> = {}): ShapeFacts {
  return {
    id,
    selected: false,
    transform: "matrix(1 0 0 1 100 100)",
    size: { width: 120, height: 80 },
    box: { left: 580, top: 410, width: 120, height: 80 },
    client: { x: 640, y: 450 },
    hit: true,
    ...overrides,
  };
}

const CANVAS: CanvasStateFacts = {
  focusInCanvas: true,
  focused: "svg",
  contextPadEntries: [],
  textFields: [],
};

function created(overrides: Partial<CreateFacts> = {}): CreateFacts {
  return {
    entry: "create.box",
    before: [shape("a")],
    after: [shape("a"), shape("b", { selected: true })],
    canvas: CANVAS,
    free: { left: 24, top: 88, right: 1256, bottom: 836 },
    ...overrides,
  };
}

describe("legendStartProblems", () => {
  it.each([
    [390, 844],
    [441, 900],
    [1280, 900],
  ])("accepts a legend closed on first load at %i × %i", (width, height) => {
    expect(legendStartProblems({ container: { width, height }, open: false })).toEqual([]);
  });

  it("reports a legend that opens on first load on a phone", () => {
    expect(legendStartProblems({ container: { width: 390, height: 844 }, open: true })).toEqual([
      "legend: open on first load in a 390 × 844 container; without a stored state it starts closed in every container, and only a stored legend.open opens it on mount (guide §5.10)",
    ]);
  });

  it.each([
    [441, 900],
    [1280, 900],
  ])(
    "reports a legend that opens on first load above 440px and 820px, as 0.4 did (%i × %i)",
    (width, height) => {
      expect(legendStartProblems({ container: { width, height }, open: true })).toEqual([
        `legend: open on first load in a ${width} × ${height} container; without a stored state it starts closed in every container, and only a stored legend.open opens it on mount (guide §5.10)`,
      ]);
    },
  );
});

describe("keptDocumentProblems", () => {
  it("accepts an open that loaded a new document", () => {
    expect(keptDocumentProblems({ width: 441, height: 900 }, false)).toEqual([]);
  });

  it("blames the harness for an open that kept the page's document", () => {
    expect(keptDocumentProblems({ width: 441, height: 900 }, true)).toEqual([
      'harness: open kept the page\'s document at 441 × 900 (a navigation that changes only the URL fragment keeps it), so the shell did not mount again and the legend kept its earlier start state; open loads a new document, as on a first visit (for example after page.goto("about:blank"))',
    ]);
  });
});

describe("focusHandBackProblems", () => {
  const onCanvas = { focused: "svg", canvas: true, control: false };
  const onControl = { focused: "button.cd-shell-target", canvas: false, control: true };

  it("accepts the canvas after a pointer click and the control after Enter or Space", () => {
    expect(
      focusHandBackProblems([
        { control: "zoom in", by: "pointer", focus: onCanvas },
        { control: 'palette tool "lasso-tool"', by: "pointer", focus: onCanvas },
        { control: "zoom in", by: "Enter", focus: onControl },
        { control: "zoom in", by: "Space", focus: onControl },
      ]),
    ).toEqual([]);
  });

  it("reports a click that leaves the focus off the canvas, and a key that moves it", () => {
    expect(
      focusHandBackProblems([
        { control: "fit", by: "pointer", focus: onControl },
        {
          control: 'palette tool "lasso-tool"',
          by: "pointer",
          focus: { ...onControl, focused: "div.entry", control: false },
        },
        { control: "zoom in", by: "Enter", focus: onCanvas },
        {
          control: "zoom in",
          by: "Space",
          focus: { focused: "<body>", canvas: false, control: false },
        },
      ]),
    ).toEqual([
      "focus: after a click on fit the focus is on button.cd-shell-target, expected the canvas <svg>, so its keys act at once (guide §5.8)",
      'focus: after a click on palette tool "lasso-tool" the focus is on div.entry, expected the canvas <svg>, so its keys act at once (guide §5.8)',
      "focus: after Enter on zoom in the focus is on svg, expected it to stay on zoom in, so the next press acts again (guide §5.8)",
      "focus: after Space on zoom in the focus is on <body>, expected it to stay on zoom in, so the next press acts again (guide §5.8)",
    ]);
  });

  it("wants a clicked File or Model action on the canvas and Enter on it back on the trigger (guide §5.4)", () => {
    const onTrigger = {
      focused: 'button.cd-shell-menu-trigger[data-chrome="menu"]',
      canvas: false,
      control: true,
    };
    const control = 'menu entry "New diagram"';
    expect(
      focusHandBackProblems([
        { control, by: "pointer", focus: onCanvas, menuEntry: true },
        { control, by: "Enter", focus: onTrigger, menuEntry: true },
      ]),
    ).toEqual([]);
    expect(
      focusHandBackProblems([
        { control, by: "pointer", focus: onTrigger, menuEntry: true },
        { control, by: "Enter", focus: onCanvas, menuEntry: true },
      ]),
    ).toEqual([
      'focus: after a click on menu entry "New diagram" the focus is on button.cd-shell-menu-trigger[data-chrome="menu"], expected the canvas <svg>, so its keys act at once (guide §5.4, §5.8)',
      'focus: after Enter on menu entry "New diagram" the focus is on svg, expected the menu trigger, where the keyboard left the menu (guide §5.4)',
    ]);
  });
});

describe("focusHandBackProblems for the primary action (guide §5.7)", () => {
  const onCanvas = { focused: "svg", canvas: true, control: false };
  const onButton = {
    focused: 'button.cd-shell-primary[data-chrome="primary"]',
    canvas: false,
    control: true,
  };
  const control = 'the primary action "Share"';

  it("accepts the canvas after a pointer click and the button after Enter or Space", () => {
    expect(
      focusHandBackProblems([
        { control, by: "pointer", focus: onCanvas, primaryAction: true },
        { control, by: "Enter", focus: onButton, primaryAction: true },
        { control, by: "Space", focus: onButton, primaryAction: true },
      ]),
    ).toEqual([]);
  });

  it("reports a click that keeps the focus on the button, and a key that moves it", () => {
    expect(
      focusHandBackProblems([
        { control, by: "pointer", focus: onButton, primaryAction: true },
        { control, by: "Enter", focus: onCanvas, primaryAction: true },
      ]),
    ).toEqual([
      'focus: after a click on the primary action "Share" the focus is on button.cd-shell-primary[data-chrome="primary"], expected the canvas <svg>, so its keys act at once (guide §5.7, §5.8)',
      'focus: after Enter on the primary action "Share" the focus is on svg, expected it to stay on the primary action "Share", so the next press acts again (guide §5.7, §5.8)',
    ]);
  });
});

describe("isCanvasMenuAction", () => {
  const entry = (overrides: Partial<MenuEntryFacts>): MenuEntryFacts => ({
    name: "New diagram",
    role: "menuitem",
    menuId: "new-diagram",
    disabled: false,
    group: "file",
    value: null,
    checked: null,
    icon: true,
    popup: null,
    keyShortcuts: null,
    shortcut: null,
    danger: false,
    ...overrides,
  });

  it("takes the enabled File and Model actions without a dialog", () => {
    expect(isCanvasMenuAction(entry({}))).toBe(true);
    expect(isCanvasMenuAction(entry({ group: "model", menuId: "arrange" }))).toBe(true);
  });

  it("leaves out Export and Help, dialogs, toggles, locked and destructive entries", () => {
    expect(isCanvasMenuAction(entry({ group: "export" }))).toBe(false);
    expect(isCanvasMenuAction(entry({ group: "help" }))).toBe(false);
    expect(isCanvasMenuAction(entry({ popup: "dialog" }))).toBe(false);
    expect(isCanvasMenuAction(entry({ role: "menuitemcheckbox", group: "model" }))).toBe(false);
    expect(isCanvasMenuAction(entry({ disabled: true }))).toBe(false);
    expect(isCanvasMenuAction(entry({ danger: true }))).toBe(false);
    expect(isCanvasMenuAction(entry({ menuId: null }))).toBe(false);
  });
});

describe("label editor checks (contract L5, and the keep-open it recommends)", () => {
  const EDITING: LabelEditorFacts = {
    editing: true,
    focused: "textarea.demo-label-editor",
    text: "Renamed box 1",
    view: "1 0 0 1 10 20",
  };

  function step(overrides: Partial<Parameters<typeof labelEditorStepProblems>[0]> = {}) {
    return {
      step: "a click on Fit",
      typed: "Renamed box 1",
      viewBefore: "1.35 0 0 1.35 -40 -60",
      after: EDITING,
      documentChanged: false,
      ...overrides,
    };
  }

  it("accepts an open editor holding the typed text, the document unchanged", () => {
    expect(labelEditorOpenProblems("Renamed box 1", EDITING, false)).toEqual([]);
    expect(labelEditorOpenProblems("box 1", EDITING, false)).toEqual([]);
  });

  it("reports an open that typed nothing, left no editor or not the typed text, or already changed the document", () => {
    expect(labelEditorOpenProblems("", EDITING, false)).toEqual([
      "label editor: labelEditor.open typed nothing, so the case would prove nothing",
    ]);
    expect(
      labelEditorOpenProblems(
        "Renamed box 1",
        { ...EDITING, editing: false, focused: "svg", text: "" },
        false,
      ),
    ).toEqual([
      'label editor: after labelEditor.open the focus is on svg, expected the label editor (a text field) holding "Renamed box 1"',
    ]);
    expect(labelEditorOpenProblems("Renamed box 2", EDITING, true)).toEqual([
      'label editor: after labelEditor.open the focused field holds "Renamed box 1", expected the typed "Renamed box 2"',
      "label editor: labelEditor.documentChanged reports a change right after labelEditor.open; typing alone changes no document, so it counts from the moment open resolved",
    ]);
  });

  it("accepts a view change that keeps the editor open with the typed text", () => {
    expect(labelEditorStepProblems(step())).toEqual([]);
  });

  it("reports a commit, and only the commit, when the view change wrote the label", () => {
    expect(
      labelEditorStepProblems(
        step({ documentChanged: true, after: { ...EDITING, editing: false, text: "" } }),
      ),
    ).toEqual([
      "label editor: a click on Fit committed the open label editor (labelEditor.documentChanged); a view change the host makes never commits it (contract L5)",
    ]);
  });

  it("reports an editor the view change closed or emptied without a commit", () => {
    expect(
      labelEditorStepProblems(
        step({ after: { ...EDITING, editing: false, focused: "<body>", text: "" } }),
      ),
    ).toEqual([
      'label editor: after a click on Fit the focus is on <body>, not in the label editor; it stays open with the typed "Renamed box 1" (L5 recommends it, the shell kit requires it)',
    ]);
    expect(labelEditorStepProblems(step({ after: { ...EDITING, text: "" } }))).toEqual([
      'label editor: after a click on Fit the focused field holds "", expected the typed "Renamed box 1" (L5 recommends it, the shell kit requires it)',
    ]);
  });

  it("reports a step that left the view as it was, which proves nothing", () => {
    expect(labelEditorStepProblems(step({ viewBefore: EDITING.view }))).toEqual([
      "label editor: a click on Fit left the view as it was, so it proved nothing about a view change",
    ]);
    expect(labelEditorStepProblems(step({ after: { ...EDITING, view: null } }))).toEqual([
      "label editor: a click on Fit left the view as it was, so it proved nothing about a view change",
    ]);
  });

  it("tells a view at 100 % from one a zoom step or a fit left elsewhere", () => {
    // 100 % as one zoom step from a fit at 74 % leaves it, then the 74 % and 135 % steps
    expect(isViewAtActualSize("1 0 0 1 -112.5 41")).toBe(true);
    expect(isViewAtActualSize(" 1 0 0 1 0 0 ")).toBe(true);
    expect(isViewAtActualSize("0.741 0 0 0.741 4.2 -8")).toBe(false);
    expect(isViewAtActualSize("1.349 0 0 1.349 -40 -60")).toBe(false);
    expect(isViewAtActualSize("1 0 0 0.5 0 0")).toBe(false);
  });

  it("takes only an exact 1 in the probe's three decimals for 100 %, as the shell's Cmd/Ctrl+0 does", () => {
    // Cmd/Ctrl+0 leaves only a zoom of exactly 1 as it is and resets these, so they need no extra step
    expect(isViewAtActualSize("0.999 0 0 0.999 0 0")).toBe(false);
    expect(isViewAtActualSize("1.001 0 0 1.001 0 0")).toBe(false);
  });

  it("does not take a view it cannot read as a matrix for 100 %", () => {
    expect(isViewAtActualSize(null)).toBe(false);
    expect(isViewAtActualSize("")).toBe(false);
    expect(isViewAtActualSize("matrix(1, 0, 0, 1, 0, 0)")).toBe(false);
    expect(isViewAtActualSize("1 0 0 1 0")).toBe(false);
  });

  it("wants the user's commit after the view changes to show in documentChanged", () => {
    expect(labelEditorCommitProblems(true)).toEqual([]);
    expect(labelEditorCommitProblems(false)).toEqual([
      "label editor: a click on an empty spot of the canvas after the view changes left labelEditor.documentChanged false, so the case proved nothing; open types text the element's label does not hold yet, and documentChanged reports the commit a click elsewhere makes",
    ]);
  });
});

describe("createProblems", () => {
  it("accepts one selected element centred in the free rectangle, the canvas focused", () => {
    expect(createProblems(created())).toEqual([]);
  });

  it("reports an Enter that places nothing, or more than one element", () => {
    expect(createProblems(created({ after: [shape("a")] }))).toEqual([
      'create: Enter on palette entry "create.box" added no element; Enter on a creating entry places it in the centre of the free rectangle (guide §5.5)',
    ]);
    expect(createProblems(created({ after: [shape("a"), shape("b"), shape("c")] }))).toEqual([
      'create: Enter on palette entry "create.box" added 2 elements (b, c), expected exactly one',
    ]);
  });

  it("wants the new element selected, the canvas focused and the centre in the free rectangle", () => {
    expect(
      createProblems(
        created({
          after: [shape("a"), shape("b", { box: { left: 0, top: 0, width: 40, height: 40 } })],
          canvas: {
            ...CANVAS,
            focusInCanvas: false,
            focused: 'div.entry[data-action="create.box"]',
          },
        }),
      ),
    ).toEqual([
      'create: the new element "b" is not selected (guide §5.5)',
      'create: after Enter on palette entry "create.box" the focus is on div.entry[data-action="create.box"], expected the canvas (its <svg> or the label editor, guide §5.5)',
      'create: the new element "b" is centred at (20, 20)px, outside the free rectangle 24–1256 × 88–836px (guide §5.5, §5.9)',
    ]);
  });

  it("allows the geometry tolerance at the free rectangle's edge", () => {
    const atEdge = shape("b", { selected: true, box: { left: 3, top: 67, width: 40, height: 40 } });
    expect(createProblems(created({ after: [shape("a"), atEdge] }))).toEqual([]);
  });
});

describe("read-only checks", () => {
  const status = (role: string, visible = true): ElementFacts => ({
    ...element("div", { "data-chrome": "status", role, "data-severity": "danger" }),
    visible,
  });

  it("wants data-readonly on the root and the status box as an alert", () => {
    expect(readOnlyStateProblems({ readOnly: true, status: status("alert") })).toEqual([]);
    expect(readOnlyStateProblems({ readOnly: false, status: status("status") })).toEqual([
      "read-only: the root has no data-readonly 800ms after show.invalid",
      'read-only: the status box of an invalid file has role "status", expected "alert" (guide §13.5)',
    ]);
    expect(readOnlyStateProblems({ readOnly: true, status: null })).toEqual([
      "read-only: the status box is not visible 800ms after show.invalid (guide §5.12)",
    ]);
  });

  const entry = (action: string, disabled: boolean, group = "tools"): PaletteEntryState => ({
    action,
    group,
    pressed: false,
    disabled,
    client: { x: 0, y: 0 },
  });

  it("wants every palette entry aria-disabled but Lasso and Hand", () => {
    expect(
      readOnlyPaletteProblems([
        entry("lasso-tool", false),
        entry("hand-tool", false),
        entry("space-tool", true),
        entry("create.box", true, "shapes"),
      ]),
    ).toEqual([]);
    expect(
      readOnlyPaletteProblems([
        entry("lasso-tool", true),
        entry("space-tool", false),
        entry("create.box", false, "shapes"),
      ]),
    ).toEqual([
      'palette: "lasso-tool" is aria-disabled on the read-only canvas; Lasso and Hand stay active (guide §13.5)',
      'palette: "space-tool" is not aria-disabled on the read-only canvas (guide §13.5)',
      'palette: "create.box" is not aria-disabled on the read-only canvas (guide §13.5)',
    ]);
  });

  const item = (
    name: string,
    group: "model" | "export" | "help",
    disabled: boolean,
    menuId: string | null = null,
  ): MenuEntryFacts => ({
    name,
    role: menuId === "legend" ? "menuitemcheckbox" : "menuitem",
    menuId,
    disabled,
    group,
    value: null,
    checked: menuId === "legend" ? "true" : null,
    icon: false,
    popup: null,
    keyShortcuts: null,
    shortcut: null,
    danger: false,
  });

  it("keeps the Legend toggle, export and help usable; Model entries may lock", () => {
    const before = [
      item("Snap to grid", "model", false, "snap"),
      item("Legend", "model", false, "legend"),
      item("Export as PNG", "export", false, "export-png"),
      item("Export as SVG", "export", true, "export-svg"),
      item("Keyboard shortcuts…", "help", false, "shortcuts"),
    ];
    const locked = [
      item("Snap to grid", "model", true, "snap"),
      item("Legend", "model", false, "legend"),
      item("Export as PNG", "export", false, "export-png"),
      item("Export as SVG", "export", true, "export-svg"),
      item("Keyboard shortcuts…", "help", false, "shortcuts"),
    ];
    expect(readOnlyMenuProblems(before, locked)).toEqual([]);
    const overLocked = locked.map((entry) => ({ ...entry, disabled: true }));
    expect(readOnlyMenuProblems(before, overLocked)).toEqual([
      "menu: the Legend toggle is aria-disabled on the read-only canvas; a view-only toggle stays usable (guide §13.5)",
      'menu: "Export as PNG" is aria-disabled on the read-only canvas; export and help stay usable (guide §13.5)',
      'menu: "Keyboard shortcuts…" is aria-disabled on the read-only canvas; export and help stay usable (guide §13.5)',
    ]);
  });

  it("tells the groups apart by name, also when the menu has no Model group", () => {
    const before = [
      item("Export as PNG", "export", false, "export-png"),
      item("Keyboard shortcuts…", "help", false, "shortcuts"),
    ];
    const overLocked = before.map((entry) => ({ ...entry, disabled: true }));
    expect(readOnlyMenuProblems(before, overLocked)).toEqual([
      'menu: "Export as PNG" is aria-disabled on the read-only canvas; export and help stay usable (guide §13.5)',
      'menu: "Keyboard shortcuts…" is aria-disabled on the read-only canvas; export and help stay usable (guide §13.5)',
    ]);
  });

  const locked = (overrides: Partial<LockedShapeFacts> = {}): LockedShapeFacts => ({
    contextPadEntries: [],
    dragged: { before: shape("a"), after: shape("a", { client: { x: 700, y: 450 } }) },
    textFields: [],
    kept: { Delete: true, Backspace: true },
    ...overrides,
  });

  it("accepts a shape that only gets selected, also when the canvas pans", () => {
    expect(lockedShapeProblems(locked())).toEqual([]);
  });

  it("reports the context pad, a move, a resize, a label editor and a delete", () => {
    expect(
      lockedShapeProblems(
        locked({
          contextPadEntries: ["delete"],
          dragged: {
            before: shape("a"),
            after: shape("a", {
              transform: "matrix(1 0 0 1 140 100)",
              size: { width: 160, height: 80 },
            }),
          },
          textFields: ["div.djs-direct-editing-content"],
          kept: { Delete: false, Backspace: true },
        }),
      ),
    ).toEqual([
      'read-only: selecting "a" shows the context pad (delete) (guide §13.5)',
      'read-only: a 40px drag changed "a" (transform "matrix(1 0 0 1 100 100)" → "matrix(1 0 0 1 140 100)", 120 × 80 → 160 × 80) (guide §13.5)',
      'read-only: a double-click on "a" opens a text field (div.djs-direct-editing-content) (guide §13.5)',
      'read-only: Delete on the canvas deleted "a" (guide §13.5)',
    ]);
    expect(
      lockedShapeProblems(locked({ dragged: { before: shape("a"), after: undefined } })),
    ).toEqual(['read-only: a 40px drag removed "a" from the canvas (guide §13.5)']);
  });
});

// ---- the web column (0.2) ----

describe("ARIA of the web column", () => {
  const legalLinks = (): AriaFacts["legalLinks"] => [
    {
      text: "© 2026 Miragon GmbH",
      href: MIRAGON_HOME,
      lang: null,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    {
      text: "Impressum",
      href: MIRAGON_IMPRESSUM,
      lang: "de",
      target: "_blank",
      rel: "noopener noreferrer",
    },
    {
      text: "Datenschutz",
      href: MIRAGON_DATENSCHUTZ,
      lang: "de",
      target: "_blank",
      rel: "noopener noreferrer",
    },
    {
      text: "GitHub",
      href: "https://github.com/Miragon",
      lang: null,
      target: "_blank",
      rel: "noopener noreferrer",
    },
  ];
  const webAria = (): AriaFacts => ({
    ...conformingAria(),
    order: ["menu", "primary", "palette", "canvas", "legal", "zoom", "toasts"],
    primary: element("button", { "data-chrome": "primary", "aria-label": "Share" }, "Share"),
    legal: element("nav", { "data-chrome": "legal", "aria-label": "Legal" }),
    legalLinks: legalLinks(),
  });

  it("accepts the web app's primary action and legal line", () => {
    expect(ariaProblems(webAria(), "web")).toEqual([]);
  });

  it("names the primary action with its visible label, also collapsed", () => {
    const facts = webAria();
    facts.primary = element("div", { "aria-label": "Copy" }, "Share");
    expect(primaryAriaProblems(facts, "web")).toEqual([
      "primary: a <div>, expected a <button>",
      'primary: the aria-label "Copy" does not contain the visible label "Share" (WCAG 2.5.3)',
    ]);
    facts.primary = element("button", {}, "");
    expect(primaryAriaProblems(facts, "web")).toEqual([
      "primary: no aria-label; it names the action also while the label is collapsed (guide §5.15)",
    ]);
    facts.primary = { ...element("button", { "aria-label": "Share" }, "Share"), disabled: true };
    expect(primaryAriaProblems(facts, "web")).toEqual([
      "primary: natively disabled; a disabled primary action keeps the focus with aria-disabled (guide §8)",
    ]);
    expect(
      primaryAriaProblems(
        {
          ...webAria(),
          primaryCollapsed: true,
          primary: element("button", { "aria-label": "Share" }, "Teilen"),
        },
        "web",
      ),
    ).toEqual([]);
    expect(primaryAriaProblems(facts, "ide")).toEqual([]);
  });

  it("wants a labelled <nav>, Impressum and Datenschutz in German and safe new tabs", () => {
    const facts = webAria();
    facts.legal = element("div", {});
    facts.legalLinks = legalLinks().map((link) =>
      link.text === "Impressum"
        ? { ...link, lang: null }
        : link.text === "GitHub"
          ? { ...link, rel: "noopener" }
          : link,
    );
    facts.legalLinks = facts.legalLinks.filter((link) => link.text !== "Datenschutz");
    expect(legalAriaProblems(facts, "web")).toEqual([
      "legal: the legal line is a <div>, expected a <nav>",
      "legal: the <nav> has no aria-label",
      'legal: "Impressum" has no lang, expected lang="de" (guide §2: Impressum and Datenschutz stay German)',
      'legal: no "Datenschutz" link (guide §5.10)',
      'legal: the link "GitHub" opens a new tab without rel="noopener noreferrer"',
    ]);
    facts.legalLinks = legalLinks().map((link) =>
      link.text === "Datenschutz" ? { ...link, lang: "en" } : link,
    );
    expect(
      legalAriaProblems({ ...facts, legal: element("nav", { "aria-label": "Legal" }) }, "web"),
    ).toEqual([
      'legal: "Datenschutz" has lang="en", expected lang="de" (guide §2: Impressum and Datenschutz stay German)',
    ]);
    expect(legalAriaProblems({ ...webAria(), legal: null }, "web")).toEqual([
      'legal: no [data-chrome="legal"] in the web app (guide §5.10)',
    ]);
    expect(legalAriaProblems({ ...webAria(), legal: null }, "embedded")).toEqual([]);
  });

  it("wants the pill to control a non-modal dialog in the web app", () => {
    const pill = (attributes: Record<string, string>) =>
      element("button", { "aria-label": "2 problems, 1 error", ...attributes }, "2 problems");
    const list = element("div", { role: "dialog", id: "cd-shell-problems-1" });
    const ok: AriaFacts = {
      ...webAria(),
      problems: pill({
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        "aria-controls": "cd-shell-problems-1",
      }),
      problemsControlled: list,
    };
    expect(pillPopupAriaProblems(ok, "web")).toEqual([]);
    expect(
      pillPopupAriaProblems({ ...ok, problems: pill({}), problemsControlled: null }, "web"),
    ).toEqual([
      'problems: the pill has aria-haspopup "", expected "dialog" (it opens the problems list)',
      'problems: the pill has aria-expanded "" while the list is closed, expected "false"',
      "problems: the pill has no aria-controls",
    ]);
    expect(
      pillPopupAriaProblems(
        { ...ok, problemsControlled: element("div", { role: "region", "aria-modal": "true" }) },
        "web",
      ),
    ).toEqual([
      'problems: aria-controls names a div with role "region", expected "dialog"',
      'problems: the problems list is aria-modal="true"; it is a non-modal popover (guide §5.10)',
    ]);
    expect(pillPopupAriaProblems({ ...ok, problemsControlled: null }, "web")).toEqual([
      'problems: aria-controls="cd-shell-problems-1" names no element',
    ]);
    // embedded: only when the pill opens a list of the shell's own; the IDE pill opens the Problems view
    expect(pillPopupAriaProblems({ ...ok, problems: pill({}) }, "embedded")).toEqual([]);
    expect(pillPopupAriaProblems({ ...ok, problems: pill({}) }, "ide")).toEqual([]);
  });

  it("puts Tab from the menu trigger on the primary action first", () => {
    const palette = { description: "div.entry", kind: "palette" } as const;
    const canvas = { description: "svg", kind: "canvas" } as const;
    expect(
      tabSequenceProblems([{ description: "button", kind: "primary" }, palette, canvas], true),
    ).toEqual([]);
    expect(
      tabSequenceProblems([palette, canvas, { description: "button", kind: "primary" }], true),
    ).toEqual([
      "tab order: Tab from the menu trigger lands on div.entry, expected the primary action (top left, top right, top centre, guide §5.14)",
    ]);
  });
});

describe("menu groups of the web app", () => {
  const entry = (
    group: string,
    menuId: string,
    name: string,
    extra: Partial<MenuEntryFacts> = {},
  ): MenuEntryFacts => ({
    name,
    role: "menuitem",
    menuId,
    disabled: false,
    group,
    value: null,
    checked: null,
    icon: false,
    popup: null,
    keyShortcuts: null,
    shortcut: null,
    danger: false,
    ...extra,
  });
  const radio = (value: string, checked: boolean) =>
    entry("appearance", "appearance", value, {
      role: "menuitemradio",
      value,
      checked: String(checked),
    });
  const file = [
    entry("file", "new-diagram", "New diagram", { icon: true }),
    entry("file", "open", "Open…", { icon: true }),
    entry("file", "show-example", "Show example"),
    entry("file", "import", "Import…", { icon: true }),
  ];
  const model = entry("model", "level", "Big picture", { role: "menuitemradio", checked: "true" });
  const exported = entry("export", "export-png", "Export as PNG", { icon: true });
  const help = entry("help", "shortcuts", "Keyboard shortcuts…", { icon: true });
  const appearance = [radio("system", true), radio("light", false), radio("dark", false)];

  it("accepts File, Model, Export, Appearance and Help in this order", () => {
    expect(menuGroupProblems([...file, model, exported, help], "web", ["light"])).toEqual([]);
    expect(
      menuGroupProblems([...file, model, exported, ...appearance, help], "web", ["light", "dark"]),
    ).toEqual([]);
    expect(menuGroupProblems([file[0]!, file[2]!], "web", ["light"])).toEqual([]);
  });

  it("reports groups out of order, unknown File ids, the File order and icons", () => {
    expect(menuGroupProblems([model, ...file, exported], "web", ["light"])).toEqual([
      "menu: the groups stand in the order model, file, export; expected File, Model, Export, Appearance, Help (guide §5.4)",
    ]);
    expect(
      menuGroupProblems(
        [
          entry("file", "open", "Open…"),
          entry("file", "new-diagram", "New diagram", { icon: true }),
          entry("file", "show-example", "Show example", { icon: true }),
          entry("file", "save", "Save", { role: "menuitemcheckbox" }),
        ],
        "web",
        ["light"],
      ),
    ).toEqual([
      'menu: File entry "Open…" has no icon (guide §5.4)',
      'menu: File entry "Show example" carries an icon; the guide gives show-example none (guide §5.14)',
      'menu: File entry "Save" has data-menu-id "save"; the shell builds the File group from new-diagram, open, show-example, import',
    ]);
    expect(menuGroupProblems([file[1]!, file[0]!], "web", ["light"])).toEqual([
      "menu: the File group reads open, new-diagram; expected the order new-diagram, open (guide §5.4)",
    ]);
    expect(
      menuGroupProblems(
        [entry("file", "open", "Open…", { icon: true, role: "menuitemradio" })],
        "web",
        ["light"],
      ),
    ).toEqual(['menu: File entry "Open…" is a menuitemradio, expected a menuitem']);
  });

  it("wants the Appearance group of a dark-capable modeler with System, Light and Dark", () => {
    expect(menuGroupProblems([...file, help], "web", ["light", "dark"])).toEqual([
      "menu: a dark-capable modeler shows no Appearance group (guide §5.4, §13.3)",
    ]);
    expect(
      menuGroupProblems(
        [
          radio("light", true),
          radio("dark", false),
          entry("appearance", "mode", "System", { value: "system" }),
        ],
        "web",
        ["light", "dark"],
      ),
    ).toEqual([
      "menu: the Appearance options are light, dark, system; expected system, light, dark (guide §13.3)",
      'menu: Appearance option "System" is a menuitem in "mode"; expected a menuitemradio of the radio group "appearance"',
      'menu: the Appearance group checks light; expected "system" (aria-checked, guide §12)',
    ]);
    expect(appearanceChoiceProblems(appearance, "dark")).toEqual([
      'menu: the Appearance group checks system; expected "dark" (aria-checked, guide §12)',
    ]);
    expect(
      appearanceChoiceProblems([radio("system", false), radio("dark", false)], "system"),
    ).toEqual([
      'menu: the Appearance group checks nothing; expected "system" (aria-checked, guide §12)',
    ]);
  });

  it("keeps File and Appearance out of the IDE and embedded hosts, Appearance out of a light-only modeler", () => {
    expect(menuGroupProblems([...file, model, ...appearance], "ide", ["light", "dark"])).toEqual([
      "menu: the ide host shows a File group; its file actions are native (guide §13.5)",
      "menu: the ide host shows an Appearance group; its file actions are native (guide §13.5)",
    ]);
    expect(menuGroupProblems([file[0]!], "embedded", ["light"])).toEqual([
      "menu: the embedded host shows a File group; the host owns file and mode (guide §5.2)",
    ]);
    expect(lightOnlyMenuProblems([...file, ...appearance], ["light"])).toEqual([
      "menu: a light-only modeler shows the Appearance group; it comes with dark (guide §13.3)",
    ]);
    expect(lightOnlyMenuProblems([...file, ...appearance], ["light", "dark"])).toEqual([]);
    expect(lightOnlyMenuProblems(file, ["light"])).toEqual([]);
  });
});

describe("the web app's top row (guide §5.15)", () => {
  /** The web demo's top row: menu right edge 52, a 648px palette, a 94px labelled Share action. */
  const sample = (
    width: number,
    state: {
      collapsed?: boolean;
      row?: "top" | "second-row";
      label?: string | null;
      primaryWidth?: number;
    } = {},
  ): TopRowFacts => {
    const collapsed = state.collapsed ?? false;
    const primaryWidth = state.primaryWidth ?? (collapsed ? 40 : 94);
    return {
      container: { width, height: 900 },
      paletteRow: state.row ?? "top",
      paletteWidth: 648,
      menuRight: 52,
      primary: {
        box: { left: width - 12 - primaryWidth, top: 12, width: primaryWidth, height: 40 },
        client: { x: width - 12 - primaryWidth / 2, y: 32 },
        collapsed,
        ariaLabel: "Share",
        describedBy: null,
        label: state.label !== undefined ? state.label : collapsed ? null : "Share",
      },
    };
  };

  it("takes the labelled width from the widest labelled measurement", () => {
    expect(labelledWidth([sample(1280), sample(880, { collapsed: true })])).toBe(94);
    expect(labelledWidth([sample(880, { collapsed: true })])).toBeUndefined();
  });

  it("accepts label, then icon only, then the second row with the label back", () => {
    expect(
      topRowProblems(
        [
          sample(1280),
          sample(904),
          sample(880, { collapsed: true }),
          sample(808, { collapsed: true }),
          sample(760, { row: "second-row" }),
        ],
        94,
        "Share",
      ),
    ).toEqual([]);
  });

  it("reports a label that should have collapsed, and a collapse that came too early", () => {
    expect(topRowProblems([sample(856)], 94, "Share")).toEqual([
      "[856px wide] primary: shows its label, but the 648px palette fits the top row only beside the icon; the label collapses first (guide §5.15)",
    ]);
    expect(topRowProblems([sample(1280, { collapsed: true })], 94, "Share")).toEqual([
      "[1280px wide] primary: collapsed although its 94px label fits (guide §5.15)",
    ]);
  });

  it("reports a palette that moved before the label collapsed, or stayed when even the icon is too close", () => {
    expect(
      topRowProblems([sample(856, { collapsed: true, row: "second-row" })], 94, "Share"),
    ).toEqual([
      "[856px wide] palette: in the second row although it fits the top row beside the collapsed primary action; the label collapses first (guide §5.15)",
    ]);
    expect(topRowProblems([sample(776, { row: "top", collapsed: true })], 94, "Share")).toEqual([
      "[776px wide] primary: collapsed although its 94px label fits (guide §5.15)",
      "[776px wide] palette: in the top row although it keeps less than 16px to the primary action even icon only (guide §5.15)",
    ]);
  });

  it("leaves a width alone where 1px flips the decision", () => {
    // 892px: the labelled action keeps exactly 16px to the palette
    expect(topRowProblems([sample(892, { collapsed: true }), sample(892)], 94, "Share")).toEqual(
      [],
    );
  });

  it("wants a collapsed action 40 wide, without its label, with its name and no description", () => {
    const broken = sample(856, { collapsed: true, primaryWidth: 60, label: "Share" });
    broken.primary!.ariaLabel = "";
    broken.primary!.describedBy = "cd-shell-tooltip-1";
    expect(topRowProblems([broken], 94, "Share")).toEqual([
      "[856px wide] primary: 60px wide while collapsed, expected 40px",
      '[856px wide] primary: collapsed, but its label "Share" still shows',
      '[856px wide] primary: the aria-label is "" while collapsed; it keeps "Share" (guide §5.15)',
      '[856px wide] primary: aria-describedby="cd-shell-tooltip-1"; its tooltip repeats the name (API.md, Primary action)',
    ]);
    expect(topRowProblems([sample(1280, { label: null })], 94, "Share")).toEqual([
      '[1280px wide] primary: shows no label although the root lacks data-primary="collapsed"',
    ]);
  });

  it("shows the chrome tooltip only while collapsed, with the label", () => {
    expect(primaryTooltipProblems(true, "Share", "Share", 856)).toEqual([]);
    expect(primaryTooltipProblems(false, null, "Share", 1280)).toEqual([]);
    expect(primaryTooltipProblems(true, null, "Share", 856)).toEqual([
      '[856px wide] primary: no chrome tooltip while collapsed; it shows the label "Share" (guide §5.15)',
    ]);
    expect(primaryTooltipProblems(true, "Menu", "Share", 856)).toEqual([
      '[856px wide] primary: the tooltip while collapsed reads "Menu", expected "Share"',
    ]);
    expect(primaryTooltipProblems(false, "Share", "Share", 1280)).toEqual([
      '[1280px wide] primary: a tooltip "Share" while the label shows; only the collapsed action has one',
    ]);
  });

  it("wants one click from the pointer and one from Enter", () => {
    expect(primaryActivationProblems({ pointer: 1, enter: 1 })).toEqual([]);
    expect(primaryActivationProblems({ pointer: 2, enter: 0 })).toEqual([
      "primary: a pointer click reached it 2 times, expected once",
      "primary: Enter on the focused primary action clicked it 0 times, expected once (keyboard activation)",
    ]);
  });
});

describe("legal line content and the zoom row", () => {
  const links = (): AriaFacts["legalLinks"] => [
    {
      text: "© 2026 Miragon GmbH",
      href: MIRAGON_HOME,
      lang: null,
      target: "_blank",
      rel: "noopener noreferrer",
    },
    {
      text: "Impressum",
      href: MIRAGON_IMPRESSUM,
      lang: "de",
      target: "_blank",
      rel: "noopener noreferrer",
    },
    {
      text: "Datenschutz",
      href: MIRAGON_DATENSCHUTZ,
      lang: "de",
      target: "_blank",
      rel: "noopener noreferrer",
    },
  ];

  it("starts with the copyright, then Impressum and Datenschutz with the kit's URLs", () => {
    expect(legalContentProblems(links())).toEqual([]);
    const wrong = links();
    wrong[0] = { ...wrong[0]!, href: "https://miragon.io" };
    wrong[2] = { ...wrong[2]!, href: "https://www.miragon.io/privacy/" };
    expect(legalContentProblems(wrong)).toEqual([
      'legal: the copyright links "https://miragon.io", expected https://www.miragon.io/',
      'legal: "Datenschutz" links "https://www.miragon.io/privacy/", expected https://www.miragon.io/datenschutz/',
    ]);
    expect(legalContentProblems([links()[1]!, links()[0]!])).toEqual([
      'legal: the line starts with "Impressum", expected the copyright "© <year> Miragon GmbH" (guide §5.10)',
      'legal: the links read "Impressum", "© 2026 Miragon GmbH"; expected the copyright, "Impressum", "Datenschutz", then the modeler\'s links (guide §5.10)',
    ]);
  });

  it("stands the zoom panel at 12px, at 40px while raised", () => {
    const container = { width: 420, height: 700 };
    const low = { left: 235, top: 648, width: 173, height: 40 };
    expect(zoomRowBottomProblems(low, false, container)).toEqual([]);
    expect(zoomRowBottomProblems(low, true, container)).toEqual([
      "[420px wide, raised] zoom: bottom is 12px, expected 40px (±1px)",
    ]);
    expect(zoomRowBottomProblems(undefined, true, container)).toEqual([]);
  });

  const bottomRow = (
    islands: ChromeMeasurement["islands"],
    toastCardWidth?: number,
  ): ChromeMeasurement => ({
    container: { width: 1280, height: 900 },
    paletteRow: "top",
    islands,
    open: {
      legend: false,
      inspector: false,
      problems: false,
      emptyState: false,
      primaryCollapsed: false,
      zoomRaised: false,
    },
    ...(toastCardWidth === undefined ? {} : { toastCardWidth }),
  });
  const legal = { left: 12, top: 868, width: 380.5, height: 20 };
  const zoom = { left: 1095, top: 848, width: 173, height: 40 };

  it("probes the zoom row 4px on either side of its 8px limit to the measured legal line", () => {
    // 12 + 380.5 + 4 + 173 + 12 = 581.5
    expect(zoomRowProbes(bottomRow({ legal, zoom }))).toEqual([
      { distance: 4, width: 582 },
      { distance: 12, width: 590 },
    ]);
    expect(zoomRowProbes(bottomRow({ zoom }))).toEqual([]);
  });

  it("probes the toast stack where the widest card's column keeps 12px and 4px to the bottom row", () => {
    // beside the legal line 2 × (392.5 + 12) + 398.7 = 1207.7, beside the zoom panel 2 × 197 + 398.7
    expect(toastLiftProbes(bottomRow({ legal, zoom }, 398.7))).toEqual([
      { distance: 12, width: 1208 },
      { distance: 4, width: 1192 },
    ]);
    // embedded: no legal line, the zoom panel decides: 2 × (12 + 12 + 173) + 200
    expect(toastLiftProbes(bottomRow({ zoom }, 200))).toEqual([
      { distance: 12, width: 594 },
      { distance: 4, width: 578 },
    ]);
    expect(toastLiftProbes(bottomRow({ legal, zoom }))).toEqual([]);
  });
});

describe("the start screen (guide §8)", () => {
  const container = { width: 1280, height: 900 };
  const conforming = (): EmptyStateFacts => ({
    shown: true,
    card: {
      visible: true,
      box: { left: 440, top: 300, width: 400, height: 300 },
      tag: "section",
      labelledBy: "Demo Modeler",
    },
    komet: { tag: "img", alt: "", width: 64, height: 64 },
    heading: { tag: "h1", text: "Demo Modeler" },
    buttons: [
      { variant: "primary", name: "New diagram", height: 36, client: { x: 600, y: 520 } },
      { variant: "ghost", name: "Show example", height: 36, client: { x: 700, y: 520 } },
    ],
    hint: "Or drop a file here · Open a file… ⌘O",
    openLink: { name: "Open a file…", keyShortcuts: "Meta+O", chip: "⌘O", underlined: true },
    work: [
      { name: "menu", visibility: "hidden", visible: false },
      { name: "palette", visibility: "hidden", visible: false },
    ],
    canvasInert: true,
    legalVisible: true,
  });

  it("accepts the card of the guide", () => {
    expect(emptyStateProblems(conforming(), container, "en")).toEqual([]);
  });

  const fileOpen: MenuEntryFacts = {
    name: "Open…",
    role: "menuitem",
    menuId: "open",
    disabled: false,
    group: "file",
    value: null,
    checked: null,
    icon: true,
    popup: null,
    keyShortcuts: "Meta+O",
    shortcut: "⌘O",
    danger: false,
  };

  it("wants the hint to end in a link to the File group's Open…, with its keys", () => {
    expect(startScreenOpenProblems(conforming(), fileOpen, "en")).toEqual([]);
    expect(startScreenOpenProblems({ ...conforming(), openLink: null }, undefined, "en")).toEqual(
      [],
    );
    expect(startScreenOpenProblems({ ...conforming(), openLink: null }, fileOpen, "en")).toEqual([
      "empty-state: the File group has Open…, but the hint does not end in a text link to it; on the start screen it is the keyboard's way to a file (guide §8)",
    ]);
    expect(
      startScreenOpenProblems(
        {
          ...conforming(),
          openLink: { name: "Browse", keyShortcuts: null, chip: null, underlined: true },
        },
        fileOpen,
        "en",
      ),
    ).toEqual([
      'empty-state: the hint ends in "Browse", expected the link "Open a file…" (guide §8)',
      'empty-state: "Browse" has no aria-keyshortcuts, expected "Meta+O" like the File group\'s Open…',
      'empty-state: "Browse" shows no shortcut chip, expected "⌘O" like the File group\'s Open… (guide §8)',
    ]);
    const german = {
      ...conforming(),
      openLink: { name: "Datei öffnen…", keyShortcuts: "Meta+O", chip: "⌘O", underlined: true },
    };
    expect(startScreenOpenProblems(german, fileOpen, "de")).toEqual([]);
  });

  it("wants the link's aria-keyshortcuts to name keys, not characters", () => {
    const shifted = { ...fileOpen, shortcut: "⌘?", keyShortcuts: "Meta+?" };
    const link = { name: "Open a file…", keyShortcuts: "Meta+?", chip: "⌘?", underlined: true };
    expect(startScreenOpenProblems({ ...conforming(), openLink: link }, shifted, "en")).toEqual([
      'empty-state: "Open a file…" has aria-keyshortcuts="Meta+?", which names the character "?", not a key; expected "Meta+Shift+/ Meta+Shift+ß" (guide §5.6)',
    ]);
    const ruledOut = { ...fileOpen, shortcut: "⌘@", keyShortcuts: null };
    const ruledOutLink = { ...link, keyShortcuts: null, chip: "⌘@" };
    expect(
      startScreenOpenProblems({ ...conforming(), openLink: ruledOutLink }, ruledOut, "en"),
    ).toEqual([
      'empty-state: "Open a file…" shows the shortcut "⌘@" on a character that needs AltGr or ⌥, sits on a dead key or is missing on the US or the German layout; guide §5.6 rules such a shortcut out',
    ]);
  });

  it("wants the link underlined at rest, as its colour alone barely parts it from the hint", () => {
    const plain = {
      ...conforming(),
      openLink: { name: "Open a file…", keyShortcuts: "Meta+O", chip: "⌘O", underlined: false },
    };
    expect(startScreenOpenProblems(plain, fileOpen, "en")).toEqual([
      'empty-state: "Open a file…" is not underlined at rest; beside the hint\'s quiet text its colour alone does not mark it as a link (guide §3.5, §8, WCAG 1.4.1)',
    ]);
  });

  it("reports the card's attribute, centre, label, Komet, title, buttons and the work chrome", () => {
    const facts = conforming();
    facts.shown = false;
    facts.card = {
      ...facts.card!,
      box: { left: 430, top: 300, width: 400, height: 300 },
      labelledBy: null,
    };
    facts.komet = { tag: "img", alt: "Miragon", width: 48, height: 48 };
    facts.heading = { tag: "h3", text: "Demo Modeler" };
    facts.buttons = [
      { variant: "ghost", name: "Show example", height: 32, client: { x: 0, y: 0 } },
      { variant: "primary", name: "New diagram", height: 36, client: { x: 0, y: 0 } },
      { variant: null, name: "More", height: 36, client: { x: 0, y: 0 } },
    ];
    facts.work = [{ name: "palette", visibility: "visible", visible: true }];
    facts.canvasInert = false;
    facts.legalVisible = false;
    expect(emptyStateProblems(facts, container, "en")).toEqual([
      'empty-state: the root lacks data-empty-state="shown" after show.emptyState',
      "empty-state: centerX is 630px, expected 640px (±1px)",
      "empty-state: the card is not labelled by its title (aria-labelledby)",
      'empty-state: the Komet has alt="Miragon"; it is decorative, alt="" (guide §8)',
      "empty-state: the Komet is 48 × 48px, expected 64 × 64 (guide §8)",
      "empty-state: the title is a <h3>, expected an <h1>",
      'empty-state: the first button "Show example" is ghost variant, expected the blue primary "New diagram" first (guide §8)',
      'empty-state: the second button "New diagram" is primary variant, expected the ghost "Show example" (guide §8)',
      "empty-state: 3 buttons on the card; exactly two actions (guide §8)",
      'empty-state: "Show example" is 32px high, expected 36px (guide §8)',
      'empty-state: the primary button reads "Show example", expected "New diagram" (guide §2)',
      'empty-state: the ghost button reads "New diagram", expected "Show example" (guide §2)',
      "empty-state: palette is visible behind the start screen; it hides the work chrome (guide §8)",
      "empty-state: the canvas slot is not inert behind the start screen; nothing else takes a click or the Tab (guide §8)",
      "empty-state: the legal line is not visible; a public page always shows it (guide §8)",
    ]);
  });

  it("compares the button names only in an English tool and reports a missing card or Komet", () => {
    const german = conforming();
    german.buttons = german.buttons.map((button) => ({ ...button, name: `${button.name} (de)` }));
    expect(emptyStateProblems(german, container, "de")).toEqual([]);
    expect(emptyStateProblems({ ...conforming(), card: null }, container, "en")).toEqual([
      "empty-state: the card is not visible after show.emptyState",
    ]);
    expect(
      emptyStateProblems(
        { ...conforming(), komet: null, heading: null, buttons: [] },
        container,
        "en",
      ),
    ).toEqual([
      "empty-state: no Komet <img> on the card (guide §2, §8)",
      "empty-state: the title is missing, expected an <h1>",
      'empty-state: no "New diagram" button on the card (guide §8)',
    ]);
  });

  it("lets Tab reach only the card and the legal links", () => {
    const stop = (owner: string, description = owner) => ({ owner, description });
    expect(
      emptyStateTabProblems([
        stop("empty-state"),
        stop("empty-state"),
        stop("legal"),
        stop("body"),
      ]),
    ).toEqual([]);
    expect(
      emptyStateTabProblems([stop("menu", "button.cd-shell-menu-trigger"), stop("canvas", "svg")]),
    ).toEqual([
      "empty-state: Tab reaches button.cd-shell-menu-trigger (menu) behind the start screen; only the card and the legal links take the focus (guide §8)",
      "empty-state: Tab reaches svg (canvas) behind the start screen; only the card and the legal links take the focus (guide §8)",
      "empty-state: Tab never reaches the card's buttons",
      "empty-state: Tab never reaches the legal links",
    ]);
  });

  it("leaves the chrome keys to the browser and without effect behind the card", () => {
    const key = (defaultPrevented: boolean): RecordedKey => ({
      key: "=",
      code: "Equal",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented,
    });
    expect(emptyStateKeyProblems("Control+Equal", 100, 100, [key(false)])).toEqual([]);
    expect(emptyStateKeyProblems("Control+Equal", 100, 100, [])).toEqual([]);
    expect(emptyStateKeyProblems("Control+Equal", 100, 135, [key(true)])).toEqual([
      "empty-state: Control+Equal behind the start screen changed the zoom from 100% to 135%; the chrome keys zoom no diagram there",
      "empty-state: Control+Equal behind the start screen arrived prevented; with no diagram to zoom the browser keeps its page zoom (WCAG 1.4.4)",
    ]);
  });

  it("brings the chrome back after New diagram, with the focus on the canvas", () => {
    const after: EmptyStateFacts = {
      ...conforming(),
      shown: false,
      card: { ...conforming().card!, visible: false },
      work: [
        { name: "menu", visibility: "visible", visible: true },
        { name: "palette", visibility: "visible", visible: true },
        { name: "zoom", visibility: "visible", visible: true },
      ],
      canvasInert: false,
    };
    expect(afterStartProblems(after, { owner: "canvas", description: "svg" })).toEqual([]);
    expect(
      afterStartProblems(
        { ...conforming(), work: [{ name: "zoom", visibility: "hidden", visible: false }] },
        { owner: "body", description: "<body>" },
      ),
    ).toEqual([
      'empty-state: after "New diagram" the root still carries data-empty-state="shown"',
      'empty-state: after "New diagram" the card still shows',
      'empty-state: after "New diagram" the zoom is still hidden',
      'empty-state: after "New diagram" the canvas slot is still inert',
      'empty-state: after "New diagram" the focus is on <body>, expected the canvas <svg> (API.md, Empty state)',
    ]);
  });
});

describe("toasts (guide §8)", () => {
  const toast = (text: string, extra: Partial<ToastFacts> = {}): ToastFacts => ({
    text,
    role: null,
    status: "success",
    box: { left: 400, top: 800, width: 480, height: 42 },
    client: { x: 640, y: 821 },
    buttons: [{ name: "Close", text: "", client: { x: 860, y: 821 } }],
    topmost: true,
    focused: false,
    contentWidth: 480,
    ...extra,
  });

  const heard = { persistent: true, announced: true };

  it("wants each card as wide as its content, at most the stack", () => {
    const short = { box: { left: 520, top: 800, width: 240, height: 42 }, contentWidth: 240 };
    expect(toastWidthProblems(toast("Link copied", short), "success", 480)).toEqual([]);
    expect(
      toastWidthProblems(toast("A long sentence", { contentWidth: 900 }), "warning", 480),
    ).toEqual([]);
    expect(toastWidthProblems(toast("Link copied", { contentWidth: 146 }), "success", 480)).toEqual(
      [
        "toasts: the success toast's card is 480px wide for 146px of content; a card is as wide as its content, at most the stack's 480px (guide §8)",
      ],
    );
  });

  it("wants the text in a persistent alert region for errors and status otherwise, and a Close icon button", () => {
    expect(toastAnatomyProblems(toast("Saved"), "success", "en", heard)).toEqual([]);
    expect(toastAnatomyProblems(toast("Failed"), "danger", "en", heard)).toEqual([]);
    expect(
      toastAnatomyProblems(
        toast("Failed", {
          role: "status",
          buttons: [{ name: "Dismiss", text: "", client: { x: 0, y: 0 } }],
          box: { left: 0, top: 0, width: 480, height: 30 },
        }),
        "danger",
        "en",
        { persistent: true, announced: false },
      ),
    ).toEqual([
      'toasts: the danger toast\'s text never reaches the role="alert" live region (guide §8, §12)',
      'toasts: the danger toast\'s card carries role="status"; the live region announces it, so a live card is read twice',
      'toasts: the Close button is named "Dismiss", expected "Close" (guide §8)',
      "toasts: the danger toast is 30px high, at least 40px (guide §8)",
    ]);
    expect(
      toastAnatomyProblems(toast("Saved"), "info", "en", { persistent: false, announced: false }),
    ).toEqual([
      'toasts: no role="status" live region in the root before the first toast; a live region created together with its text is often not announced (guide §8, §12)',
    ]);
    expect(
      toastAnatomyProblems(
        toast("Saved", { buttons: [{ name: "Undo", text: "Undo", client: { x: 0, y: 0 } }] }),
        "info",
        "de",
        heard,
      ),
    ).toEqual(["toasts: the info toast has no Close icon button at its end (guide §8)"]);
    expect(
      toastAnatomyProblems(
        toast("Saved", { buttons: [{ name: "", text: "", client: { x: 0, y: 0 } }] }),
        "success",
        "de",
        heard,
      ),
    ).toEqual(["toasts: the success toast's Close button has no accessible name"]);
  });

  it("finds the live region of a toast's status", () => {
    const regions = [
      { role: "status", live: "polite", text: "Saved" },
      { role: "alert", live: "assertive", text: "" },
    ];
    expect(toastLiveRegion(regions, "success")?.text).toBe("Saved");
    expect(toastLiveRegion(regions, "warning")?.role).toBe("status");
    expect(toastLiveRegion(regions, "danger")?.role).toBe("alert");
    expect(toastLiveRegion([], "danger")).toBeUndefined();
  });

  it("keeps at most three, evicts the oldest without an action and puts the newest at the bottom", () => {
    const shown = ["A", "B", "C", "D"];
    const stack = [
      toast("A Undo"),
      toast("C", { box: { left: 400, top: 750, width: 480, height: 42 } }),
      toast("D", { box: { left: 400, top: 800, width: 480, height: 42 } }),
    ];
    stack[0]!.box = { left: 400, top: 700, width: 480, height: 42 };
    expect(toastStackProblems(stack, shown, ["A", "C", "D"])).toEqual([]);
    const wrong = [toast("A"), toast("B"), toast("C"), toast("D")];
    wrong.forEach((entry, index) => (entry.box = { ...entry.box, top: 800 - index * 50 }));
    expect(toastStackProblems(wrong, shown, ["A", "C", "D"])).toEqual([
      "toasts: 4 toasts at once, at most 3 (guide §8)",
      'toasts: after 4 toasts the stack shows "A", "B", "C", "D"; expected "A", "C", "D" (at most 3, the oldest without an action leaves, guide §8)',
      "toasts: the newest toast is not at the bottom of the stack (guide §8)",
    ]);
    expect(shownToasts([toast("Conformance: B"), toast("other")], ["A", "B"])).toEqual(["B"]);
  });

  it("restarts a repeated toast instead of stacking it", () => {
    expect(repeatedToastProblems([toast("C"), toast("D")], "C")).toEqual([]);
    expect(repeatedToastProblems([toast("C"), toast("C")], "C")).toEqual([
      'toasts: a repeated "C" stacks 2 toasts; it restarts the shown one (API.md, Toasts)',
    ]);
  });

  it("reports toasts that close too early or too late", () => {
    const timing = (
      text: string,
      expectation: ToastTiming["expectation"],
      present: boolean,
      condition: ToastTiming["condition"],
    ): ToastTiming => ({ text, expectation, after: 3700, present, condition });
    expect(
      toastTimingProblems([
        timing("plain", "gone", false, "plain"),
        timing("hovered", "present", true, "hovered"),
      ]),
    ).toEqual([]);
    expect(
      toastTimingProblems([
        timing("plain", "gone", true, "plain"),
        timing("plain", "present", false, "plain"),
        timing("hovered", "present", false, "hovered"),
        timing("focused", "present", false, "focused"),
        timing("left", "present", false, "resumed"),
        timing("left", "gone", true, "resumed"),
        timing("undo", "present", false, "action"),
      ]),
    ).toEqual([
      'toasts: "plain" is still there 3700ms after it appeared; it closes after its lifetime (guide §8)',
      'toasts: "plain" closed within 3700ms after it appeared; it stays for its lifetime (guide §8)',
      'toasts: "hovered" closed within 3700ms after it appeared; hover pauses its time (guide §8)',
      'toasts: "focused" closed within 3700ms after it appeared; focus pauses its time (guide §8)',
      'toasts: "left" closed within 3700ms after the pointer and the focus left it; it resumes with at least 1.5s left (guide §8)',
      'toasts: "left" is still there 3700ms after the pointer and the focus left it; it closes after its lifetime (guide §8)',
      'toasts: "undo" closed within 3700ms after it appeared; a toast with an action never closes by itself (guide §8)',
    ]);
  });
});

describe("the problems list (guide §5.10)", () => {
  const container = { width: 1280, height: 900 };
  const open = (): PopoverFacts => ({
    pill: {
      attributes: { "aria-expanded": "true", "aria-haspopup": "dialog" },
      box: { left: 12, top: 820, width: 120, height: 40 },
      client: { x: 72, y: 840 },
      visible: true,
    },
    popover: {
      attributes: { role: "dialog", "aria-labelledby": "t" },
      box: { left: 12, top: 692, width: 320, height: 120 },
      visible: true,
      title: "Problems",
    },
    rows: [
      {
        button: true,
        height: 56,
        icon: true,
        text: "The box has no name. Box 1",
        client: { x: 0, y: 0 },
      },
      { button: false, height: 36, icon: true, text: "Two boxes overlap.", client: { x: 0, y: 0 } },
    ],
    focus: "popover",
    focused: "button.cd-shell-problem",
    focusedRow: { index: 0, inView: true },
  });

  it("accepts the list above the pill with labelled rows and the focus inside", () => {
    expect(openPopoverProblems(open(), container, "en")).toEqual([]);
  });

  it("wants every legal link inside the legal line and the container (WCAG 1.4.10)", () => {
    const facts = {
      container: { width: 320, height: 700 },
      legal: { left: 12, top: 648, width: 296, height: 40 },
      links: [
        { text: "Impressum", box: { left: 150, top: 648, width: 66, height: 20 }, lines: [658] },
        { text: "Datenschutz", box: { left: 20, top: 668, width: 80, height: 20 }, lines: [678] },
      ],
      separators: [],
    };
    expect(legalReachProblems(facts)).toEqual([]);
    const scrolled = {
      ...facts,
      legal: { left: 12, top: 668, width: 296, height: 20 },
      links: [
        { text: "Impressum", box: { left: 150, top: 668, width: 66, height: 20 }, lines: [678] },
        { text: "Datenschutz", box: { left: 268, top: 668, width: 80, height: 20 }, lines: [678] },
      ],
    };
    expect(legalReachProblems(scrolled)).toEqual([
      'legal: [320px wide] "Datenschutz" is cut off or scrolled out of the legal line; it wraps instead (guide §5.10, WCAG 1.4.10)',
    ]);
    expect(legalReachProblems({ ...facts, legal: null })).toEqual([]);
  });

  it("wants a wrapped legal line broken between its entries, each separator with the link after it", () => {
    const facts = {
      container: { width: 320, height: 700 },
      legal: { left: 12, top: 648, width: 296, height: 40 },
      links: [
        {
          text: "© 2026 Miragon GmbH",
          box: { left: 20, top: 648, width: 130, height: 20 },
          lines: [658],
        },
        { text: "Impressum", box: { left: 168, top: 648, width: 66, height: 20 }, lines: [658] },
        { text: "Datenschutz", box: { left: 32, top: 668, width: 80, height: 20 }, lines: [678] },
      ],
      separators: [
        { centerY: 658, next: 1 },
        { centerY: 678, next: 2 },
      ],
    };
    expect(legalWrapProblems(facts)).toEqual([]);
    expect(
      legalWrapProblems({
        ...facts,
        links: [facts.links[0]!, { ...facts.links[1]!, lines: [658, 678] }, facts.links[2]!],
        separators: [
          { centerY: 658, next: 1 },
          { centerY: 658, next: 2 },
        ],
      }),
    ).toEqual([
      'legal: [320px wide] "Impressum" breaks across 2 lines; the line wraps between its entries (guide §5.10)',
      'legal: [320px wide] the separator before "Datenschutz" ends the line above; each separator travels with the link after it (guide §5.10)',
    ]);
    expect(legalWrapProblems({ ...facts, legal: null })).toEqual([]);
  });

  it("wants every row reached by the keyboard and scrolled into the list", () => {
    const at = (index: number, inView = true) => ({ index, inView });
    expect(
      popoverKeyboardProblems(
        [
          { key: "Enter on the pill", expected: 0, focused: at(0) },
          { key: "ArrowDown", expected: 1, focused: at(1) },
          { key: "Home", expected: 0, focused: at(0) },
          { key: "End", expected: 1, focused: at(1) },
        ],
        2,
      ),
    ).toEqual([]);
    expect(
      popoverKeyboardProblems(
        [
          { key: "Enter on the pill", expected: 0, focused: null },
          { key: "ArrowDown", expected: 1, focused: at(0) },
          { key: "End", expected: 2, focused: at(2, false) },
        ],
        3,
      ),
    ).toEqual([
      "problems-popover: Enter on the pill reaches no row, expected row 1 of 3; the keyboard reads every row, text rows too (guide §5.10, WCAG 2.1.1)",
      "problems-popover: ArrowDown reaches row 1, expected row 2 of 3; the keyboard reads every row, text rows too (guide §5.10, WCAG 2.1.1)",
      "problems-popover: row 3 takes the focus on End but stays scrolled out of the list",
    ]);
  });

  it("reports role, modality, title, state, rows, focus and geometry", () => {
    const facts = open();
    facts.popover = {
      attributes: { role: "region", "aria-modal": "true" },
      box: { left: 14, top: 400, width: 340, height: 400 },
      visible: true,
      title: "Issues",
    };
    facts.pill!.attributes["aria-expanded"] = "false";
    facts.rows = [{ button: true, height: 30, icon: false, text: "Row", client: { x: 0, y: 0 } }];
    facts.focus = "pill";
    facts.focused = "button.cd-shell-problems";
    expect(openPopoverProblems(facts, container, "en")).toEqual([
      'problems-popover: role "region", expected "dialog"',
      'problems-popover: aria-modal="true"; it is not modal',
      'problems-popover: titled "Issues", expected "Problems" (guide §5.10)',
      'problems: aria-expanded is "false" while the list is open, expected "true"',
      'problems-popover: the row "Row" is 30px high, at least 36px (guide §5.10)',
      'problems-popover: the row "Row" has no severity icon (guide §5.10)',
      "problems-popover: opening it leaves the focus on button.cd-shell-problems; it moves to the first row (API.md, Problems popover)",
      "problems-popover: left is 14px, expected 12px (±1px)",
      "problems-popover: bottom is 100px, expected 88px (±1px)",
      "problems-popover: width is 340px, at most 320px expected",
      "problems-popover: height is 400px, at most 320px expected",
    ]);
    expect(
      openPopoverProblems(
        { ...open(), popover: { ...open().popover!, title: null } },
        container,
        "de",
      ),
    ).toEqual(["problems-popover: not labelled by its title (aria-labelledby)"]);
    expect(openPopoverProblems({ ...open(), rows: [] }, container, "en")).toEqual([
      "problems-popover: the list has no rows; show.problems passes items in the web host",
    ]);
    expect(openPopoverProblems({ ...open(), popover: null }, container, "en")).toEqual([
      "problems-popover: a click on the pill shows no problems list (guide §5.10)",
    ]);
  });

  it("closes on Escape with the focus on the pill, on an outside click without, on a row to the canvas", () => {
    const closed = (focus: PopoverFacts["focus"]): PopoverFacts => ({
      ...open(),
      pill: { ...open().pill!, attributes: { "aria-expanded": "false" } },
      popover: { ...open().popover!, visible: false },
      focus,
      focused: focus,
    });
    expect(closedPopoverProblems(closed("pill"), "Escape")).toEqual([]);
    expect(closedPopoverProblems(closed("canvas"), "an outside click")).toEqual([]);
    expect(closedPopoverProblems(closed("canvas"), "a row with an element")).toEqual([]);
    expect(closedPopoverProblems(open(), "Escape")).toEqual([
      "problems-popover: Escape does not close the list",
      'problems: aria-expanded is "true" after Escape, expected "false"',
      "problems-popover: Escape leaves the focus on button.cd-shell-problem, expected the pill",
    ]);
    expect(closedPopoverProblems(closed("pill"), "an outside click")).toEqual([
      "problems-popover: an outside click moved the focus to the pill; it closes without moving the focus",
    ]);
    expect(closedPopoverProblems(closed("other"), "a row with an element")).toEqual([
      "problems-popover: a row with an element leaves the focus on other, expected the canvas",
    ]);
  });
});

describe("the drop zone (guide §9)", () => {
  const container = { width: 1280, height: 900 };
  const roles = {
    hover: "rgb(238, 241, 253)",
    interaktion: "rgb(51, 93, 229)",
    dangerFlaeche: "rgb(251, 238, 240)",
    danger: "rgb(205, 24, 57)",
    flaecheHoch: "rgb(255, 255, 255)",
  };
  const facts = (
    state: "over" | "forbidden",
    extra: Partial<DropZoneFacts> = {},
  ): DropZoneFacts => ({
    state,
    events: [
      { type: "dragenter", defaultPrevented: true, dropEffect: state === "over" ? "copy" : "none" },
      { type: "dragover", defaultPrevented: true, dropEffect: state === "over" ? "copy" : "none" },
    ],
    zone: {
      visible: true,
      box: { left: 12, top: 12, width: 1256, height: 876 },
      ariaHidden: "true",
      background: state === "over" ? roles.hover : roles.dangerFlaeche,
      borderStyle: "dashed",
      borderWidth: "2px",
      borderColor: state === "over" ? roles.interaktion : roles.danger,
      radius: "16px",
      cursor: "auto",
    },
    chip: { text: "Drop file here", background: roles.flaecheHoch },
    roles,
    ...extra,
  });

  it("accepts drag-over and forbidden in the colours of guide §9", () => {
    expect(dropStateProblems(facts("over"), "over", "a drag", container)).toEqual([]);
    expect(dropStateProblems(facts("forbidden"), "forbidden", "two files", container)).toEqual([]);
  });

  it("reports the wrong state, an unprevented drag, the drop effect, the inset, the colours and the chip", () => {
    const broken = facts("over", {
      events: [{ type: "dragover", defaultPrevented: false, dropEffect: "copy" }],
      chip: { text: "", background: roles.hover },
    });
    broken.zone = {
      ...broken.zone!,
      box: { left: 0, top: 12, width: 1268, height: 876 },
      ariaHidden: null,
    };
    expect(dropStateProblems(broken, "forbidden", "two files", container)).toEqual([
      'drop-zone: two files sets data-drop="over", expected "forbidden" (guide §9)',
      "drop-zone: two files is not prevented, so the browser would open the file",
      'drop-zone: two files has dropEffect "copy", expected "none"',
      "drop-zone: left is 0px, expected 12px (±1px) (two files)",
      'drop-zone: the overlay lacks aria-hidden="true"',
      `drop-zone: two files fills ${roles.hover}, expected --cd-ui-danger-flaeche (${roles.dangerFlaeche}) (guide §9)`,
      `drop-zone: two files has a 2px dashed ${roles.interaktion} border, expected 2px dashed --cd-ui-danger (${roles.danger}) (guide §9)`,
      "drop-zone: two files shows no chip text (guide §9)",
    ]);
    const chip = facts("over", { chip: { text: "Drop file here", background: roles.hover } });
    expect(dropStateProblems(chip, "over", "a drag", container)).toEqual([
      `drop-zone: the chip fills ${roles.hover}, expected --cd-ui-flaeche-hoch (${roles.flaecheHoch})`,
    ]);
    expect(dropStateProblems(facts("over", { zone: null }), "over", "a drag", container)).toEqual([
      "drop-zone: a drag shows no drop zone (guide §9)",
    ]);
  });

  it("leaves drags without files alone", () => {
    const none: DropZoneFacts = {
      ...facts("over"),
      state: null,
      zone: { ...facts("over").zone!, visible: false },
    };
    none.events = [{ type: "dragover", defaultPrevented: false, dropEffect: "none" }];
    expect(dropStateProblems(none, "none", "a text drag", container)).toEqual([]);
    expect(dropStateProblems(facts("over"), "none", "a text drag", container)).toEqual([
      'drop-zone: a text drag sets data-drop="over"; it is no file drag',
      "drop-zone: a text drag shows the drop zone",
      "drop-zone: a text drag is prevented; the drop zone leaves non-file drags alone",
    ]);
  });
});

describe("the web app's mode (guide §13.3)", () => {
  const colors = { light: "#335DE5", dark: "#1D1D1D" };
  const system = (): WebModeFacts => ({
    theme: "system",
    kontrast: null,
    colorScheme: "light dark",
    themeColors: [
      { content: "#335DE5", media: "(prefers-color-scheme: light)" },
      { content: "#1D1D1D", media: "(prefers-color-scheme: dark)" },
    ],
    stored: null,
    storageBlocked: false,
    noTransition: false,
  });

  it("expects light for a light-only modeler, the system or the choice for a dark-capable one", () => {
    expect(expectedWebMode({ theme: "dark", kontrast: "hoch" }, ["light"], "dark")).toEqual({
      carrier: "light",
      effective: { theme: "light", kontrast: "hoch" },
    });
    expect(expectedWebMode({ theme: "dark" }, ["light", "dark"], "system")).toEqual({
      carrier: "system",
      effective: { theme: "dark" },
    });
    expect(expectedWebMode({ theme: "dark" }, ["light", "dark"], "light")).toEqual({
      carrier: "light",
      effective: { theme: "light" },
    });
  });

  it("wants one theme-color without media in a light-only app", () => {
    const light: WebModeFacts = {
      ...system(),
      theme: "light",
      colorScheme: null,
      themeColors: [{ content: "#335DE5", media: null }],
    };
    expect(webModeProblems(light, ["light"], "system", undefined)).toEqual([]);
    expect(
      webModeProblems({ ...system(), colorScheme: "light dark" }, ["light"], "system", undefined),
    ).toEqual([
      "mode: a light-only web app carries one theme-color without media (guide §13.3); found #335DE5 ((prefers-color-scheme: light)), #1D1D1D ((prefers-color-scheme: dark))",
      'mode: a light-only web app declares color-scheme "light dark"',
    ]);
  });

  it("checks color-scheme, the stored choice and both theme-colors of a dark-capable app", () => {
    expect(webModeProblems(system(), ["light", "dark"], "system", colors)).toEqual([]);
    const dark: WebModeFacts = {
      ...system(),
      theme: "dark",
      colorScheme: "dark",
      themeColors: system().themeColors.map((meta) => ({ ...meta, content: "#1D1D1D" })),
      stored: "dark",
    };
    expect(webModeProblems(dark, ["light", "dark"], "dark", colors)).toEqual([]);
    expect(webModeProblems(system(), ["light", "dark"], "dark", colors)).toEqual([
      'mode: with Dark <meta name="color-scheme"> reads "light dark", expected "dark" (guide §13.3)',
      'mode: with Dark localStorage holds miragon.darstellung=(none), expected "dark" (guide §13.3)',
      "mode: with Dark the theme-color metas read #335DE5 (light) and #1D1D1D (dark), expected #1D1D1D and #1D1D1D (guide §13.3)",
    ]);
    expect(webModeProblems(dark, ["light", "dark"], "system", colors)).toEqual([
      'mode: with System <meta name="color-scheme"> reads "dark", expected "light dark" (guide §13.3)',
      'mode: with System localStorage keeps miragon.darstellung="dark"; System removes the entry (guide §13.3)',
      "mode: with System the theme-color metas read #1D1D1D (light) and #1D1D1D (dark), expected #335DE5 and #1D1D1D (guide §13.3)",
    ]);
    expect(
      webModeProblems(
        { ...system(), storageBlocked: true, stored: null, themeColors: [] },
        ["light", "dark"],
        "light",
        colors,
      ),
    ).toEqual([
      'mode: with Light <meta name="color-scheme"> reads "light dark", expected "light" (guide §13.3)',
      "mode: a dark-capable web app carries two theme-color metas, one per prefers-color-scheme (guide §13.3)",
    ]);
  });

  it("switches everything in one frame with transitions off", () => {
    const change = (
      part: ModeChange["part"],
      frame: number,
      value: string | null = "x",
    ): ModeChange => ({
      part,
      value,
      frame,
    });
    expect(
      modeSwitchProblems(
        [
          change("no-transition", 3, "on"),
          change("theme", 3),
          change("color-scheme", 3),
          change("theme-color", 3),
          change("no-transition", 5, "off"),
        ],
        "Dark",
      ),
    ).toEqual([]);
    expect(modeSwitchProblems([change("theme", 3), change("theme-color", 5)], "Dark")).toEqual([
      "mode: choosing Dark changed theme in frame 3, theme-color in frame 5; one frame for all of them (guide §13.3)",
      "mode: choosing Dark switched without cd-shell-no-transition on <html> in that frame (guide §7: no colour fades)",
    ]);
    expect(modeSwitchProblems([change("no-transition", 1, "on")], "Light")).toEqual([
      "mode: choosing Light changed nothing on <html> or its meta tags",
    ]);
  });

  it("judges the carrier of a dark-capable app on system by the page's effective mode", () => {
    const facts = appearance({
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "system",
          kontrast: null,
        },
      ],
      parts: ["root", "canvas", "menu", "palette", "zoom", "dropdown", "tooltip"].map((name) =>
        part(name, "dark"),
      ),
    });
    const web = expectedWebMode({ theme: "dark" }, ["light", "dark"], "system");
    expect(
      appearanceProblems(facts, "web", { theme: "dark" }, ["light", "dark"], web).problems,
    ).toEqual([]);
    const light = appearance({
      themed: [
        {
          description: "html",
          isDocument: true,
          relation: "ancestor",
          theme: "system",
          kontrast: null,
        },
      ],
    });
    expect(
      appearanceProblems(light, "web", { theme: "dark" }, ["light", "dark"], web).problems,
    ).toEqual(
      ["root", "canvas", "menu", "palette", "zoom", "dropdown", "tooltip"].map(
        (name) => `${name}: color-scheme is "light" (requested dark, expected system showing dark)`,
      ),
    );
  });

  it("speaks English for en and its regions only", () => {
    expect([
      speaksEnglish("en"),
      speaksEnglish("en-GB"),
      speaksEnglish("de"),
      speaksEnglish(""),
    ]).toEqual([true, true, false, false]);
  });
});

describe("web-column bookkeeping", () => {
  it("names a drop fixture the harness both gives and declares absent", () => {
    const harness = {
      host: "web" as const,
      themes: ["light"] as const,
      async open() {},
      drop: { accepted: { name: "a.json", type: "application/json", text: "{}" } },
      absent: ["drop", "toast"] as const,
      show: { async toast() {} },
    };
    expect(harnessHookProblems(harness, ["drop", "toast", "emptyState"])).toEqual([
      'harness: absent lists "drop", but harness.drop is given',
      'harness: absent lists "toast", but show.toast is given',
    ]);
  });

  it("finds the web app's root state attributes after destroy", () => {
    const facts: LeftoverFacts = {
      classedElements: [],
      documentClasses: [],
      chromeElements: [],
      rootClasses: [],
      rootAttributes: ["id", "data-primary", "data-zoom-row", "data-empty-state", "data-drop"],
      errors: [],
    };
    expect(leftoverProblems(facts, "web")).toEqual([
      "the root keeps data-primary after destroy",
      "the root keeps data-zoom-row after destroy",
      "the root keeps data-empty-state after destroy",
      "the root keeps data-drop after destroy",
    ]);
  });
});

describe("overlayLayerProblems", () => {
  const toolbar = { description: "div.note-toolbar", zIndex: 300 };
  const popup = { description: "div.djs-popup", zIndex: 200 };
  const prompt = { description: "div.pad-prompt", zIndex: 210 };
  const rule =
    "above the palette at 110; an overlay that stays (a toolbar, a prompt, a label editor) lies at 100 or below, only a popup that closes on a pan or zoom may cover the palette (guide §5.13)";

  it("passes a state without layers above the limit, and popups that close on a zoom", () => {
    expect(
      overlayLayerProblems({ state: "as opened", palette: 110, before: [], afterZoom: null }),
    ).toEqual([]);
    expect(
      overlayLayerProblems({
        state: 'after a click on context-pad entry "change-kind" of "a"',
        palette: 110,
        before: [popup],
        afterZoom: { stays: [], back: [] },
      }),
    ).toEqual([]);
  });

  it("fails a layer above the limit that stays when the view zooms, not one that came with the zoom", () => {
    expect(
      overlayLayerProblems({
        state: 'with "a" selected',
        palette: 110,
        before: [toolbar, popup],
        afterZoom: {
          stays: [toolbar, { description: "div.hover-tooltip", zIndex: 1000 }],
          back: [],
        },
      }),
    ).toEqual([
      `canvas: div.note-toolbar lies at z-index 300 in .djs-container with "a" selected and stays when the view zooms, ${rule}`,
    ]);
  });

  it("fails a layer above the limit that only hides while the view changes", () => {
    expect(
      overlayLayerProblems({
        state: 'after a click on context-pad entry "note" of "a"',
        palette: 110,
        before: [prompt, popup],
        afterZoom: {
          stays: [],
          back: [prompt, { description: "div.hover-tooltip", zIndex: 1000 }],
        },
      }),
    ).toEqual([
      `canvas: div.pad-prompt lies at z-index 210 in .djs-container after a click on context-pad entry "note" of "a" and comes back once the zoomed view has settled, ${rule}`,
    ]);
  });

  it("puts a layer above the palette only where its z-index is, the limit otherwise", () => {
    const stays = (zIndex: number, palette: number | null) => {
      const layer = { description: "div.pad-prompt", zIndex };
      return overlayLayerProblems({
        state: 'with "a" selected',
        palette,
        before: [layer],
        afterZoom: { stays: [layer], back: [] },
      }).map((problem) => problem.slice(0, problem.indexOf(";")));
    };
    const start = "canvas: div.pad-prompt lies at z-index";
    const middle = 'in .djs-container with "a" selected and stays when the view zooms';
    expect(stays(105, 110)).toEqual([
      `${start} 105 ${middle}, above the limit of 100 (the palette lies at 110)`,
    ]);
    expect(stays(110, 110)).toEqual([
      `${start} 110 ${middle}, above the limit of 100 (the palette lies at 110)`,
    ]);
    expect(stays(111, 110)).toEqual([`${start} 111 ${middle}, above the palette at 110`]);
    expect(stays(300, null)).toEqual([`${start} 300 ${middle}, above the limit of 100`]);
  });

  it("reports a state whose layers no zoom could test", () => {
    expect(
      overlayLayerProblems({ state: "as opened", palette: null, before: [popup], afterZoom: null }),
    ).toEqual([
      "canvas: neither Cmd/Ctrl+Plus nor Cmd/Ctrl+Minus at the canvas changed the view as opened, so whether div.djs-popup at z-index 200 closes on a zoom was not verified",
    ]);
  });
});
