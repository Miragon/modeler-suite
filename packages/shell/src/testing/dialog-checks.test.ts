import { describe, expect, it } from "vitest";

import {
  closedProblems,
  dialogRingProblems,
  forcedDialogProblems,
  shortcutsDialogProblems,
  trapProblems,
  viewRowProblems,
  type ChromeTooltip,
} from "./dialog-checks.js";
import type {
  DialogChipFacts,
  DialogFocusFacts,
  DialogGroupFacts,
  ShellDialogFacts,
} from "./dialog-facts.js";
import type { SystemColorFacts } from "./media-facts.js";

const ROLES = {
  flaecheHoch: "rgb(255, 255, 255)",
  linie: "rgb(230, 226, 226)",
  kontur: "rgb(118, 118, 118)",
  fokus: "rgb(30, 70, 200)",
  backdrop: "rgba(29, 29, 29, 0.42)",
  textLeise: "rgb(90, 90, 90)",
  grund: "rgb(245, 245, 245)",
  radiusMd: "12px",
  radiusSm: "6px",
  shadow3: "rgba(29, 29, 29, 0.16) 0px 12px 32px 0px",
};

const TOOLTIPS: readonly ChromeTooltip[] = [
  { key: "zoomIn", label: "Zoom in", shortcut: "⌘+" },
  { key: "zoomOut", label: "Zoom out", shortcut: "⌘−" },
  { key: "zoomToActual", label: "Zoom to 100%", shortcut: "⌘0" },
  { key: "fit", label: "Fit to view", shortcut: "⇧1" },
];

const line = (color: string) => ({ width: 1, style: "solid", color });

function chip(text: string, overrides: Partial<DialogChipFacts> = {}): DialogChipFacts {
  return {
    text,
    fontFamily: '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
    fontSize: "13px",
    fontWeight: "400",
    color: ROLES.textLeise,
    background: ROLES.grund,
    border: line(ROLES.linie),
    radius: ROLES.radiusSm,
    padding: "1px 6px",
    boxShadow: "none",
    ...overrides,
  };
}

function viewGroup(): DialogGroupFacts {
  return {
    heading: "View",
    labelled: true,
    rows: [
      ...TOOLTIPS.map((tooltip) => ({
        chromeKey: tooltip.key,
        action: tooltip.label,
        rowHeader: true,
        keys: [tooltip.shortcut],
      })),
      { chromeKey: null, action: "Move the canvas", rowHeader: true, keys: ["⌘←"] },
    ],
  };
}

function facts(): ShellDialogFacts {
  return {
    open: 1,
    dialog: {
      description: "dialog.cd-shell-dialog.cd-shell-shortcuts",
      modal: true,
      viewport: { width: 1280, height: 900 },
      box: { left: 360, top: 150, width: 560, height: 600 },
      name: { text: "Keyboard shortcuts", tag: "h2" },
      title: { fontSize: "21px", fontWeight: "600" },
      background: ROLES.flaecheHoch,
      border: {
        top: line(ROLES.linie),
        right: line(ROLES.linie),
        bottom: line(ROLES.linie),
        left: line(ROLES.linie),
      },
      radius: "12px",
      boxShadow: ROLES.shadow3,
      backdrop: { background: ROLES.backdrop, filter: "blur(3px) grayscale(1)" },
      headerPadding: "16px 16px 8px 24px",
      bodyPadding: "8px 24px 24px",
      close: {
        name: "Close",
        width: 32,
        height: 32,
        background: "rgba(0, 0, 0, 0)",
        icon: { width: 16, height: 16 },
        client: { x: 900, y: 175 },
      },
      groups: [
        viewGroup(),
        {
          heading: "Edit",
          labelled: true,
          rows: [{ chromeKey: null, action: "Undo", rowHeader: true, keys: ["⌘Z"] }],
        },
      ],
      chips: [chip("⌘+"), chip("⌘Z")],
      tabStops: 1,
      roles: ROLES,
    },
    focus: { description: "button.cd-shell-dialog-close", inDialog: true, onMenuTrigger: false },
  };
}

type Dialog = NonNullable<ShellDialogFacts["dialog"]>;

function withDialog(change: (dialog: Dialog) => void): ShellDialogFacts {
  const changed = facts();
  change(changed.dialog!);
  return changed;
}

const NORMAL = { tooltips: TOOLTIPS, highContrast: false };

describe("shortcutsDialogProblems (guide §5.4, §5.6, §8)", () => {
  it("passes the dialog of the guide", () => {
    expect(shortcutsDialogProblems(facts(), NORMAL)).toEqual([]);
  });

  it("fails when no shell dialog opened", () => {
    expect(shortcutsDialogProblems({ ...facts(), open: 0, dialog: null }, NORMAL)).toEqual([
      expect.stringMatching(/opened no dialog\.cd-shell-dialog/),
    ]);
  });

  it("fails a dialog outside the top layer and a focus left outside", () => {
    const changed = withDialog((dialog) => {
      dialog.modal = false;
    });
    changed.focus = {
      description: "button.cd-shell-menu-trigger",
      inDialog: false,
      onMenuTrigger: true,
    };
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/focus is on button\.cd-shell-menu-trigger, outside the dialog/),
      expect.stringMatching(/not modal; it opens with showModal\(\)/),
    ]);
  });

  it("fails a backdrop without grayscale(1), in either mode", () => {
    const changed = withDialog((dialog) => {
      dialog.backdrop.filter = "blur(3px)";
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/backdrop filters "blur\(3px\)", expected blur\(3px\) grayscale\(1\)/),
    ]);
  });

  it("fails a panel off the guide's surface, border, radius, shadow and size", () => {
    const changed = withDialog((dialog) => {
      dialog.background = "rgb(250, 250, 250)";
      dialog.border.left = line("rgb(0, 0, 0)");
      dialog.radius = "16px";
      dialog.boxShadow = "none";
      dialog.box = { left: 340, top: 150, width: 600, height: 600 };
    });
    const problems = shortcutsDialogProblems(changed, NORMAL);
    expect(problems).toEqual([
      expect.stringMatching(/panel is rgb\(250, 250, 250\), expected --cd-ui-flaeche-hoch/),
      expect.stringMatching(
        /the left border is 1px solid rgb\(0, 0, 0\), expected 1px solid --cd-ui-linie/,
      ),
      expect.stringMatching(/radius 16px, expected --cd-radius-md/),
      expect.stringMatching(/shadow none, expected --cd-shadow-3/),
      expect.stringMatching(
        /600px wide in a 1280px window, expected min\(560px, 100% - 32px\) = 560px/,
      ),
    ]);
  });

  it("fails a dialog taller than the window allows", () => {
    const changed = withDialog((dialog) => {
      dialog.box = { left: 360, top: 0, width: 560, height: 900 };
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/900px high in a 900px window, expected at most 100% - 32px/),
    ]);
  });

  it("fails header, body and title off the guide's measures", () => {
    const changed = withDialog((dialog) => {
      dialog.headerPadding = "16px";
      dialog.bodyPadding = "16px";
      dialog.title = { fontSize: "16px", fontWeight: "700" };
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/title is 16px\/700, expected 21px\/600/),
      expect.stringMatching(/header's padding is 16px, expected 16px 16px 8px 24px/),
      expect.stringMatching(/body's padding is 16px, expected 8px 24px 24px/),
    ]);
  });

  it("fails a Close without name, its 32px box, its icon or as a filled button", () => {
    const changed = withDialog((dialog) => {
      dialog.close = {
        ...dialog.close!,
        name: "",
        width: 24,
        icon: null,
        background: "rgb(1, 2, 3)",
      };
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/Close has no accessible name/),
      expect.stringMatching(/Close is 24 × 32, expected 32 × 32/),
      expect.stringMatching(/Close shows no 16px icon/),
      expect.stringMatching(/Close is filled rgb\(1, 2, 3\) at rest/),
    ]);
  });

  it("fails an unlabelled table, a row without its header cell and a row without chips", () => {
    const changed = withDialog((dialog) => {
      dialog.groups[1] = {
        heading: "Edit",
        labelled: false,
        rows: [{ chromeKey: null, action: "Undo", rowHeader: false, keys: [] }],
      };
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(/group "Edit": the table is not labelled by the group's heading/),
      expect.stringMatching(/the row "Undo" has no <th scope="row">/),
      expect.stringMatching(/the row "Undo" shows no key chip/),
    ]);
  });

  it("names the first chip that is not the tooltip's, once", () => {
    const changed = withDialog((dialog) => {
      dialog.chips = [
        chip("⌘+"),
        chip("⌘Z", { fontFamily: "monospace", boxShadow: "rgb(0, 0, 0) 0px 1px 0px 0px" }),
        chip("L", { color: "rgb(0, 0, 0)" }),
      ];
    });
    expect(shortcutsDialogProblems(changed, NORMAL)).toEqual([
      expect.stringMatching(
        /the chip "⌘Z" has font monospace, shadow rgb\(0, 0, 0\) 0px 1px 0px 0px; a chip is the tooltip's/,
      ),
    ]);
  });

  it("in high contrast asks for no shadow and the contour border, and leaves the tables alone", () => {
    const shadowed = facts();
    expect(shortcutsDialogProblems(shadowed, { tooltips: TOOLTIPS, highContrast: true })).toEqual([
      expect.stringMatching(
        /the top, right, bottom, left border is 1px solid rgb\(230, 226, 226\), expected 1px solid --cd-ui-kontur/,
      ),
      expect.stringMatching(/shadow .* in high contrast, expected none/),
    ]);
    const contrast = withDialog((dialog) => {
      dialog.boxShadow = "none";
      for (const side of ["top", "right", "bottom", "left"] as const) {
        dialog.border[side] = line(ROLES.kontur);
      }
      dialog.chips = [chip("⌘+", { border: line(ROLES.kontur) })];
    });
    expect(shortcutsDialogProblems(contrast, { tooltips: TOOLTIPS, highContrast: true })).toEqual(
      [],
    );
  });
});

describe("viewRowProblems (guide §5.4, §5.8)", () => {
  const dialog = () => facts().dialog!;

  it("fails without the chrome's rows", () => {
    const changed = dialog();
    changed.groups[0] = { ...viewGroup(), rows: [viewGroup().rows[4]!] };
    expect(viewRowProblems(changed, TOOLTIPS)).toEqual([
      expect.stringMatching(/no group holds the chrome's zoom and fit keys/),
    ]);
  });

  it("fails the chrome's rows out of the zoom panel's order or below a modeler row", () => {
    const changed = dialog();
    const rows = viewGroup().rows;
    changed.groups[0] = {
      ...viewGroup(),
      rows: [rows[4]!, rows[1]!, rows[0]!, rows[2]!, rows[3]!],
    };
    expect(viewRowProblems(changed, TOOLTIPS)).toEqual([
      expect.stringMatching(
        /the chrome's rows are zoomOut, zoomIn, zoomToActual, fit, expected zoomIn, zoomOut, zoomToActual, fit at the top of the View group "View"/,
      ),
    ]);
  });

  it("fails a View row that says something else than its tooltip", () => {
    const changed = dialog();
    const rows = viewGroup().rows.map((row) =>
      row.chromeKey === "fit" ? { ...row, keys: ["Shift+1"] } : row,
    );
    changed.groups[0] = { ...viewGroup(), rows };
    expect(viewRowProblems(changed, TOOLTIPS)).toEqual([
      expect.stringMatching(
        /the View row of fit says "Fit to view" with "Shift\+1", but its tooltip says "Fit to view" with "⇧1"/,
      ),
    ]);
  });

  it("fails a modeler row that repeats a chrome row", () => {
    const changed = dialog();
    changed.groups[1]!.rows = [
      { chromeKey: null, action: "Zoom in", rowHeader: true, keys: ["⌘+"] },
    ];
    expect(viewRowProblems(changed, TOOLTIPS)).toEqual([
      expect.stringMatching(
        /"Zoom in" shows twice, as the chrome's row and as a row of group "Edit"/,
      ),
    ]);
  });
});

describe("focus checks (guide §8, §12)", () => {
  const focus = (overrides: Partial<DialogFocusFacts>): DialogFocusFacts => ({
    open: true,
    description: "button.cd-shell-dialog-close",
    inDialog: true,
    onMenuTrigger: false,
    outline: { width: 2, style: "solid", color: ROLES.fokus },
    ...overrides,
  });

  it("keeps the focus inside on Tab", () => {
    expect(trapProblems("Tab × 2", focus({}))).toEqual([]);
    expect(trapProblems("Tab × 2", focus({ inDialog: false, description: "<body>" }))).toEqual([
      expect.stringMatching(/after Tab × 2 the focus is on <body>, outside the dialog/),
    ]);
    expect(trapProblems("Tab × 2", focus({ open: false }))).toEqual([
      "shortcuts dialog: Tab × 2 closed the dialog",
    ]);
  });

  it("rings the focus in --cd-ui-fokus, 3px in high contrast", () => {
    expect(dialogRingProblems(focus({}), ROLES.fokus, false)).toEqual([]);
    expect(dialogRingProblems(focus({}), ROLES.fokus, true)).toEqual([
      expect.stringMatching(/solid 2px in rgb\(30, 70, 200\), expected solid 3px in --cd-ui-fokus/),
    ]);
    expect(
      dialogRingProblems(
        focus({ outline: { width: 0, style: "none", color: "" } }),
        ROLES.fokus,
        false,
      ),
    ).toHaveLength(1);
  });

  it("closes and hands the focus back to the menu trigger", () => {
    expect(closedProblems("Escape", focus({ open: false, onMenuTrigger: true }))).toEqual([]);
    expect(closedProblems("Escape", focus({}))).toEqual([
      "shortcuts dialog: Escape does not close it (guide §8)",
    ]);
    expect(
      closedProblems("a click on the backdrop", focus({ open: false, description: "<body>" })),
    ).toEqual([
      expect.stringMatching(
        /after a click on the backdrop the focus is on <body>, expected back on the menu trigger/,
      ),
    ]);
  });
});

describe("forcedDialogProblems (guide §5.14)", () => {
  const system: SystemColorFacts = {
    canvas: "rgb(255, 255, 255)",
    canvasText: "rgb(0, 0, 0)",
    highlight: "rgb(0, 120, 215)",
    buttonText: "rgb(0, 0, 0)",
  };

  it("asks for the panel's border in CanvasText", () => {
    const forced = withDialog((dialog) => {
      for (const side of ["top", "right", "bottom", "left"] as const) {
        dialog.border[side] = line(system.canvasText);
      }
    });
    expect(forcedDialogProblems(forced, system)).toEqual([]);
    expect(forcedDialogProblems(facts(), system)).toEqual([
      expect.stringMatching(
        /has its top, right, bottom, left border as 1px solid rgb\(230, 226, 226\), expected CanvasText/,
      ),
    ]);
  });
});
