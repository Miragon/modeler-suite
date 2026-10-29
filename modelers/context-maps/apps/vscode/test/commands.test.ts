import { beforeEach, describe, expect, it } from "vitest";
import {
  ActivePanels,
  NO_MAP_MESSAGE,
  OPEN_SOURCE_COMMAND,
  PNG_VIEW_TYPE,
  WEBVIEW_COMMANDS,
  registerSideBySideCommands,
  registerWebviewCommands,
} from "../src/commands.js";
import { MAP_VIEW_TYPE } from "../src/mapEditorOptions.js";
import { EventEmitter, TabInputCustom, Uri, ViewColumn, vscodeMock } from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());

interface FakePanel {
  posted: unknown[];
  /** Every `reveal(viewColumn, preserveFocus)` call. */
  revealed: unknown[][];
  setActive(active: boolean): void;
  close(): void;
}

/** The commands as `activate` registers them, over one `ActivePanels` both editors report to. */
function registerCommands(): {
  open(path: string, options?: { text?: boolean; active?: boolean }): FakePanel;
} {
  const panels = new ActivePanels();
  registerWebviewCommands((name) => panels.runCommand(name));
  registerSideBySideCommands(() => panels.revealTextDiagram());
  return {
    open(path, { text = true, active = true } = {}) {
      const viewState = new EventEmitter<unknown>();
      const posted: unknown[] = [];
      const revealed: unknown[][] = [];
      const panel = {
        active,
        reveal(viewColumn?: unknown, preserveFocus?: unknown) {
          revealed.push([viewColumn, preserveFocus]);
        },
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
        revealed,
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

  it("opens the diagram that took the focus when it opened, not an earlier one", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    const b = diagrams.open("/b.cm");
    a.setActive(false);
    b.setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/b.cm"), "default", ViewColumn.Beside],
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

describe("Open Source to the Side beside the diagram", () => {
  it("shows the text diagram focused last and focuses it, so its group is the one the source opens beside", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    a.setActive(false);
    const png = diagrams.open("/b.cm.png", { text: false });
    png.setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([[undefined, false]]);
    expect(png.revealed).toEqual([]);
    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("leaves a focused diagram where it is", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("opens the resource of an editor title button without showing another diagram", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.cm");
    a.setActive(false);
    const uri = Uri.file("/b.cm");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND, uri);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", uri, "default", ViewColumn.Beside]]);
  });
});

describe("Open Source to the Side after a reload", () => {
  const walkthrough = undefined;
  const textTab = (path: string) => new TabInputCustom(Uri.file(path), MAP_VIEW_TYPE);
  const pngTab = (path: string) => new TabInputCustom(Uri.file(path), PNG_VIEW_TYPE);

  it("shows a diagram tab VS Code restored but has not resolved, then opens its source beside it", async () => {
    registerCommands();
    vscodeMock.setTabGroups([{ inputs: [walkthrough, textTab("/a.cm")], activeTab: 0 }]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), MAP_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
    expect(infoMessages()).toEqual([]);
  });

  it("prefers a tab of the active group, then the tab a group shows, then any other", async () => {
    registerCommands();
    vscodeMock.setTabGroups([
      { inputs: [textTab("/hidden.cm"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.cm")], activeTab: 0 },
      { inputs: [walkthrough, textTab("/beside-walkthrough.cm")], activeTab: 0, active: true },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [textTab("/hidden.cm"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.cm")], activeTab: 0 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [textTab("/hidden.cm"), walkthrough], activeTab: 1 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside().filter(([, , viewType]) => viewType === MAP_VIEW_TYPE)).toEqual([
      ["vscode.openWith", Uri.file("/beside-walkthrough.cm"), MAP_VIEW_TYPE, 3],
      ["vscode.openWith", Uri.file("/shown.cm"), MAP_VIEW_TYPE, 2],
      ["vscode.openWith", Uri.file("/hidden.cm"), MAP_VIEW_TYPE, 1],
    ]);
  });

  it("passes over a PNG diagram tab, which has no source", async () => {
    registerCommands();
    vscodeMock.setTabGroups([{ inputs: [walkthrough, pngTab("/b.cm.png"), textTab("/a.cm")] }]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), MAP_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("looks for a restored tab when only PNG diagrams were focused", async () => {
    const diagrams = registerCommands();
    diagrams.open("/b.cm.png", { text: false }).setActive(false);
    vscodeMock.setTabGroups([{ inputs: [walkthrough, textTab("/a.cm")] }]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), MAP_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
  });

  it("opens no source for a focused PNG diagram, even with a text diagram tab restored", async () => {
    const diagrams = registerCommands();
    diagrams.open("/b.cm.png", { text: false });
    vscodeMock.setTabGroups([{ inputs: [textTab("/a.cm")] }]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
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
