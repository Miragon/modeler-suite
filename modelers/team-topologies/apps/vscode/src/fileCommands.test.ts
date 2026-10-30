// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";

/**
 * The parts of `vscode` the extension's activation and the shell's file commands use: the save
 * dialog answers `saveTarget`, a notification `answer`, and the files at `existing` paths are there
 * before a command runs.
 */
const host = vi.hoisted(() => {
  class Uri {
    constructor(
      readonly scheme: string,
      readonly path: string,
    ) {}
    static file(path: string): Uri {
      return new Uri("file", path);
    }
    static joinPath(base: Uri, ...segments: string[]): Uri {
      return new Uri(base.scheme, [base.path.replace(/\/$/, ""), ...segments].join("/"));
    }
    with(change: { path: string }): Uri {
      return new Uri(this.scheme, change.path);
    }
    toString(): string {
      return `${this.scheme}://${this.path}`;
    }
  }
  const disposable = { dispose: () => undefined };
  const state = {
    saveTarget: undefined as Uri | undefined,
    answer: undefined as string | undefined,
    existing: new Set<string>(),
    folders: undefined as { uri: Uri }[] | undefined,
  };
  const dialogs: unknown[] = [];
  const written: Array<{ path: string; bytes: Uint8Array }> = [];
  const notices: Array<{ level: string; text: string; modal?: boolean; actions: string[] }> = [];
  const executed: unknown[][] = [];
  const commands = new Map<string, () => unknown>();
  const notice =
    (level: string) =>
    (text: string, ...rest: Array<string | { modal?: boolean }>): Promise<string | undefined> => {
      const options = rest.find((item) => typeof item !== "string");
      notices.push({
        level,
        text,
        ...(options?.modal === undefined ? {} : { modal: options.modal }),
        actions: rest.filter((item): item is string => typeof item === "string"),
      });
      return Promise.resolve(level === "error" ? undefined : state.answer);
    };
  const vscodeStub = {
    Uri,
    EventEmitter: class {
      readonly event = () => disposable;
      fire(): void {}
      dispose(): void {}
    },
    languages: { createDiagnosticCollection: () => disposable },
    window: {
      registerCustomEditorProvider: () => disposable,
      showSaveDialog(options: unknown): Promise<Uri | undefined> {
        dialogs.push(options);
        return Promise.resolve(state.saveTarget);
      },
      showInformationMessage: notice("information"),
      showWarningMessage: notice("warning"),
      showErrorMessage: notice("error"),
    },
    workspace: {
      get workspaceFolders() {
        return state.folders;
      },
      fs: {
        writeFile(target: Uri, bytes: Uint8Array): Promise<void> {
          written.push({ path: target.path, bytes });
          state.existing.add(target.path);
          return Promise.resolve();
        },
        stat(target: Uri): Promise<unknown> {
          return state.existing.has(target.path)
            ? Promise.resolve({ type: 1 })
            : Promise.reject(new Error(`FileNotFound: ${target.path}`));
        },
      },
    },
    commands: {
      registerCommand(id: string, callback: () => unknown) {
        commands.set(id, callback);
        return disposable;
      },
      executeCommand(...args: unknown[]): Promise<undefined> {
        executed.push(args);
        return Promise.resolve(undefined);
      },
    },
  };
  return {
    Uri,
    vscodeStub,
    state,
    dialogs,
    written,
    notices,
    executed,
    run: (id: string) => commands.get(id)?.(),
    reset(): void {
      state.saveTarget = undefined;
      state.answer = undefined;
      state.existing.clear();
      state.folders = undefined;
      for (const list of [dialogs, written, notices, executed]) list.length = 0;
      commands.clear();
    },
  };
});

vi.mock("vscode", () => host.vscodeStub);

const { activate } = await import("./extension.js");
const { exportImage } = await import("./exportImage.js");
const { PNG_VIEW_TYPE } = await import("./commands.js");
const { DIAGRAM_VIEW_TYPE } = await import("./diagramEditorOptions.js");
const { EMPTY_MAP, EXAMPLE_MAP } = await import("./examples.js");

const PNG_BASE64 = Buffer.from("png bytes").toString("base64");

function uri(path: string, scheme = "file"): vscode.Uri {
  return new host.Uri(scheme, path) as unknown as vscode.Uri;
}

function writtenText(): Array<[path: string, text: string]> {
  return host.written.map(({ path, bytes }) => [path, new TextDecoder().decode(bytes)]);
}

function opened(): unknown[][] {
  return host.executed.filter(([command]) => command === "vscode.openWith");
}

beforeEach(() => {
  host.reset();
});

describe("an export of either editor, through the shell's save dialog", () => {
  it.each([
    ["png", "/work/shop.tt", "Export as PNG", { "PNG image": ["png"] }, "/work/shop.png"],
    ["svg", "/work/shop.ttm.json", "Export as SVG", { "SVG image": ["svg"] }, "/work/shop.svg"],
    ["svg", "/work/shop.tt.png", "Export as SVG", { "SVG image": ["svg"] }, "/work/shop.svg"],
    ["png", "/work/shop.ttm.png", "Export as PNG", { "PNG image": ["png"] }, "/work/shop.png"],
  ] as const)(
    "suggests the %s of %s beside it, without the double extension",
    async (format, source, title, filters, suggested) => {
      await exportImage(uri(source), { type: "export", format, data: PNG_BASE64 });

      expect(host.dialogs).toEqual([
        {
          title,
          saveLabel: "Export",
          filters,
          defaultUri: expect.objectContaining({ path: suggested }) as unknown,
        },
      ]);
    },
  );

  it("suggests team-topology in the first workspace folder for a diagram that is no file", async () => {
    host.state.folders = [{ uri: new host.Uri("file", "/workspace") }];

    await exportImage(uri("Untitled-1", "untitled"), {
      type: "export",
      format: "png",
      data: PNG_BASE64,
    });

    expect(host.dialogs[0]).toMatchObject({ defaultUri: { path: "/workspace/team-topology.png" } });
  });

  it("writes the PNG's bytes and names the file with the action that reveals it", async () => {
    host.state.saveTarget = new host.Uri("file", "/out/shop.png");
    const reveal = revealFileLabel(process.platform);
    host.state.answer = reveal;

    await exportImage(uri("/work/shop.tt"), { type: "export", format: "png", data: PNG_BASE64 });

    expect(writtenText()).toEqual([["/out/shop.png", "png bytes"]]);
    expect(host.notices).toEqual([
      { level: "information", text: "Exported shop.png.", actions: [reveal] },
    ]);
    expect(host.executed).toEqual([["revealFileInOS", host.state.saveTarget]]);
  });

  it("warns once the PNG is saved when its labels came out in the system font", async () => {
    host.state.saveTarget = new host.Uri("file", "/out/shop.png");

    await exportImage(uri("/work/shop.tt"), {
      type: "export",
      format: "png",
      data: PNG_BASE64,
      fontFallback: true,
    });

    expect(host.written).toHaveLength(1);
    expect(host.notices).toEqual([
      {
        level: "warning",
        text: "Exported shop.png in a system font. Geist couldn't be embedded.",
        actions: [revealFileLabel(process.platform)],
      },
    ]);
  });
});

describe("the New commands", () => {
  beforeEach(() => {
    activate({ extensionUri: uri("/extension"), subscriptions: [] } as never);
    host.state.folders = [{ uri: new host.Uri("file", "/workspace") }];
  });

  it.each([
    ["teamTopologies.newDiagram", EMPTY_MAP],
    ["teamTopologies.newFromExample", EXAMPLE_MAP],
  ])(
    "%s saves a new diagram in the workspace folder and opens it in the diagram editor",
    async (command, text) => {
      host.state.saveTarget = new host.Uri("file", "/workspace/shop.tt");

      await host.run(command);

      expect(host.dialogs).toEqual([
        {
          title: "New Team Topologies Diagram",
          saveLabel: "Create diagram",
          filters: { "Team Topologies": ["tt", "ttm.json"] },
          defaultUri: expect.objectContaining({ path: "/workspace/team-topology.tt" }) as unknown,
        },
      ]);
      expect(writtenText()).toEqual([["/workspace/shop.tt", text]]);
      expect(opened()).toEqual([["vscode.openWith", host.state.saveTarget, DIAGRAM_VIEW_TYPE]]);
    },
  );

  it("writes and opens nothing when the save dialog is dismissed", async () => {
    await host.run("teamTopologies.newFromExample");

    expect(host.written).toEqual([]);
    expect(opened()).toEqual([]);
  });

  it("saves an empty embedded PNG under a name the PNG editor claims and opens it there", async () => {
    host.state.saveTarget = new host.Uri("file", "/workspace/shop.png");

    await host.run("teamTopologies.newPngDiagram");

    expect(host.dialogs).toEqual([
      {
        title: "New Team Topologies Diagram (embedded PNG)",
        saveLabel: "Create diagram",
        filters: { "Team Topologies (PNG)": ["png"] },
        defaultUri: expect.objectContaining({ path: "/workspace/team-topology.tt.png" }) as unknown,
      },
    ]);
    expect(writtenText()).toEqual([["/workspace/shop.tt.png", ""]]);
    expect(opened()).toEqual([
      [
        "vscode.openWith",
        expect.objectContaining({ path: "/workspace/shop.tt.png" }),
        PNG_VIEW_TYPE,
      ],
    ]);
  });

  it("keeps a name the PNG editor already claims, without asking", async () => {
    host.state.saveTarget = new host.Uri("file", "/workspace/shop.ttm.png");
    host.state.existing.add("/workspace/shop.ttm.png");

    await host.run("teamTopologies.newPngDiagram");

    expect(host.notices).toEqual([]);
    expect(writtenText()).toEqual([["/workspace/shop.ttm.png", ""]]);
  });

  it("asks before it replaces a diagram already at the corrected name, and keeps it unless told", async () => {
    host.state.saveTarget = new host.Uri("file", "/workspace/shop.png");
    host.state.existing.add("/workspace/shop.tt.png");

    await host.run("teamTopologies.newPngDiagram");

    expect(host.notices).toEqual([
      {
        level: "warning",
        text: "shop.tt.png already exists. Do you want to replace it?",
        modal: true,
        actions: ["Replace"],
      },
    ]);
    expect(host.written).toEqual([]);
    expect(opened()).toEqual([]);
  });

  it("replaces the diagram at the corrected name once the question is answered with Replace", async () => {
    host.state.saveTarget = new host.Uri("file", "/workspace/shop.png");
    host.state.existing.add("/workspace/shop.tt.png");
    host.state.answer = "Replace";

    await host.run("teamTopologies.newPngDiagram");

    expect(writtenText()).toEqual([["/workspace/shop.tt.png", ""]]);
    expect(opened()).toHaveLength(1);
  });
});
