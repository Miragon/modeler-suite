import { describe, expect, it } from "vitest";
import { defaultMessages, resolveMessages, type ShellMessages } from "./messages.js";

describe("defaultMessages (guide §2)", () => {
  it("names the chrome with the shared English terms", () => {
    expect(defaultMessages.menu).toBe("Menu");
    expect(defaultMessages.tools).toBe("Tools");
    expect(defaultMessages.canvas).toBe("Diagram");
    expect(defaultMessages.zoom).toBe("Zoom");
    expect(defaultMessages.zoomOut).toBe("Zoom out");
    expect(defaultMessages.zoomIn).toBe("Zoom in");
    expect(defaultMessages.zoomToActual("100%")).toBe("Zoom to 100%");
    expect(defaultMessages.zoomToActualNow("100%", "86%")).toBe("Zoom to 100% (now 86%)");
    expect(defaultMessages.fit).toBe("Fit to view");
    expect(defaultMessages.legend).toBe("Legend");
    expect(defaultMessages.closeLegend).toBe("Close legend");
    expect(defaultMessages.showProblems).toBe("Show in Problems view");
    expect(defaultMessages.emptyHint).toBe("Pick a tool from the palette to start.");
    expect(defaultMessages.insertExample).toBe("Insert example");
    expect(defaultMessages.keyNames).toEqual({
      ctrl: "Ctrl",
      shift: "Shift",
      plus: "Plus",
      minus: "Minus",
    });
  });

  it("counts problems in singular and plural", () => {
    expect(defaultMessages.problems(1, "1")).toBe("1 problem");
    expect(defaultMessages.problems(2, "2")).toBe("2 problems");
    expect(defaultMessages.problems(0, "0")).toBe("0 problems");
    expect(defaultMessages.problems(1234, "1,234")).toBe("1,234 problems");
  });

  it("names count and errors in the pill label", () => {
    expect(defaultMessages.problemsLabel(2, 0, "2", "0")).toBe("2 problems, no errors");
    expect(defaultMessages.problemsLabel(2, 1, "2", "1")).toBe("2 problems, 1 error");
    expect(defaultMessages.problemsLabel(3, 2, "3", "2")).toBe("3 problems, 2 errors");
    expect(defaultMessages.problemsLabel(1, 1, "1", "1")).toBe("1 problem, 1 error");
  });

  it("explains an invalid file with the notation's name", () => {
    expect(defaultMessages.invalidFile("Event Storming board")).toBe(
      "This file isn't a valid Event Storming board right now. The diagram shows the last valid version and is read-only until you fix the text.",
    );
  });

  it("names the web chrome with the shared English terms, Impressum and Datenschutz aside", () => {
    expect(defaultMessages.share).toBe("Share");
    expect(defaultMessages.legal).toBe("Legal");
    expect(defaultMessages.copyright(2026)).toBe("© 2026 Miragon GmbH");
    expect(defaultMessages.newDiagram).toBe("New diagram");
    expect(defaultMessages.openFile).toBe("Open…");
    expect(defaultMessages.showExample).toBe("Show example");
    expect(defaultMessages.importFile).toBe("Import…");
    expect(defaultMessages.appearance).toBe("Appearance");
    expect([
      defaultMessages.appearanceSystem,
      defaultMessages.appearanceLight,
      defaultMessages.appearanceDark,
    ]).toEqual(["System", "Light", "Dark"]);
    expect(defaultMessages.problemsTitle).toBe("Problems");
    expect([
      defaultMessages.problemSeverity("error"),
      defaultMessages.problemSeverity("warning"),
    ]).toEqual(["Error", "Warning"]);
    expect(defaultMessages.close).toBe("Close");
    expect(defaultMessages.dropFile).toBe("Drop file here");
    expect(defaultMessages.dropForbidden("multiple")).toBe("Drop one file at a time");
    expect(defaultMessages.cannotOpenFile("map.png", ".storm or .json")).toBe(
      "Couldn't open “map.png”. Drop a .storm or .json file.",
    );
  });

  it("names the shortcuts dialog and its groups as guide §5.4 does", () => {
    expect(defaultMessages.shortcutsTitle).toBe("Keyboard shortcuts");
    expect([
      defaultMessages.shortcutsView,
      defaultMessages.shortcutsEdit,
      defaultMessages.shortcutsTools,
    ]).toEqual(["View", "Edit", "Tools"]);
  });
});

describe("resolveMessages", () => {
  it("returns the defaults without overrides, as a copy", () => {
    const messages = resolveMessages();
    expect(messages).toEqual(defaultMessages);
    expect(messages).not.toBe(defaultMessages);
    expect(messages.keyNames).not.toBe(defaultMessages.keyNames);
    messages.keyNames.ctrl = "changed";
    expect(defaultMessages.keyNames.ctrl).toBe("Ctrl");
  });

  it("applies texts and functions, keeping the rest", () => {
    const problems = (count: number, formatted: string) =>
      `${formatted} ${count === 1 ? "Problem" : "Probleme"}`;
    const messages = resolveMessages({ menu: "Menü", problems });
    expect(messages.menu).toBe("Menü");
    expect(messages.problems(2, "2")).toBe("2 Probleme");
    expect(messages.tools).toBe("Tools");
    expect(messages.zoomToActualNow("100%", "86%")).toBe("Zoom to 100% (now 86%)");
  });

  it("merges the key names key by key", () => {
    expect(resolveMessages({ keyNames: { ctrl: "Strg", shift: "Umschalt" } }).keyNames).toEqual({
      ctrl: "Strg",
      shift: "Umschalt",
      plus: "Plus",
      minus: "Minus",
    });
  });

  it("keeps the default where an override is undefined", () => {
    const messages = resolveMessages({
      menu: undefined,
      keyNames: { plus: undefined, minus: "Moins" },
    });
    expect(messages.menu).toBe("Menu");
    expect(messages.keyNames).toEqual({
      ctrl: "Ctrl",
      shift: "Shift",
      plus: "Plus",
      minus: "Moins",
    });
  });

  it("takes a whole localized table", () => {
    const german: ShellMessages = {
      menu: "Menü",
      tools: "Werkzeuge",
      canvas: "Diagramm",
      zoom: "Zoom",
      zoomOut: "Verkleinern",
      zoomIn: "Vergrößern",
      zoomToActual: (percent) => `Auf ${percent}`,
      zoomToActualNow: (percent, now) => `Auf ${percent} (jetzt ${now})`,
      fit: "Einpassen",
      legend: "Legende",
      closeLegend: "Legende schließen",
      problems: (count, formatted) => `${formatted} ${count === 1 ? "Problem" : "Probleme"}`,
      problemsLabel: (count, errors, formatted, formattedErrors) =>
        `${formatted} ${count === 1 ? "Problem" : "Probleme"}, ${
          errors === 0 ? "keine Fehler" : `${formattedErrors} Fehler`
        }`,
      showProblems: "In „Probleme“ zeigen",
      emptyHint: "Wähle ein Werkzeug aus der Palette.",
      insertExample: "Beispiel einfügen",
      invalidFile: (diagram) => `Die Datei ist gerade kein gültiges ${diagram}.`,
      keyNames: { ctrl: "Strg", shift: "Umschalt", plus: "Plus", minus: "Minus" },
      share: "Teilen",
      legal: "Rechtliches",
      copyright: (year) => `© ${year} Miragon GmbH`,
      newDiagram: "Neues Diagramm",
      openFile: "Öffnen …",
      showExample: "Beispiel zeigen",
      importFile: "Importieren …",
      appearance: "Darstellung",
      appearanceSystem: "System",
      appearanceLight: "Hell",
      appearanceDark: "Dunkel",
      problemsTitle: "Probleme",
      problemSeverity: (severity) => (severity === "error" ? "Fehler" : "Warnung"),
      close: "Schließen",
      dropFile: "Datei hier ablegen",
      dropForbidden: () => "Hier kannst du nichts ablegen",
      dropHint: "Oder lege eine Datei hier ab",
      openFileLink: "Datei öffnen…",
      opensInNewTab: "Öffnet in einem neuen Tab",
      cannotOpenFile: (name, accepted) =>
        `„${name}“ konnte nicht geöffnet werden. Lege eine ${accepted}-Datei ab.`,
      shortcutsTitle: "Tastenkürzel",
      shortcutsView: "Ansicht",
      shortcutsEdit: "Bearbeiten",
      shortcutsTools: "Werkzeuge",
    };
    expect(resolveMessages(german)).toEqual(german);
  });
});
