// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const REVEAL = "Reveal in File Explorer";

const host = vi.hoisted(() => {
  class Uri {
    readonly scheme = "file";
    constructor(readonly path: string) {}
    static file(path: string): Uri {
      return new Uri(path);
    }
    static joinPath(base: Uri, ...segments: string[]): Uri {
      return new Uri([base.path, ...segments].join("/"));
    }
    with(change: { path: string }): Uri {
      return new Uri(change.path);
    }
  }
  const state = {
    saveTarget: undefined as Uri | undefined,
    writeError: undefined as Error | undefined,
    chosenAction: undefined as string | undefined,
  };
  const written: Array<{ path: string; bytes: Uint8Array }> = [];
  const notices: Array<{ level: string; text: string; actions: string[] }> = [];
  const executed: unknown[][] = [];
  const notice =
    (level: string) =>
    (text: string, ...actions: string[]): Promise<string | undefined> => {
      notices.push({ level, text, actions });
      return Promise.resolve(state.chosenAction);
    };
  const vscodeStub = {
    Uri,
    commands: {
      executeCommand(...args: unknown[]): Promise<undefined> {
        executed.push(args);
        return Promise.resolve(undefined);
      },
    },
    window: {
      showSaveDialog: () => Promise.resolve(state.saveTarget),
      showInformationMessage: notice("information"),
      showWarningMessage: notice("warning"),
      showErrorMessage: notice("error"),
    },
    workspace: {
      workspaceFolders: undefined,
      fs: {
        writeFile(target: Uri, bytes: Uint8Array): Promise<void> {
          if (state.writeError) return Promise.reject(state.writeError);
          written.push({ path: target.path, bytes });
          return Promise.resolve();
        },
      },
    },
  };
  return {
    Uri,
    vscodeStub,
    state,
    written,
    notices,
    executed,
    reset(): void {
      state.saveTarget = undefined;
      state.writeError = undefined;
      state.chosenAction = undefined;
      written.length = 0;
      notices.length = 0;
      executed.length = 0;
    },
  };
});

vi.mock("vscode", () => host.vscodeStub);
vi.mock("@miragon/modeler-shell/vscode/extension", () => ({ revealFileLabel: () => REVEAL }));

const { exportImageToFile } = await import("./exportImage.js");

const source = host.Uri.file("/work/shop.tt") as unknown as vscode.Uri;
const PNG_BASE64 = Buffer.from("png bytes").toString("base64");

beforeEach(() => {
  host.reset();
  host.state.saveTarget = host.Uri.file("/out/shop.png");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportImageToFile", () => {
  it("writes the PNG's bytes and tells the file name with a reveal action", async () => {
    await exportImageToFile(source, "png", PNG_BASE64);

    expect(host.written).toHaveLength(1);
    expect(host.written[0]?.path).toBe("/out/shop.png");
    expect(Buffer.from(host.written[0]!.bytes).toString()).toBe("png bytes");
    expect(host.notices).toEqual([
      { level: "information", text: "Exported shop.png.", actions: [REVEAL] },
    ]);
  });

  it("warns, with the same reveal action, when the labels came out in the system font", async () => {
    await exportImageToFile(source, "png", PNG_BASE64, { fontFallback: true });

    expect(host.written).toHaveLength(1);
    expect(host.notices).toEqual([
      {
        level: "warning",
        text: "Exported shop.png in a system font. Geist couldn't be embedded.",
        actions: [REVEAL],
      },
    ]);
  });

  it("reveals the file when the notice's action is chosen", async () => {
    host.state.chosenAction = REVEAL;

    await exportImageToFile(source, "png", PNG_BASE64, { fontFallback: true });

    expect(host.executed).toEqual([["revealFileInOS", host.state.saveTarget]]);
  });

  it("shows only the error, in its own words, when the file cannot be written", async () => {
    host.state.writeError = new Error("disk full");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await exportImageToFile(source, "png", PNG_BASE64, { fontFallback: true });

    expect(host.notices).toEqual([
      {
        level: "error",
        text: "Couldn't export shop.png. Try again, or choose another folder.",
        actions: [],
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith("Couldn't write shop.png", host.state.writeError);
  });

  it("writes nothing and says nothing when the save dialog is dismissed", async () => {
    host.state.saveTarget = undefined;

    await exportImageToFile(source, "png", PNG_BASE64, { fontFallback: true });

    expect(host.written).toHaveLength(0);
    expect(host.notices).toHaveLength(0);
  });

  it("writes an SVG as its text", async () => {
    host.state.saveTarget = host.Uri.file("/out/shop.svg");

    await exportImageToFile(source, "svg", "<svg/>");

    expect(Buffer.from(host.written[0]!.bytes).toString()).toBe("<svg/>");
    expect(host.notices[0]).toMatchObject({ level: "information", text: "Exported shop.svg." });
  });
});
