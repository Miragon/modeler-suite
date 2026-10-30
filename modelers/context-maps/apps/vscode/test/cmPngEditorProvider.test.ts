import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ShellVsCode from "@miragon/modeler-shell/vscode/extension";
import { CmPngEditorProvider } from "../src/CmPngEditorProvider.js";
import { PNG_VIEW_TYPE } from "../src/commands.js";
import type { HostToWebview, WebviewToHost } from "../src/protocol.js";
import {
  Disposable,
  EventEmitter,
  MockDiagnosticCollection,
  Uri,
  vscodeMock,
  window,
  workspace,
} from "./__mocks__/vscode.js";

vi.mock("@miragon/modeler-shell/vscode/extension", async (importOriginal) => ({
  ...(await importOriginal<typeof ShellVsCode>()),
  connectThemeBridge: () => ({ dispose: () => undefined }),
}));

const PNG_BASE64 = "iVBORw0KGgo=";
const NOT_CANCELLED = {
  isCancellationRequested: false,
  onCancellationRequested: () => new Disposable(() => undefined),
};

beforeEach(() => vscodeMock.reset());

async function openPngEditor(path: string) {
  const posted: HostToWebview[] = [];
  const received = new EventEmitter<WebviewToHost>();
  const panel = {
    webview: {
      options: {},
      html: "",
      cspSource: "vscode-webview://unit",
      asWebviewUri: (uri: Uri) => uri,
      onDidReceiveMessage: received.event,
      postMessage(message: HostToWebview): Promise<boolean> {
        posted.push(message);
        return Promise.resolve(true);
      },
    },
    onDidDispose: () => new Disposable(() => undefined),
  };
  CmPngEditorProvider.register(
    { extensionUri: Uri.file("/extension") } as never,
    { track: () => new Disposable(() => undefined) } as never,
    new MockDiagnosticCollection("context-maps") as never,
  );
  const provider = vscodeMock.customEditorProvider(PNG_VIEW_TYPE) as CmPngEditorProvider;
  const document = await provider.openCustomDocument(
    Uri.file(path) as never,
    { backupId: undefined, untitledDocumentData: undefined },
    NOT_CANCELLED as never,
  );
  await provider.resolveCustomEditor(document, panel as never, NOT_CANCELLED as never);

  async function answerPngRequest(fontFallback: boolean): Promise<void> {
    const request = await vi.waitFor(() => {
      const found = posted.find((message) => message.type === "requestPng");
      expect(found).toBeDefined();
      return found as Extract<HostToWebview, { type: "requestPng" }>;
    });
    received.fire({ type: "pngResponse", id: request.id, data: PNG_BASE64, fontFallback });
  }

  return {
    provider,
    document,
    answerPngRequest,
    receive: (message: WebviewToHost) => received.fire(message),
  };
}

describe("the .cm.png editor's save", () => {
  it("warns that the labels are in the system font after a save", async () => {
    const { provider, document, answerPngRequest } = await openPngEditor("/maps/shop.cm.png");

    const saving = provider.saveCustomDocument(document, NOT_CANCELLED as never);
    await answerPngRequest(true);
    await saving;

    expect(workspace.fs.written.map((file) => file.uri.path)).toEqual(["/maps/shop.cm.png"]);
    expect(vscodeMock.notifications()).toEqual([
      {
        level: "warning",
        message: "Saved shop.cm.png in a system font. Geist couldn't be embedded.",
        items: [],
      },
    ]);
  });

  it("names the destination of a Save As", async () => {
    const { provider, document, answerPngRequest } = await openPngEditor("/maps/shop.cm.png");
    const destination = Uri.file("/copies/copy.cm.png");

    const saving = provider.saveCustomDocumentAs(
      document,
      destination as never,
      NOT_CANCELLED as never,
    );
    await answerPngRequest(true);
    await saving;

    expect(workspace.fs.written.map((file) => file.uri)).toEqual([destination]);
    expect(vscodeMock.notifications()).toEqual([
      {
        level: "warning",
        message: "Saved copy.cm.png in a system font. Geist couldn't be embedded.",
        items: [],
      },
    ]);
  });

  it("saves without a notification when Geist was embedded", async () => {
    const { provider, document, answerPngRequest } = await openPngEditor("/maps/shop.cm.png");

    const saving = provider.saveCustomDocument(document, NOT_CANCELLED as never);
    await answerPngRequest(false);
    await saving;

    expect(workspace.fs.written).toHaveLength(1);
    expect(vscodeMock.notifications()).toEqual([]);
  });

  it("keeps the hot-exit backup silent, since the user did not save", async () => {
    const { provider, document, answerPngRequest } = await openPngEditor("/maps/shop.cm.png");
    const backup = Uri.file("/storage/backups/1");

    const backingUp = provider.backupCustomDocument(
      document,
      { destination: backup } as never,
      NOT_CANCELLED as never,
    );
    await answerPngRequest(true);
    await backingUp;

    expect(workspace.fs.written.map((file) => file.uri)).toEqual([backup]);
    expect(vscodeMock.notifications()).toEqual([]);
  });
});

describe("the .cm.png editor's export", () => {
  it("suggests the export beside the diagram, without its double extension", async () => {
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");
    const { receive } = await openPngEditor("/maps/shop.cm.png");

    receive({ type: "export", format: "svg", data: "<svg/>" });

    await vi.waitFor(() =>
      expect(showSaveDialog).toHaveBeenCalledWith({
        title: "Export as SVG",
        saveLabel: "Export",
        filters: { "SVG image": ["svg"] },
        defaultUri: expect.objectContaining({ path: "/maps/shop.svg" }),
      }),
    );
  });
});
