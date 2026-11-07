import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeCanvas, FakeEventBus, FrameQueue } from "../../test/support/diagram-js.js";
import { cleanup, installFakes, setContainerSize } from "../../test/support/dom.js";
import { orcaEditorHost } from "../orca/webview/index.js";
import { installOrcaEditorStub, type OrcaStubWindow } from "../testing/orca-stub.js";
import { vsCodeEditorHost, type VsCodeEditorApi } from "../vscode/webview/index.js";
import {
  mountIdeEditor,
  type IdeEditorContext,
  type IdeEditorDefinition,
  type IdeModelerOptions,
} from "./index.js";

const later = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface FakeModeler {
  readonly diagram: { readonly container: HTMLElement; get<T>(name: string): T };
  readonly options: IdeModelerOptions;
  readonly locks: Array<[boolean, number | undefined]>;
  text: string;
  importText(text: string): Promise<void>;
  exportText(): string;
  onContentChanged(listener: () => void): void;
  contentBounds(): { x: number; y: number; width: number; height: number };
  userEdit(text: string): void;
}

function fakeModeler(options: IdeModelerOptions): FakeModeler {
  const bus = new FakeEventBus();
  const canvas = new FakeCanvas(bus);
  const listeners: Array<() => void> = [];
  const services: Record<string, unknown> = {
    canvas,
    eventBus: bus,
    elementRegistry: { get: () => undefined },
    modelerShell: { attachShell: () => () => undefined },
  };
  const modeler: FakeModeler = {
    diagram: { container: canvas.container, get: <T>(name: string) => services[name] as T },
    options,
    locks: [],
    text: "",
    async importText(text) {
      if (text.includes("broken")) throw new Error("not importable");
      modeler.text = text;
    },
    exportText: () => modeler.text,
    onContentChanged: (listener) => void listeners.push(listener),
    contentBounds: () => ({ x: 0, y: 0, width: 400, height: 300 }),
    userEdit(text) {
      modeler.text = text;
      for (const listener of listeners) listener();
    },
  };
  return modeler;
}

type TestDefinition = IdeEditorDefinition<FakeModeler> & {
  readonly created: FakeModeler[];
  lastContext?: IdeEditorContext<FakeModeler>;
};

function definition(): TestDefinition {
  const created: FakeModeler[] = [];
  const board: TestDefinition = {
    created,
    name: "Test board",
    themes: ["light"],
    createModeler(options) {
      const modeler = fakeModeler(options);
      created.push(modeler);
      return modeler;
    },
    setCanvasReadOnly: (modeler, readOnly, options) =>
      void modeler.locks.push([readOnly, options?.delayMs]),
    isEmpty: (modeler) => modeler.text.trim() === "",
    menu: (context) => {
      board.lastContext = context;
      return {
        export: [{ kind: "action", id: "png", label: "PNG", ...context.exportAction("png") }],
      };
    },
    sameText: (text, exported) => text.trim() === exported.trim(),
    exports: {
      png: {
        suggestedName: "board.png",
        mimeType: "image/png",
        failure: "Couldn't export the board as PNG.",
        produce: () => ({ data: new Blob([new Uint8Array([1, 2, 3])]) }),
      },
      "png-transparent": {
        suggestedName: "board.png",
        mimeType: "image/png",
        failure: "Couldn't export the board as PNG.",
        produce: () => {
          throw new Error("no canvas");
        },
      },
    },
    withExampleInserted: (text) => `${text}example\n`,
  };
  return board;
}

function appRoot(): HTMLElement {
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  setContainerSize(root, 1280, 900);
  return root;
}

beforeEach(() => {
  installFakes();
  const frames = new FrameQueue();
  vi.stubGlobal("requestAnimationFrame", frames.request);
  vi.stubGlobal("cancelAnimationFrame", frames.cancel);
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window as OrcaStubWindow, "orca");
});

describe("mountIdeEditor in VS Code", () => {
  function vsCode() {
    const posted: Array<Record<string, unknown>> = [];
    let state: unknown = { modelerShell: { legendOpen: true } };
    const api: VsCodeEditorApi = {
      postMessage: (message) => void posted.push(message as Record<string, unknown>),
      getState: () => state,
      setState: (next) => void (state = next),
    };
    return { api, posted, state: () => state };
  }

  it("leaves the history to VS Code, imports the init text and posts each canvas edit", async () => {
    const { api, posted } = vsCode();
    const board = definition();
    appRoot();
    const editor = mountIdeEditor(vsCodeEditorHost({}, api), board);
    const [modeler] = board.created as [FakeModeler];
    expect(modeler.options.undoRedoKeys).toBe(false);
    expect(posted).toEqual([{ type: "ready" }]);

    window.postMessage({ type: "init", text: "title A\n" }, "*");
    await editor.ready;
    expect(modeler.text).toBe("title A\n");
    modeler.userEdit("title A\nevent X\n");
    expect(posted.at(-1)).toEqual({ type: "edit", text: "title A\nevent X\n" });
  });

  it("names the export commands after their formats and posts a picture in Base64", async () => {
    const { api, posted } = vsCode();
    appRoot();
    mountIdeEditor(vsCodeEditorHost({}, api), definition());
    window.postMessage({ type: "command", name: "exportPng" }, "*");
    await later();
    await vi.waitFor(() =>
      expect(posted.at(-1)).toEqual({ type: "export", format: "png", data: "AQID" }),
    );
    window.postMessage({ type: "command", name: "exportPngTransparent" }, "*");
    await vi.waitFor(() =>
      expect(posted.at(-1)).toEqual({
        type: "error",
        message: "Couldn't export the board as PNG.",
      }),
    );
  });

  it("locks the canvas at once and shows the invalid file after the delay", async () => {
    const { api } = vsCode();
    const board = definition();
    appRoot();
    const editor = mountIdeEditor(vsCodeEditorHost({}, api), board);
    window.postMessage({ type: "init", text: "broken\n" }, "*");
    await editor.ready;
    expect(board.created[0]?.locks.at(-1)).toEqual([true, 800]);
    expect(editor.shell.isReadOnly()).toBe(true);
  });

  it("asks the extension to insert the example", async () => {
    const { api, posted } = vsCode();
    appRoot();
    const editor = mountIdeEditor(vsCodeEditorHost({}, api), definition());
    window.postMessage({ type: "init", text: "" }, "*");
    await editor.ready;
    (await editor.document).insertExample();
    expect(posted.at(-1)).toEqual({ type: "insertExample" });
  });
});

describe("mountIdeEditor in Orca", () => {
  const merge = (_base: string, external: string, draft: string): string =>
    external === draft ? draft : `${external}${draft}`;

  it("owns the history, syncs through the session and saves exports through Orca's dialog", async () => {
    const orca = installOrcaEditorStub({ text: "title A\n" });
    const board = definition();
    appRoot();
    const editor = mountIdeEditor(orcaEditorHost({ merge, debounceMs: 0 }), board);
    await editor.ready;
    const [modeler] = board.created as [FakeModeler];
    expect(modeler.options.undoRedoKeys).toBe(true);
    expect(modeler.text).toBe("title A\n");

    modeler.userEdit("title A\nevent X\n");
    await orca.save();
    expect(orca.disk).toBe("title A\nevent X\n");

    board.lastContext?.exportAction("png").onSelect();
    await vi.waitFor(() => expect(orca.saved).toHaveLength(1));
    expect(orca.saved[0]).toMatchObject({ suggestedName: "board.png", mimeType: "image/png" });
    expect(orca.saved[0]?.data).toBeInstanceOf(ArrayBuffer);
  });

  it("locks the canvas of a read-only file", async () => {
    installOrcaEditorStub({ text: "title A\n", readOnly: true });
    const board = definition();
    appRoot();
    const editor = mountIdeEditor(orcaEditorHost({ merge }), board);
    await editor.ready;
    expect(board.created[0]?.locks.at(-1)).toEqual([true, undefined]);
    expect(editor.shell.isReadOnly()).toBe(true);
  });

  it("inserts the example itself and writes it", async () => {
    const orca = installOrcaEditorStub({ text: "" });
    const board = definition();
    appRoot();
    const editor = mountIdeEditor(orcaEditorHost({ merge, debounceMs: 0 }), board);
    await editor.ready;
    (await editor.document).insertExample();
    await (await editor.document).imported();
    await orca.save();
    expect(board.created[0]?.text).toBe("example\n");
    expect(orca.disk).toBe("example\n");
  });

  it("follows Orca's mode, resolved against the modeler's themes", async () => {
    const orca = installOrcaEditorStub({ text: "", colorScheme: "dark" });
    appRoot();
    const editor = mountIdeEditor(orcaEditorHost({ merge }), {
      ...definition(),
      themes: ["light", "dark"],
    });
    await editor.ready;
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("dark");
    orca.setColorScheme("light");
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("light");
  });
});
