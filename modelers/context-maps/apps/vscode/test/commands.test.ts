import { beforeEach, describe, expect, it } from "vitest";
import {
  ActivePanels,
  NO_MAP_MESSAGE,
  OPEN_SOURCE_COMMAND,
  WEBVIEW_COMMANDS,
  registerSideBySideCommands,
  registerWebviewCommands,
} from "../src/commands.js";
import { EventEmitter, Uri, ViewColumn, vscodeMock } from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());

interface FakePanel {
  posted: unknown[];
  setActive(active: boolean): void;
  close(): void;
}

/** The commands as `activate` registers them, over one `ActivePanels` both editors report to. */
function registerCommands(): {
  open(path: string, options?: { text?: boolean; active?: boolean }): FakePanel;
} {
  const panels = new ActivePanels();
  registerWebviewCommands((name) => panels.runCommand(name));
  registerSideBySideCommands(() => panels.activeTextDocumentUri());
  return {
    open(path, { text = true, active = true } = {}) {
      const viewState = new EventEmitter<unknown>();
      const posted: unknown[] = [];
      const panel = {
        active,
        webview: {
          postMessage(message: unknown): Promise<boolean> {
            posted.push(message);
            return Promise.resolve(true);
          },
        },
        onDidChangeViewState: viewState.event,
      };
      const tracking = panels.track(panel as never, Uri.file(path) as never, { text });
      return {
        posted,
        setActive(next) {
          panel.active = next;
          viewState.fire({ webviewPanel: panel });
        },
        close: () => tracking.dispose(),
      };
    },
  };
}

function openedBeside(): unknown[][] {
  return vscodeMock.executedCommands().filter(([command]) => command === "vscode.openWith");
}

function infoMessages(): string[] {
  return vscodeMock
    .notifications()
    .filter(({ level }) => level === "info")
    .map(({ message }) => message);
}

describe("Open Source to the Side without a resource", () => {
  it("opens the diagram focused last once a walkthrough link has taken the focus", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.cm").setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
    expect(infoMessages()).toEqual([]);
  });

  it("follows the order the diagrams were focused in", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    a.setActive(false);
    diagrams.open("/b.cm").setActive(false);
    a.setActive(true);
    a.setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("puts a diagram opened in the background behind the ones focused before", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    diagrams.open("/b.cm", { active: false });
    a.setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("passes over a PNG diagram focused later, which has no source", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.cm").setActive(false);
    diagrams.open("/b.cm.png", { text: false }).setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("opens no source for a focused PNG diagram", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.cm").setActive(false);
    diagrams.open("/b.cm.png", { text: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(infoMessages()).toEqual([NO_MAP_MESSAGE]);
  });

  it("forgets a closed diagram and asks for one once none is open", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    a.setActive(false);
    diagrams.open("/b.cm").close();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    a.close();
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
    expect(infoMessages()).toEqual([NO_MAP_MESSAGE]);
  });
});

describe("fit and export from the Command Palette", () => {
  it.each(Object.entries(WEBVIEW_COMMANDS))("posts %s to the focused diagram", (name, id) => {
    const diagrams = registerCommands();
    const png = diagrams.open("/a.cm.png", { text: false });

    vscodeMock.runCommand(id);

    expect(png.posted).toEqual([{ type: "command", name }]);
  });

  it("needs the focused diagram, not the one focused last", () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    a.setActive(false);

    vscodeMock.runCommand(WEBVIEW_COMMANDS.fitView);

    expect(a.posted).toEqual([]);
    expect(infoMessages()).toEqual([NO_MAP_MESSAGE]);
  });
});
