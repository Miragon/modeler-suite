import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IMAGE_EXPORT_KINDS,
  createNewDocument,
  defaultFileCommandMessages,
  exportToFile,
  registerNewDocumentCommand,
  type ExportToFileOptions,
  type NewDocumentOptions,
  type SaveDialogOptionsLike,
  type VsCodeFilesLike,
} from "./index.js";

interface FakeUri {
  readonly scheme: string;
  readonly path: string;
  toString(): string;
  with(change: { path: string }): FakeUri;
}

function uri(path: string, scheme = "file"): FakeUri {
  return {
    scheme,
    path,
    toString: () => `${scheme}://${path}`,
    with: (change) => uri(change.path, scheme),
  };
}

interface Notification {
  severity: "info" | "warning" | "error";
  message: string;
  items: string[];
  modal?: boolean;
}

/**
 * A fake `vscode` for the file commands: the save dialog answers `saveTarget`, a notification
 * `answer`, and the files at `existing` paths are there before the command runs.
 */
function fakeVsCode({ folder }: { folder?: string } = {}) {
  const state = {
    saveTarget: undefined as FakeUri | undefined,
    writeError: undefined as Error | undefined,
    answer: undefined as string | undefined,
    existing: new Set<string>(),
  };
  const dialogs: SaveDialogOptionsLike<FakeUri>[] = [];
  const written: { uri: FakeUri; text: string; bytes: Uint8Array }[] = [];
  const notifications: Notification[] = [];
  const executed: { command: string; args: unknown[] }[] = [];
  const registered = new Map<string, () => unknown>();
  const notify =
    (severity: Notification["severity"]) =>
    (message: string, ...rest: (string | { modal?: boolean })[]): Promise<string | undefined> => {
      const items = rest.filter((item): item is string => typeof item === "string");
      const options = rest.find((item) => typeof item !== "string");
      notifications.push({
        severity,
        message,
        items,
        ...(options?.modal === undefined ? {} : { modal: options.modal }),
      });
      return Promise.resolve(severity === "error" ? undefined : state.answer);
    };
  const vscode = {
    window: {
      showSaveDialog(options: SaveDialogOptionsLike<FakeUri>) {
        dialogs.push(options);
        return Promise.resolve(state.saveTarget);
      },
      showInformationMessage: notify("info"),
      showWarningMessage: notify("warning"),
      showErrorMessage: notify("error"),
    },
    workspace: {
      workspaceFolders: folder === undefined ? undefined : [{ uri: uri(folder) }],
      fs: {
        writeFile(target: FakeUri, bytes: Uint8Array) {
          if (state.writeError) return Promise.reject(state.writeError);
          written.push({ uri: target, text: new TextDecoder().decode(bytes), bytes });
          state.existing.add(target.path);
          return Promise.resolve();
        },
        stat(target: FakeUri) {
          return state.existing.has(target.path)
            ? Promise.resolve({ type: 1 })
            : Promise.reject(new Error(`FileNotFound: ${target.path}`));
        },
      },
    },
    commands: {
      executeCommand(command: string, ...args: unknown[]) {
        executed.push({ command, args });
        return Promise.resolve(undefined);
      },
      registerCommand(command: string, callback: () => unknown) {
        registered.set(command, callback);
        return { dispose: () => registered.delete(command) };
      },
    },
    Uri: {
      joinPath: (base: FakeUri, ...segments: string[]) =>
        uri([base.path.replace(/\/$/, ""), ...segments].join("/"), base.scheme),
    },
  } satisfies VsCodeFilesLike<FakeUri>;
  return { vscode, state, dialogs, written, notifications, executed, registered };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportToFile", () => {
  const board = uri("/boards/checkout.storm");

  function exportPng(
    host: ReturnType<typeof fakeVsCode>,
    options: Partial<ExportToFileOptions<FakeUri>> = {},
  ) {
    return exportToFile(host.vscode, {
      kind: IMAGE_EXPORT_KINDS.png,
      data: btoa("png!"),
      sourceUri: board,
      defaultName: "event-storming-board",
      platform: "darwin",
      ...options,
    });
  }

  it("suggests the document's name beside it, writes the decoded PNG and resolves to the file", async () => {
    const host = fakeVsCode();
    const target = uri("/out/checkout.png");
    host.state.saveTarget = target;

    await expect(exportPng(host)).resolves.toBe(target);

    expect(host.dialogs).toEqual([
      {
        title: "Export as PNG",
        saveLabel: "Export",
        filters: { "PNG image": ["png"] },
        defaultUri: expect.objectContaining({ path: "/boards/checkout.png" }) as unknown,
      },
    ]);
    expect(host.written).toEqual([expect.objectContaining({ uri: target, text: "png!" })]);
  });

  it("decodes every byte of a PNG, not only text", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/out/checkout.png");
    const bytes = [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80];

    await exportPng(host, { data: btoa(String.fromCharCode(...bytes)) });

    expect([...host.written[0]!.bytes]).toEqual(bytes);
  });

  it("writes a text kind as UTF-8", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/out/checkout.svg");

    await exportPng(host, {
      kind: IMAGE_EXPORT_KINDS.svg,
      data: "<svg><text>Größe 4×</text></svg>",
    });

    expect(host.written[0]!.text).toBe("<svg><text>Größe 4×</text></svg>");
  });

  it.each([
    ["png", "Export as PNG", "PNG image", "/boards/checkout.png"],
    ["svg", "Export as SVG", "SVG image", "/boards/checkout.svg"],
    [
      "png-transparent",
      "Export as PNG (4×, transparent)",
      "PNG image",
      "/boards/checkout-transparent@4x.png",
    ],
  ] as const)("names the %s export as the web apps do", async (format, title, filter, path) => {
    const host = fakeVsCode();

    await exportPng(host, { kind: IMAGE_EXPORT_KINDS[format] });

    expect(host.dialogs[0]).toMatchObject({
      title,
      filters: { [filter]: [path.slice(path.lastIndexOf(".") + 1)] },
      defaultUri: { path },
    });
  });

  it("drops only the last extension by default, and what sourceExtension matches when given", async () => {
    const host = fakeVsCode();
    const pngDiagram = uri("/work/shop.tt.png");

    await exportPng(host, { kind: IMAGE_EXPORT_KINDS.svg, sourceUri: pngDiagram });
    await exportPng(host, {
      kind: IMAGE_EXPORT_KINDS.svg,
      sourceUri: pngDiagram,
      sourceExtension: /(\.(tt|ttm))?\.[^./]+$/i,
    });

    expect(host.dialogs.map((dialog) => dialog.defaultUri?.path)).toEqual([
      "/work/shop.tt.svg",
      "/work/shop.svg",
    ]);
  });

  it("suggests the default name in the first workspace folder for a document that is no file", async () => {
    const host = fakeVsCode({ folder: "/workspace" });

    await exportPng(host, { sourceUri: uri("/Untitled-1", "untitled") });
    await exportPng(host, { sourceUri: undefined });

    expect(host.dialogs.map((dialog) => dialog.defaultUri?.toString())).toEqual([
      "file:///workspace/event-storming-board.png",
      "file:///workspace/event-storming-board.png",
    ]);
  });

  it("suggests nothing without a file and without a workspace folder", async () => {
    const host = fakeVsCode();

    await exportPng(host, { sourceUri: uri("/Untitled-1", "untitled") });

    expect(host.dialogs[0]).not.toHaveProperty("defaultUri");
  });

  it("hands VS Code copies of the filters, so the kinds stay as they are", async () => {
    const host = fakeVsCode();

    await exportPng(host);
    host.dialogs[0]!.filters!["PNG image"]!.push("jpg");

    expect(IMAGE_EXPORT_KINDS.png.filters).toEqual({ "PNG image": ["png"] });
    expect(Object.isFrozen(IMAGE_EXPORT_KINDS)).toBe(true);
    expect(Object.isFrozen(IMAGE_EXPORT_KINDS.png)).toBe(true);
  });

  it.each([
    ["darwin", "Reveal in Finder"],
    ["win32", "Reveal in File Explorer"],
    ["linux", "Open Containing Folder"],
  ])(
    "names the file with the action that shows it, labelled like VS Code on %s",
    async (platform, reveal) => {
      const host = fakeVsCode();
      host.state.saveTarget = uri("/out/checkout.png");

      await exportPng(host, { platform });

      expect(host.notifications).toEqual([
        { severity: "info", message: "Exported checkout.png.", items: [reveal] },
      ]);
    },
  );

  it("reveals the file when the action is chosen, and only then", async () => {
    const host = fakeVsCode();
    const target = uri("/out/checkout.png");
    host.state.saveTarget = target;

    await exportPng(host);
    expect(host.executed).toEqual([]);

    host.state.answer = "Reveal in Finder";
    await exportPng(host);
    expect(host.executed).toEqual([{ command: "revealFileInOS", args: [target] }]);
  });

  it("warns, with the same action, when the PNG's labels fell back to the system font", async () => {
    const host = fakeVsCode();
    const target = uri("/out/checkout.png");
    host.state.saveTarget = target;
    host.state.answer = "Reveal in Finder";

    await exportPng(host, { fontFallback: true });

    expect(host.written).toHaveLength(1);
    expect(host.notifications).toEqual([
      {
        severity: "warning",
        message: "Exported checkout.png in a system font. Geist couldn't be embedded.",
        items: ["Reveal in Finder"],
      },
    ]);
    expect(host.executed).toEqual([{ command: "revealFileInOS", args: [target] }]);
  });

  it("reports a file it cannot write in its own words, logs the cause and shows no success", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/out/checkout.png");
    host.state.writeError = new Error("disk full");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(exportPng(host, { fontFallback: true })).resolves.toBeUndefined();

    expect(host.notifications).toEqual([
      {
        severity: "error",
        message: "Couldn't export checkout.png. Try again, or choose another folder.",
        items: [],
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith("Couldn't write checkout.png", host.state.writeError);
  });

  it("reports data that is no base64 as a failed export instead of rejecting", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/out/checkout.png");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(exportPng(host, { data: "not base64!" })).resolves.toBeUndefined();

    expect(host.written).toEqual([]);
    expect(host.notifications.map(({ severity }) => severity)).toEqual(["error"]);
  });

  it("writes nothing and says nothing when the dialog is dismissed", async () => {
    const host = fakeVsCode();

    await expect(exportPng(host)).resolves.toBeUndefined();

    expect(host.written).toEqual([]);
    expect(host.notifications).toEqual([]);
  });

  it("takes a localized modeler's texts, and keeps the default for an undefined one", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/out/checkout.png");

    await exportPng(host, {
      messages: {
        exportSaveLabel: "Exportieren",
        exported: (fileName) => `${fileName} exportiert.`,
        revealFile: () => "Im Finder zeigen",
        couldNotExport: undefined,
      },
    });
    host.state.writeError = new Error("disk full");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await exportPng(host, { messages: { couldNotExport: undefined } });

    expect(host.dialogs[0]?.saveLabel).toBe("Exportieren");
    expect(host.notifications).toEqual([
      { severity: "info", message: "checkout.png exportiert.", items: ["Im Finder zeigen"] },
      {
        severity: "error",
        message: defaultFileCommandMessages.couldNotExport("checkout.png"),
        items: [],
      },
    ]);
  });
});

describe("createNewDocument and registerNewDocumentCommand", () => {
  const NEW_CHAIN: NewDocumentOptions = {
    viewType: "valueChain.diagramEditor",
    text: '{\n  "name": "Größe"\n}\n',
    title: "New Value Chain Diagram",
    saveLabel: "Create diagram",
    filters: { "Value Chain Diagram": ["vc.json", "vc"] },
    defaultFileName: "value-chain.vc.json",
  };

  it("registers the command, which suggests the name in the first workspace folder, writes the text and opens the file in the modeler", async () => {
    const host = fakeVsCode({ folder: "/workspace" });
    const target = uri("/workspace/porter.vc.json");
    host.state.saveTarget = target;

    registerNewDocumentCommand(host.vscode, "valueChain.newDiagramFromExample", NEW_CHAIN);
    await expect(host.registered.get("valueChain.newDiagramFromExample")?.()).resolves.toBe(target);

    expect(host.dialogs).toEqual([
      {
        title: "New Value Chain Diagram",
        saveLabel: "Create diagram",
        filters: { "Value Chain Diagram": ["vc.json", "vc"] },
        defaultUri: expect.objectContaining({ path: "/workspace/value-chain.vc.json" }) as unknown,
      },
    ]);
    expect(host.written).toEqual([
      expect.objectContaining({ uri: target, text: '{\n  "name": "Größe"\n}\n' }),
    ]);
    expect(host.executed).toEqual([
      { command: "vscode.openWith", args: [target, "valueChain.diagramEditor"] },
    ]);
    expect(host.notifications).toEqual([]);
  });

  it("unregisters the command when its disposable is disposed", () => {
    const host = fakeVsCode();

    registerNewDocumentCommand(host.vscode, "valueChain.newDiagram", NEW_CHAIN).dispose();

    expect(host.registered.size).toBe(0);
  });

  it("suggests no name without a workspace folder", async () => {
    const host = fakeVsCode();

    await createNewDocument(host.vscode, NEW_CHAIN);

    expect(host.dialogs[0]).not.toHaveProperty("defaultUri");
  });

  it("writes and opens nothing when the dialog is dismissed", async () => {
    const host = fakeVsCode({ folder: "/workspace" });

    await expect(createNewDocument(host.vscode, NEW_CHAIN)).resolves.toBeUndefined();

    expect(host.written).toEqual([]);
    expect(host.executed).toEqual([]);
  });

  it("writes to the path targetPath gives, so the modeler's editor claims the file", async () => {
    const host = fakeVsCode();
    const options = {
      ...NEW_CHAIN,
      targetPath: (path: string) =>
        /\.vc(\.json)?$/i.test(path) ? path : `${path.replace(/\.json$/i, "")}.vc.json`,
    };
    const claimed = uri("/work/chain.vc");

    host.state.saveTarget = uri("/work/chain.json");
    const renamed = await createNewDocument(host.vscode, options);
    host.state.saveTarget = claimed;
    const kept = await createNewDocument(host.vscode, options);

    expect(renamed?.path).toBe("/work/chain.vc.json");
    expect(kept).toBe(claimed);
    expect(host.written.map((file) => file.uri.path)).toEqual([
      "/work/chain.vc.json",
      "/work/chain.vc",
    ]);
    expect(host.executed.map(({ args }) => (args[0] as FakeUri).path)).toEqual([
      "/work/chain.vc.json",
      "/work/chain.vc",
    ]);
    expect(host.notifications).toEqual([]);
  });

  describe("a file already at the path targetPath gives", () => {
    const RENAMING_CHAIN = {
      ...NEW_CHAIN,
      targetPath: (path: string) =>
        /\.vc(\.json)?$/i.test(path) ? path : `${path.replace(/\.json$/i, "")}.vc.json`,
    };

    function hostWithExistingChain() {
      const host = fakeVsCode();
      host.state.saveTarget = uri("/work/chain.json");
      host.state.existing.add("/work/chain.vc.json");
      return host;
    }

    it("is replaced only after a modal question, since the save dialog asked about another file", async () => {
      const host = hostWithExistingChain();
      host.state.answer = "Replace";

      const created = await createNewDocument(host.vscode, RENAMING_CHAIN);

      expect(host.notifications).toEqual([
        {
          severity: "warning",
          message: "chain.vc.json already exists. Do you want to replace it?",
          items: ["Replace"],
          modal: true,
        },
      ]);
      expect(created?.path).toBe("/work/chain.vc.json");
      expect(host.written.map((file) => file.uri.path)).toEqual(["/work/chain.vc.json"]);
      expect(host.executed).toEqual([
        { command: "vscode.openWith", args: [created, "valueChain.diagramEditor"] },
      ]);
    });

    it("stays as it is, and nothing opens, when the question is dismissed", async () => {
      const host = hostWithExistingChain();

      await expect(createNewDocument(host.vscode, RENAMING_CHAIN)).resolves.toBeUndefined();

      expect(host.notifications.map(({ modal }) => modal)).toEqual([true]);
      expect(host.written).toEqual([]);
      expect(host.executed).toEqual([]);
    });

    it("asks nothing more when the dialog's own file is written, whose replace it confirmed itself", async () => {
      const host = fakeVsCode();
      host.state.saveTarget = uri("/work/chain.vc.json");
      host.state.existing.add("/work/chain.vc.json");

      await createNewDocument(host.vscode, RENAMING_CHAIN);
      await createNewDocument(host.vscode, NEW_CHAIN);

      expect(host.notifications).toEqual([]);
      expect(host.written).toHaveLength(2);
    });

    it("takes a localized modeler's question and action", async () => {
      const host = hostWithExistingChain();
      host.state.answer = "Ersetzen";

      const created = await createNewDocument(host.vscode, {
        ...RENAMING_CHAIN,
        messages: {
          alreadyExists: (fileName) => `${fileName} gibt es schon. Willst du sie ersetzen?`,
          replaceLabel: "Ersetzen",
        },
      });

      expect(host.notifications).toEqual([
        {
          severity: "warning",
          message: "chain.vc.json gibt es schon. Willst du sie ersetzen?",
          items: ["Ersetzen"],
          modal: true,
        },
      ]);
      expect(created?.path).toBe("/work/chain.vc.json");
    });
  });

  it("reports a file it cannot write in its own words, logs the cause and opens nothing", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/work/chain.vc.json");
    host.state.writeError = new Error("read-only file system");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createNewDocument(host.vscode, NEW_CHAIN)).resolves.toBeUndefined();

    expect(host.notifications).toEqual([
      {
        severity: "error",
        message: "Couldn't create chain.vc.json. Try again, or choose another folder.",
        items: [],
      },
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      "Couldn't write chain.vc.json",
      host.state.writeError,
    );
    expect(host.executed).toEqual([]);
  });

  it("takes a localized modeler's error text", async () => {
    const host = fakeVsCode();
    host.state.saveTarget = uri("/work/chain.vc.json");
    host.state.writeError = new Error("read-only file system");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await createNewDocument(host.vscode, {
      ...NEW_CHAIN,
      messages: { couldNotCreate: (fileName) => `${fileName} konnte nicht angelegt werden.` },
    });

    expect(host.notifications[0]?.message).toBe("chain.vc.json konnte nicht angelegt werden.");
  });
});
