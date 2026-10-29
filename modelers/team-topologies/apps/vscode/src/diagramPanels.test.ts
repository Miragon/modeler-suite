// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { StubWebviewPanel } from "@miragon/modeler-shell/testing/vscode-stub";
import {
  TabInputCustom,
  Uri,
  layOutTabs,
  openTextDocument,
  resetVsCodeHost,
  runCommand,
  vscodeHost,
} from "./vscodeHost.test-support.js";

vi.mock("vscode", async () => (await import("./vscodeHost.test-support.js")).vscodeModule);

const {
  NO_DIAGRAM_MESSAGE,
  OPEN_SOURCE_COMMAND,
  PNG_VIEW_TYPE,
  WEBVIEW_COMMANDS,
  registerSideBySideCommands,
  registerWebviewCommands,
} = await import("./commands.js");
const { registerDiagramEditor } = await import("./diagramEditor.js");
const { DIAGRAM_VIEW_TYPE } = await import("./diagramEditorOptions.js");
const { DiagramPanels } = await import("./diagramPanels.js");
const { EXAMPLE_MAP } = await import("./examples.js");

/**
 * The commands as `activate` registers them: the text diagrams on the shell's document plumbing,
 * the PNG diagrams through `DiagramPanels.show`, as the PNG editor's provider calls it.
 */
function registerCommands(): {
  open(path: string, options?: { active?: boolean }): Promise<StubWebviewPanel>;
} {
  const host = vscodeHost();
  const extensionUri = host.extensionUri as unknown as vscode.Uri;
  const problems = { set: () => undefined, delete: () => undefined };
  const textDiagrams = registerDiagramEditor(
    { extensionUri },
    problems as unknown as vscode.DiagnosticCollection,
  );
  const panels = new DiagramPanels(extensionUri, textDiagrams);
  host.vscode.window.registerCustomEditorProvider(PNG_VIEW_TYPE, {
    resolveCustomTextEditor: (_document, panel) =>
      panels.show(panel as unknown as vscode.WebviewPanel),
  });
  registerWebviewCommands((name) => panels.runCommand(name));
  registerSideBySideCommands(() => panels.revealTextDiagram());
  return {
    open: (path, { active = true } = {}) =>
      host.openCustomEditor(
        path.endsWith(".png") ? PNG_VIEW_TYPE : DIAGRAM_VIEW_TYPE,
        openTextDocument(path, EXAMPLE_MAP),
        { active },
      ),
  };
}

function openedBeside(): unknown[][] {
  return vscodeHost()
    .executedCommands.filter(({ command }) => command === "vscode.openWith")
    .map(({ command, args }) => [command, ...args]);
}

function informationMessages(): string[] {
  return vscodeHost()
    .notifications.filter(({ severity }) => severity === "info")
    .map(({ message }) => message);
}

function commandsPosted(panel: StubWebviewPanel): unknown[] {
  return panel.posted.filter((message) => (message as { type?: unknown }).type === "command");
}

const SHOWN_AND_FOCUSED = { viewColumn: undefined, preserveFocus: false };

beforeEach(() => resetVsCodeHost());

describe("Open Source to the Side without a resource", () => {
  it("opens the diagram focused last once a walkthrough link has taken the focus", async () => {
    const diagrams = registerCommands();
    (await diagrams.open("/a.tt")).setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
    expect(informationMessages()).toEqual([]);
  });

  it("follows the order the diagrams were focused in", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    a.setActive(false);
    (await diagrams.open("/b.tt")).setActive(false);
    a.setActive(true);
    a.setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
  });

  it("opens the diagram that took the focus when it opened, not an earlier one", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    const b = await diagrams.open("/b.tt");
    a.setActive(false);
    b.setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/b.tt"), "default", -2]]);
  });

  it("puts a diagram opened in the background behind the ones focused before", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    await diagrams.open("/b.tt", { active: false });
    a.setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
  });

  it("passes over a PNG diagram focused later, which has no source", async () => {
    const diagrams = registerCommands();
    (await diagrams.open("/a.tt")).setActive(false);
    (await diagrams.open("/b.tt.png")).setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
  });

  it("opens no source for a focused PNG diagram", async () => {
    const diagrams = registerCommands();
    (await diagrams.open("/a.tt")).setActive(false);
    await diagrams.open("/b.tt.png");

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });

  it("forgets a closed diagram and asks for one once none is open", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    a.setActive(false);
    (await diagrams.open("/b.tt")).dispose();

    await runCommand(OPEN_SOURCE_COMMAND);
    a.dispose();
    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
    expect(informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});

describe("Open Source to the Side beside the diagram", () => {
  it("shows the text diagram focused last and focuses it, so its group is the one the source opens beside", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    a.setActive(false);
    const png = await diagrams.open("/b.tt.png");
    png.setActive(false);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([SHOWN_AND_FOCUSED]);
    expect(png.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
  });

  it("leaves a focused diagram where it is", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", Uri.file("/a.tt"), "default", -2]]);
  });

  it("opens the resource of an editor title button without showing another diagram", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    a.setActive(false);
    const uri = Uri.file("/b.tt");

    await runCommand(OPEN_SOURCE_COMMAND, uri);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", uri, "default", -2]]);
  });
});

describe("Open Source to the Side after a reload", () => {
  const walkthrough = undefined;
  const textTab = (path: string) => new TabInputCustom(Uri.file(path), DIAGRAM_VIEW_TYPE);
  const pngTab = (path: string) => new TabInputCustom(Uri.file(path), PNG_VIEW_TYPE);

  it("shows a diagram tab VS Code restored but has not resolved, then opens its source beside it", async () => {
    registerCommands();
    layOutTabs([{ inputs: [walkthrough, textTab("/a.tt")], activeTab: 0 }]);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.tt"), "default", -2],
    ]);
    expect(informationMessages()).toEqual([]);
  });

  it("prefers a tab of the active group, then the tab a group shows, then any other", async () => {
    registerCommands();
    layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.tt")], activeTab: 0 },
      { inputs: [walkthrough, textTab("/beside-walkthrough.tt")], activeTab: 0, active: true },
    ]);
    await runCommand(OPEN_SOURCE_COMMAND);
    layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.tt")], activeTab: 0 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await runCommand(OPEN_SOURCE_COMMAND);
    layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside().filter(([, , viewType]) => viewType === DIAGRAM_VIEW_TYPE)).toEqual([
      ["vscode.openWith", Uri.file("/beside-walkthrough.tt"), DIAGRAM_VIEW_TYPE, 3],
      ["vscode.openWith", Uri.file("/shown.tt"), DIAGRAM_VIEW_TYPE, 2],
      ["vscode.openWith", Uri.file("/hidden.tt"), DIAGRAM_VIEW_TYPE, 1],
    ]);
  });

  it("passes over a PNG diagram tab, which has no source", async () => {
    registerCommands();
    layOutTabs([{ inputs: [walkthrough, pngTab("/b.tt.png"), textTab("/a.tt")] }]);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.tt"), "default", -2],
    ]);
  });

  it("looks for a restored tab when only PNG diagrams were focused", async () => {
    const diagrams = registerCommands();
    (await diagrams.open("/b.tt.png")).setActive(false);
    layOutTabs([{ inputs: [walkthrough, textTab("/a.tt")] }]);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", Uri.file("/a.tt"), "default", -2],
    ]);
  });

  it("opens no source for a focused PNG diagram, even with a text diagram tab restored", async () => {
    const diagrams = registerCommands();
    await diagrams.open("/b.tt.png");
    layOutTabs([{ inputs: [textTab("/a.tt")] }]);

    await runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});

describe("fit and export from the Command Palette", () => {
  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "posts %s to the focused PNG diagram",
    async (name, id) => {
      const diagrams = registerCommands();
      const png = await diagrams.open("/a.tt.png");

      runCommand(id);

      expect(commandsPosted(png)).toEqual([{ type: "command", name }]);
    },
  );

  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "posts %s to the focused text diagram, not to a PNG diagram focused before",
    async (name, id) => {
      const diagrams = registerCommands();
      const png = await diagrams.open("/a.tt.png");
      png.setActive(false);
      const text = await diagrams.open("/b.tt");

      runCommand(id);

      expect(commandsPosted(text)).toEqual([{ type: "command", name }]);
      expect(commandsPosted(png)).toEqual([]);
    },
  );

  it("needs the focused diagram, not the one focused last", async () => {
    const diagrams = registerCommands();
    const a = await diagrams.open("/a.tt");
    a.setActive(false);
    const png = await diagrams.open("/b.tt.png");
    png.setActive(false);

    runCommand(WEBVIEW_COMMANDS.fitView);

    expect(commandsPosted(a)).toEqual([]);
    expect(commandsPosted(png)).toEqual([]);
    expect(informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});

describe("the webview of both editors", () => {
  it("is the document the shell's plumbing writes for a text diagram, also for a PNG diagram", async () => {
    const diagrams = registerCommands();
    const text = await diagrams.open("/a.tt");
    const png = await diagrams.open("/b.tt.png");
    const withoutNonce = (html: string): string =>
      html.replace(/'nonce-[^']*'/g, "'nonce-…'").replace(/nonce="[^"]*"/g, 'nonce="…"');

    expect(png.webview.options).toEqual(text.webview.options);
    expect(withoutNonce(png.webview.html)).toBe(withoutNonce(text.webview.html));
    expect(text.webview.html).toContain("<title>Team Topologies Diagram</title>");
  });
});
