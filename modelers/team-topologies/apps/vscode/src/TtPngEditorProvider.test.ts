// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

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
  class EventEmitter {
    readonly event = (): { dispose(): void } => ({ dispose: () => undefined });
    fire(): void {}
    dispose(): void {}
  }
  class CancellationError extends Error {}
  const state = { writeError: undefined as Error | undefined, provider: undefined as unknown };
  const log: string[] = [];
  const vscodeStub = {
    Uri,
    EventEmitter,
    CancellationError,
    Position: class {},
    commands: { executeCommand: () => Promise.resolve(undefined) },
    window: {
      registerCustomEditorProvider(_viewType: string, provider: unknown): { dispose(): void } {
        state.provider = provider;
        return { dispose: () => undefined };
      },
      showWarningMessage(text: string): Promise<undefined> {
        log.push(`warning: ${text}`);
        return Promise.resolve(undefined);
      },
      showErrorMessage(text: string): Promise<undefined> {
        log.push(`error: ${text}`);
        return Promise.resolve(undefined);
      },
    },
    workspace: {
      fs: {
        readFile: () => Promise.resolve(new Uint8Array()),
        createDirectory: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        writeFile(target: Uri): Promise<void> {
          if (state.writeError) return Promise.reject(state.writeError);
          log.push(`written: ${target.path}`);
          return Promise.resolve();
        },
      },
    },
  };
  return {
    Uri,
    vscodeStub,
    state,
    log,
    reset(): void {
      state.writeError = undefined;
      log.length = 0;
    },
  };
});

vi.mock("vscode", () => host.vscodeStub);
vi.mock("@miragon/modeler-shell/vscode/extension", () => ({ revealFileLabel: () => "Reveal" }));
vi.mock("./diagnostics.js", () => ({
  documentDiagnostics: () => [],
  problemCounts: () => ({ count: 0, errors: 0 }),
}));

const { TtPngEditorProvider } = await import("./TtPngEditorProvider.js");

const PNG_BASE64 = Buffer.from("png bytes").toString("base64");
const WARNING = "warning: Saved the PNG in a system font. Geist couldn't be embedded.";

interface Provider {
  openCustomDocument(
    uri: vscode.Uri,
    context: { backupId: undefined },
    token: unknown,
  ): Promise<unknown>;
  resolveCustomEditor(document: unknown, panel: unknown, token: unknown): Promise<void>;
  saveCustomDocument(document: unknown, token: unknown): Promise<void>;
  saveCustomDocumentAs(document: unknown, destination: vscode.Uri, token: unknown): Promise<void>;
  backupCustomDocument(
    document: unknown,
    context: { destination: vscode.Uri },
    token: unknown,
  ): Promise<unknown>;
}

interface Token {
  isCancellationRequested: boolean;
  onCancellationRequested(): { dispose(): void };
}

function token(): Token {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  };
}

/** An editor whose webview answers each `requestPng` the way the real one does. */
async function openEditor(
  answer: (request: { includeDraft: boolean }, cancellation: Token) => Record<string, unknown>,
  cancellation: Token,
): Promise<{ provider: Provider; document: unknown }> {
  TtPngEditorProvider.register(
    { show: () => undefined } as never,
    {
      delete: () => undefined,
      set: () => undefined,
    } as never,
  );
  const provider = host.state.provider as Provider;
  const document = await provider.openCustomDocument(
    host.Uri.file("/work/shop.tt.png") as unknown as vscode.Uri,
    { backupId: undefined },
    token(),
  );
  let receive: (message: unknown) => unknown = () => undefined;
  const webview = {
    onDidReceiveMessage(listener: (message: unknown) => unknown) {
      receive = listener;
      return { dispose: () => undefined };
    },
    postMessage(message: { type: string; id?: number; includeDraft?: boolean }): Promise<boolean> {
      if (message.type === "requestPng") {
        const reply = answer({ includeDraft: message.includeDraft === true }, cancellation);
        queueMicrotask(() => void receive({ type: "pngResponse", id: message.id, ...reply }));
      }
      return Promise.resolve(true);
    },
  };
  await provider.resolveCustomEditor(
    document,
    { webview, onDidDispose: () => ({ dispose: () => undefined }) },
    token(),
  );
  return { provider, document };
}

const rendered =
  (extra: Record<string, unknown> = {}) =>
  () => ({ data: PNG_BASE64, ...extra });

beforeEach(() => host.reset());

describe("the .tt.png editor's save", () => {
  it("warns once the file is written when the labels fell back to the system sans", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor(rendered({ fontFallback: true }), cancellation);

    await provider.saveCustomDocument(document, cancellation);

    expect(host.log).toEqual(["written: /work/shop.tt.png", WARNING]);
  });

  it("warns for Save As too", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor(rendered({ fontFallback: true }), cancellation);

    await provider.saveCustomDocumentAs(
      document,
      host.Uri.file("/work/copy.tt.png") as unknown as vscode.Uri,
      cancellation,
    );

    expect(host.log).toEqual(["written: /work/copy.tt.png", WARNING]);
  });

  it("says nothing about the font when Geist was embedded", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor(rendered(), cancellation);

    await provider.saveCustomDocument(document, cancellation);

    expect(host.log).toEqual(["written: /work/shop.tt.png"]);
  });

  it("does not claim a save that failed to write", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor(rendered({ fontFallback: true }), cancellation);
    host.state.writeError = new Error("disk full");

    await expect(provider.saveCustomDocument(document, cancellation)).rejects.toThrow("disk full");

    expect(host.log).toEqual([]);
  });

  it("does not claim a save that was cancelled after the PNG came back", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor((_request, current) => {
      current.isCancellationRequested = true;
      return { data: PNG_BASE64, fontFallback: true };
    }, cancellation);

    await provider.saveCustomDocument(document, cancellation);

    expect(host.log).toEqual([]);
  });

  it("never warns for a backup, which runs on its own timer", async () => {
    const cancellation = token();
    const { provider, document } = await openEditor(rendered({ fontFallback: true }), cancellation);

    await provider.backupCustomDocument(
      document,
      { destination: host.Uri.file("/backups/1") as unknown as vscode.Uri },
      cancellation,
    );

    expect(host.log).toEqual(["written: /backups/1"]);
  });
});
