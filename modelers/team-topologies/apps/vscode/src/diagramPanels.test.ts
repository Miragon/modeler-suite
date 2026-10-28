// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

// `vscode` exists only inside the editor: a stand-in with the surface the commands and the panels
// use, and the shell's webview helpers, which need the real `vscode`, reduced to no-ops.
const host = vi.hoisted(() => {
  class Uri {
    constructor(readonly path: string) {}
    static file(path: string): Uri {
      return new Uri(path);
    }
    static joinPath(base: Uri, ...segments: string[]): Uri {
      return new Uri([base.path, ...segments].join("/"));
    }
  }
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const executed: unknown[][] = [];
  const informationMessages: string[] = [];
  const vscodeStub = {
    Uri,
    ViewColumn: { Beside: -2 },
    commands: {
      registerCommand(id: string, callback: (...args: unknown[]) => unknown) {
        commands.set(id, callback);
        return { dispose: () => commands.delete(id) };
      },
      executeCommand(...args: unknown[]): Promise<unknown> {
        executed.push(args);
        return Promise.resolve(undefined);
      },
    },
    window: {
      activeTextEditor: undefined,
      showInformationMessage(message: string): Promise<undefined> {
        informationMessages.push(message);
        return Promise.resolve(undefined);
      },
    },
  };
  return {
    Uri,
    vscodeStub,
    run: (id: string): unknown => commands.get(id)?.(),
    executed,
    informationMessages,
    reset(): void {
      commands.clear();
      executed.length = 0;
      informationMessages.length = 0;
    },
  };
});

vi.mock("vscode", () => host.vscodeStub);
vi.mock("@miragon/modeler-shell/vscode/extension", () => ({
  connectThemeBridge: () => ({ dispose: () => undefined }),
  currentAppearance: () => "light",
  renderWebviewHtml: () => "",
}));

const {
  NO_DIAGRAM_MESSAGE,
  OPEN_SOURCE_COMMAND,
  WEBVIEW_COMMANDS,
  registerSideBySideCommands,
  registerWebviewCommands,
} = await import("./commands.js");
const { DiagramPanels } = await import("./diagramPanels.js");

interface FakePanel {
  posted: unknown[];
  setActive(active: boolean): void;
  close(): void;
}

/** The commands as `activate` registers them, over one `DiagramPanels` both editors report to. */
function registerCommands(): {
  open(path: string, options?: { text?: boolean; active?: boolean }): FakePanel;
} {
  const panels = new DiagramPanels(host.Uri.file("/extension") as unknown as vscode.Uri);
  registerWebviewCommands((name) => panels.runCommand(name));
  registerSideBySideCommands(() => panels.activeTextDocumentUri());
  return {
    open(path, { text = true, active = true } = {}) {
      const viewStateListeners = new Set<() => void>();
      const disposeListeners = new Set<() => void>();
      const posted: unknown[] = [];
      const panel = {
        active,
        webview: {
          options: {},
          html: "",
          cspSource: "vscode-webview://unit",
          asWebviewUri: (uri: unknown) => uri,
          postMessage(message: unknown): Promise<boolean> {
            posted.push(message);
            return Promise.resolve(true);
          },
        },
        onDidChangeViewState(listener: () => void) {
          viewStateListeners.add(listener);
          return { dispose: () => viewStateListeners.delete(listener) };
        },
        onDidDispose(listener: () => void) {
          disposeListeners.add(listener);
          return { dispose: () => disposeListeners.delete(listener) };
        },
      };
      panels.show(
        panel as unknown as vscode.WebviewPanel,
        host.Uri.file(path) as unknown as vscode.Uri,
        { text },
      );
      return {
        posted,
        setActive(next) {
          panel.active = next;
          for (const listener of [...viewStateListeners]) listener();
        },
        close() {
          for (const listener of [...disposeListeners]) listener();
        },
      };
    },
  };
}

function openedBeside(): unknown[][] {
  return host.executed.filter(([command]) => command === "vscode.openWith");
}

beforeEach(() => host.reset());

describe("Open Source to the Side without a resource", () => {
  it("opens the diagram focused last once a walkthrough link has taken the focus", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.tt").setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
    expect(host.informationMessages).toEqual([]);
  });

  it("follows the order the diagrams were focused in", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    a.setActive(false);
    diagrams.open("/b.tt").setActive(false);
    a.setActive(true);
    a.setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
  });

  it("puts a diagram opened in the background behind the ones focused before", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    diagrams.open("/b.tt", { active: false });
    a.setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
  });

  it("passes over a PNG diagram focused later, which has no source", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.tt").setActive(false);
    diagrams.open("/b.tt.png", { text: false }).setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
  });

  it("opens no source for a focused PNG diagram", async () => {
    const diagrams = registerCommands();
    diagrams.open("/a.tt").setActive(false);
    diagrams.open("/b.tt.png", { text: false });

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(host.informationMessages).toEqual([NO_DIAGRAM_MESSAGE]);
  });

  it("forgets a closed diagram and asks for one once none is open", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    a.setActive(false);
    diagrams.open("/b.tt").close();

    await host.run(OPEN_SOURCE_COMMAND);
    a.close();
    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
    expect(host.informationMessages).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});

describe("fit and export from the Command Palette", () => {
  it.each(Object.entries(WEBVIEW_COMMANDS))("posts %s to the focused diagram", (name, id) => {
    const diagrams = registerCommands();
    const png = diagrams.open("/a.tt.png", { text: false });

    host.run(id);

    expect(png.posted).toEqual([{ type: "command", name }]);
  });

  it("needs the focused diagram, not the one focused last", () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    a.setActive(false);

    host.run(WEBVIEW_COMMANDS.fitView);

    expect(a.posted).toEqual([]);
    expect(host.informationMessages).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});
