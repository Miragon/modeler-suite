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
  class TabInputCustom {
    constructor(
      readonly uri: Uri,
      readonly viewType: string,
    ) {}
  }
  interface Tab {
    readonly input: unknown;
    readonly group: TabGroup;
  }
  interface TabGroup {
    readonly viewColumn: number;
    readonly tabs: Tab[];
    activeTab: Tab | undefined;
  }
  /** One entry per group, in view column order; the walkthrough's input is none of the API's. */
  type TabLayout = ReadonlyArray<{
    inputs: readonly unknown[];
    activeTab?: number;
    active?: boolean;
  }>;
  const tabState = { groups: [] as TabGroup[], active: 0 };
  function layOutTabs(layout: TabLayout): void {
    tabState.groups = layout.map((entry, index) => {
      const group: TabGroup = { viewColumn: index + 1, tabs: [], activeTab: undefined };
      group.tabs.push(...entry.inputs.map((input) => ({ input, group })));
      group.activeTab = entry.activeTab === undefined ? undefined : group.tabs[entry.activeTab];
      return group;
    });
    tabState.active = Math.max(
      0,
      layout.findIndex((entry) => entry.active === true),
    );
  }
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const executed: unknown[][] = [];
  const informationMessages: string[] = [];
  const vscodeStub = {
    Uri,
    TabInputCustom,
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
      tabGroups: {
        get all(): readonly TabGroup[] {
          return tabState.groups;
        },
        get activeTabGroup(): TabGroup {
          return tabState.groups[tabState.active]!;
        },
      },
      showInformationMessage(message: string): Promise<undefined> {
        informationMessages.push(message);
        return Promise.resolve(undefined);
      },
    },
  };
  return {
    Uri,
    TabInputCustom,
    vscodeStub,
    run: (id: string, ...args: unknown[]): unknown => commands.get(id)?.(...args),
    executed,
    informationMessages,
    layOutTabs,
    reset(): void {
      layOutTabs([{ inputs: [] }]);
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
  DIAGRAM_VIEW_TYPE,
  NO_DIAGRAM_MESSAGE,
  OPEN_SOURCE_COMMAND,
  PNG_VIEW_TYPE,
  WEBVIEW_COMMANDS,
  registerSideBySideCommands,
  registerWebviewCommands,
} = await import("./commands.js");
const { DiagramPanels } = await import("./diagramPanels.js");

interface FakePanel {
  posted: unknown[];
  /** Every `reveal(viewColumn, preserveFocus)` call. */
  revealed: unknown[][];
  setActive(active: boolean): void;
  close(): void;
}

/** The commands as `activate` registers them, over one `DiagramPanels` both editors report to. */
function registerCommands(): {
  open(path: string, options?: { text?: boolean; active?: boolean }): FakePanel;
} {
  const panels = new DiagramPanels(host.Uri.file("/extension") as unknown as vscode.Uri);
  registerWebviewCommands((name) => panels.runCommand(name));
  registerSideBySideCommands(() => panels.revealTextDiagram());
  return {
    open(path, { text = true, active = true } = {}) {
      const viewStateListeners = new Set<() => void>();
      const disposeListeners = new Set<() => void>();
      const posted: unknown[] = [];
      const revealed: unknown[][] = [];
      const panel = {
        active,
        reveal(viewColumn?: unknown, preserveFocus?: unknown) {
          revealed.push([viewColumn, preserveFocus]);
        },
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
        revealed,
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

  it("opens the diagram that took the focus when it opened, not an earlier one", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    const b = diagrams.open("/b.tt");
    a.setActive(false);
    b.setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/b.tt"), "default", -2]]);
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

describe("Open Source to the Side beside the diagram", () => {
  it("shows the text diagram focused last and focuses it, so its group is the one the source opens beside", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    a.setActive(false);
    const png = diagrams.open("/b.tt.png", { text: false });
    png.setActive(false);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([[undefined, false]]);
    expect(png.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
  });

  it("leaves a focused diagram where it is", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");

    await host.run(OPEN_SOURCE_COMMAND);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", host.Uri.file("/a.tt"), "default", -2]]);
  });

  it("opens the resource of an editor title button without showing another diagram", async () => {
    const diagrams = registerCommands();
    const a = diagrams.open("/a.tt");
    a.setActive(false);
    const uri = host.Uri.file("/b.tt");

    await host.run(OPEN_SOURCE_COMMAND, uri);

    expect(a.revealed).toEqual([]);
    expect(openedBeside()).toEqual([["vscode.openWith", uri, "default", -2]]);
  });
});

describe("Open Source to the Side after a reload", () => {
  const walkthrough = undefined;
  const textTab = (path: string) => new host.TabInputCustom(host.Uri.file(path), DIAGRAM_VIEW_TYPE);
  const pngTab = (path: string) => new host.TabInputCustom(host.Uri.file(path), PNG_VIEW_TYPE);

  it("shows a diagram tab VS Code restored but has not resolved, then opens its source beside it", async () => {
    registerCommands();
    host.layOutTabs([{ inputs: [walkthrough, textTab("/a.tt")], activeTab: 0 }]);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", host.Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", host.Uri.file("/a.tt"), "default", -2],
    ]);
    expect(host.informationMessages).toEqual([]);
  });

  it("prefers a tab of the active group, then the tab a group shows, then any other", async () => {
    registerCommands();
    host.layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.tt")], activeTab: 0 },
      { inputs: [walkthrough, textTab("/beside-walkthrough.tt")], activeTab: 0, active: true },
    ]);
    await host.run(OPEN_SOURCE_COMMAND);
    host.layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [textTab("/shown.tt")], activeTab: 0 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await host.run(OPEN_SOURCE_COMMAND);
    host.layOutTabs([
      { inputs: [textTab("/hidden.tt"), walkthrough], activeTab: 1 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside().filter(([, , viewType]) => viewType === DIAGRAM_VIEW_TYPE)).toEqual([
      ["vscode.openWith", host.Uri.file("/beside-walkthrough.tt"), DIAGRAM_VIEW_TYPE, 3],
      ["vscode.openWith", host.Uri.file("/shown.tt"), DIAGRAM_VIEW_TYPE, 2],
      ["vscode.openWith", host.Uri.file("/hidden.tt"), DIAGRAM_VIEW_TYPE, 1],
    ]);
  });

  it("passes over a PNG diagram tab, which has no source", async () => {
    registerCommands();
    host.layOutTabs([{ inputs: [walkthrough, pngTab("/b.tt.png"), textTab("/a.tt")] }]);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", host.Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", host.Uri.file("/a.tt"), "default", -2],
    ]);
  });

  it("looks for a restored tab when only PNG diagrams were focused", async () => {
    const diagrams = registerCommands();
    diagrams.open("/b.tt.png", { text: false }).setActive(false);
    host.layOutTabs([{ inputs: [walkthrough, textTab("/a.tt")] }]);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      ["vscode.openWith", host.Uri.file("/a.tt"), DIAGRAM_VIEW_TYPE, 1],
      ["vscode.openWith", host.Uri.file("/a.tt"), "default", -2],
    ]);
  });

  it("opens no source for a focused PNG diagram, even with a text diagram tab restored", async () => {
    const diagrams = registerCommands();
    diagrams.open("/b.tt.png", { text: false });
    host.layOutTabs([{ inputs: [textTab("/a.tt")] }]);

    await host.run(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
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
