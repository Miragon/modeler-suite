import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type * as ShellVsCode from "@miragon/modeler-shell/vscode/extension";
import type { CmPngEditorProvider } from "../src/CmPngEditorProvider.js";
import {
  NO_MAP_MESSAGE,
  OPEN_SOURCE_COMMAND,
  PNG_VIEW_TYPE,
  WEBVIEW_COMMANDS,
} from "../src/commands.js";
import { EMPTY_MAP } from "../src/examples.js";
import { activate } from "../src/extension.js";
import { MAP_VIEW_TYPE } from "../src/mapEditorOptions.js";
import { Disposable, EventEmitter, Uri, ViewColumn, vscodeMock } from "./__mocks__/vscode.js";

vi.mock("@miragon/modeler-shell/vscode/extension", async (importOriginal) => ({
  ...(await importOriginal<typeof ShellVsCode>()),
  connectThemeBridge: () => ({ dispose: () => undefined }),
}));

const NOT_CANCELLED = {
  isCancellationRequested: false,
  onCancellationRequested: () => new Disposable(() => undefined),
};

beforeEach(() => vscodeMock.reset());

interface FakePanel {
  panel: { webview: { options: unknown; html: string } };
  posted: unknown[];
  /** Every `reveal(viewColumn, preserveFocus)` call. */
  revealed: unknown[][];
  setActive(active: boolean): void;
  /** VS Code closes the editor. */
  close(): void;
}

function fakePanel(): FakePanel {
  const viewState = new EventEmitter<unknown>();
  const disposed = new EventEmitter<void>();
  const posted: unknown[] = [];
  const revealed: unknown[][] = [];
  const panel = {
    active: true,
    visible: true,
    webview: {
      options: {},
      html: "",
      cspSource: "vscode-webview://unit",
      asWebviewUri: (uri: Uri) => uri,
      onDidReceiveMessage: new EventEmitter<unknown>().event,
      postMessage(message: unknown): Promise<boolean> {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
    onDidChangeViewState: viewState.event,
    onDidDispose: disposed.event,
    reveal(viewColumn?: unknown, preserveFocus?: unknown) {
      revealed.push([viewColumn, preserveFocus]);
    },
  };
  return {
    panel,
    posted,
    revealed,
    setActive(next) {
      panel.active = next;
      viewState.fire({ webviewPanel: panel });
    },
    close: () => disposed.fire(),
  };
}

/** The extension as VS Code activates it: both editors report to the panels its commands read. */
function activateExtension(): {
  openText(path: string): Promise<FakePanel>;
  openPng(path: string): Promise<FakePanel>;
} {
  activate({ extensionUri: Uri.file("/extension"), subscriptions: [] } as never);
  const textEditor = vscodeMock.customEditorProvider(
    MAP_VIEW_TYPE,
  ) as vscode.CustomTextEditorProvider;
  const pngEditor = vscodeMock.customEditorProvider(PNG_VIEW_TYPE) as CmPngEditorProvider;
  return {
    async openText(path) {
      const h = fakePanel();
      await textEditor.resolveCustomTextEditor(
        vscodeMock.openDocument(path, EMPTY_MAP) as never,
        h.panel as never,
        NOT_CANCELLED as never,
      );
      return h;
    },
    async openPng(path) {
      const h = fakePanel();
      const document = await pngEditor.openCustomDocument(
        Uri.file(path) as never,
        { backupId: undefined, untitledDocumentData: undefined },
        NOT_CANCELLED as never,
      );
      await pngEditor.resolveCustomEditor(document, h.panel as never, NOT_CANCELLED as never);
      return h;
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

describe("the .cm and the .cm.png editor, as the extension registers them", () => {
  it("open the source of the .cm diagram focused last, passing over a .cm.png focused later", async () => {
    const extension = activateExtension();
    const text = await extension.openText("/a.cm");
    text.setActive(false);
    const png = await extension.openPng("/b.cm.png");
    png.setActive(false);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(text.revealed).toEqual([[undefined, false]]);
    expect(png.revealed).toEqual([]);
    expect(openedBeside()).toEqual([
      ["vscode.openWith", Uri.file("/a.cm"), "default", ViewColumn.Beside],
    ]);
    expect(infoMessages()).toEqual([]);
  });

  it("open no source for a focused .cm.png", async () => {
    const extension = activateExtension();
    (await extension.openText("/a.cm")).setActive(false);
    await extension.openPng("/b.cm.png");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(infoMessages()).toEqual([NO_MAP_MESSAGE]);
  });

  it("send fit to the focused .cm.png", async () => {
    const extension = activateExtension();
    const text = await extension.openText("/a.cm");
    text.setActive(false);
    const png = await extension.openPng("/b.cm.png");

    vscodeMock.runCommand(WEBVIEW_COMMANDS.fitView);

    expect(png.posted).toContainEqual({ type: "command", name: "fitView" });
    expect(text.posted).not.toContainEqual({ type: "command", name: "fitView" });
  });

  it("send fit to the focused .cm diagram, not to a .cm.png focused earlier", async () => {
    const extension = activateExtension();
    const png = await extension.openPng("/b.cm.png");
    png.setActive(false);
    const text = await extension.openText("/a.cm");

    vscodeMock.runCommand(WEBVIEW_COMMANDS.fitView);

    expect(text.posted).toContainEqual({ type: "command", name: "fitView" });
    expect(png.posted).not.toContainEqual({ type: "command", name: "fitView" });
  });

  it("forget a closed .cm diagram", async () => {
    const extension = activateExtension();
    const text = await extension.openText("/a.cm");
    text.setActive(false);
    text.close();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(text.revealed).toEqual([]);
    expect(openedBeside()).toEqual([]);
    expect(infoMessages()).toEqual([NO_MAP_MESSAGE]);
  });

  it("show the same webview document, the .cm editor's from the shell's plumbing", async () => {
    const extension = activateExtension();
    const text = await extension.openText("/a.cm");
    const png = await extension.openPng("/b.cm.png");
    const withoutNonce = (html: string) =>
      html.replace(/'nonce-[^']*'/g, "'nonce-…'").replace(/nonce="[^"]*"/g, 'nonce="…"');

    expect(png.panel.webview.options).toEqual(text.panel.webview.options);
    expect(withoutNonce(png.panel.webview.html)).toBe(withoutNonce(text.panel.webview.html));
    expect(text.panel.webview.html).toContain("<title>Context Maps Diagram</title>");
  });
});
