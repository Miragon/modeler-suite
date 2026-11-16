import type { ShellHandle } from "@miragon/modeler-shell";
import type { IdeDocumentOptions } from "@miragon/modeler-shell/ide";
import { describe, expect, test } from "vitest";
import { webColumn } from "../src/column.js";
import { webEditorHost, type WebDocument } from "../src/web-host.js";

const COLUMN = webColumn(
  "board",
  false,
  { komet: "/mark.svg", openKey: "Ctrl+O", saveKey: "Ctrl+S" },
  {
    startBoard: () => undefined,
    newBoard: () => undefined,
    pickFile: () => undefined,
    showExample: () => undefined,
    resetExample: () => undefined,
    download: () => undefined,
  },
);
// connectDocument does not read the shell: the document is the page's own.
const NO_SHELL = undefined as unknown as ShellHandle;

/**
 * The editor's side of the document, as mountBoardEditor hands it over: a canvas that holds one
 * text. With `drawn`, an import is on the canvas only once the test resolved it.
 */
interface EditorSide {
  /** the text the canvas holds */
  canvas: string;
  writable: boolean;
  /** every text the page handed over, in order */
  readonly imports: string[];
  readonly sync: IdeDocumentOptions;
}

function editorSide(
  refuses: (text: string) => boolean = () => false,
  drawn: Promise<void> = Promise.resolve(),
): EditorSide {
  const imports: string[] = [];
  const side: EditorSide = {
    canvas: "",
    writable: true,
    imports,
    sync: {
      async importText(text) {
        imports.push(text);
        await drawn;
        if (refuses(text)) return false;
        side.canvas = text;
        return true;
      },
      exportText: () => side.canvas,
      canWrite: () => side.writable,
      commands: {},
    },
  };
  return side;
}

/** the page's side of the document, with a fallback unless the test asks for none */
function pageSide(text: string, fallback: string | null = "the fallback\n") {
  const page = { changes: [] as string[], refusals: 0 };
  const document: WebDocument = {
    text,
    ...(fallback === null ? {} : { fallback }),
    refused: () => void (page.refusals += 1),
    changed: (changed) => void page.changes.push(changed),
  };
  return { page, document };
}

describe("the web app as the host of the board's editor", () => {
  test("keeps the canvas's own history: the page has none", () => {
    expect(webEditorHost(pageSide("a board\n").document, COLUMN).canvasOwnsHistory).toBe(true);
  });

  test("hands the editor the place the page keeps its view in, and none where the page has none", () => {
    const kept = new Map<string, unknown>();
    const place = {
      read: (key: string) => kept.get(key),
      write: (key: string, value: unknown) => void kept.set(key, value),
    };
    const { document } = pageSide("a board\n");

    expect(webEditorHost(document, COLUMN, place).state).toBe(place);
    // absent, not undefined: the editor asks for the member
    expect("state" in webEditorHost(document, COLUMN)).toBe(false);
  });

  test("hands the editor the page's text once, and nothing before the editor asked", async () => {
    const editor = editorSide();
    const { page, document } = pageSide("a board\n");
    const host = webEditorHost(document, COLUMN);
    expect(editor.imports).toEqual([]);

    const connected = await host.connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    expect(editor.imports).toEqual(["a board\n"]);
    expect(connected.readOnly).toBe(false);
    expect(page).toEqual({ changes: [], refusals: 0 });
    await expect(connected.imported()).resolves.toBeUndefined();
  });

  test("tells the page every change of the board, and no text twice in a row", async () => {
    const editor = editorSide();
    const { page, document } = pageSide("a board\n");
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    // an event without a change of the text: a drag that drops a node where it was
    connected.pushEdit();
    expect(page.changes).toEqual([]);

    editor.canvas = "a board with a note\n";
    connected.pushEdit();
    connected.pushEdit();
    editor.canvas = "a board\n";
    connected.pushEdit();

    // the text the page opened with is a change too, once the board left it
    expect(page.changes).toEqual(["a board with a note\n", "a board\n"]);
  });

  test("tells nothing before the first text is on the canvas", async () => {
    let draw: () => void = () => undefined;
    const editor = editorSide(() => false, new Promise<void>((resolve) => (draw = resolve)));
    const { page, document } = pageSide("a board\n");
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);

    editor.canvas = "what the canvas held before the import\n";
    connected.pushEdit();
    expect(page.changes).toEqual([]);

    draw();
    await connected.ready;
    expect(editor.canvas).toBe("a board\n");
    editor.canvas = "a board with a note\n";
    connected.pushEdit();
    expect(page.changes).toEqual(["a board with a note\n"]);
  });

  test("a text the board refuses: the fallback is shown and the page is told", async () => {
    const editor = editorSide((text) => text === "no board at all");
    const { page, document } = pageSide("no board at all");
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    expect(editor.imports).toEqual(["no board at all", "the fallback\n"]);
    expect(editor.canvas).toBe("the fallback\n");
    expect(page).toEqual({ changes: [], refusals: 1 });

    // the refused text is replaced by the first change of what is shown in its place
    editor.canvas = "the fallback with a note\n";
    connected.pushEdit();
    expect(page.changes).toEqual(["the fallback with a note\n"]);
  });

  test("a refused text without a fallback: nothing takes its place, and nothing is told", async () => {
    const editor = editorSide((text) => text === "no board at all");
    const { page, document } = pageSide("no board at all", null);
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    // the editor's own lock says what is wrong with the text: the page imports nothing else
    expect(editor.imports).toEqual(["no board at all"]);
    expect(editor.canvas).toBe("");
    expect(page).toEqual({ changes: [], refusals: 0 });
  });

  test("a board that may not write tells the page nothing", async () => {
    const editor = editorSide();
    const { page, document } = pageSide("a board\n");
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    editor.writable = false;
    editor.canvas = "a board with a note\n";
    connected.pushEdit();
    expect(page.changes).toEqual([]);

    editor.writable = true;
    connected.pushEdit();
    expect(page.changes).toEqual(["a board with a note\n"]);
  });

  test("a disconnected document tells the page nothing more", async () => {
    const editor = editorSide();
    const { page, document } = pageSide("a board\n");
    const connected = await webEditorHost(document, COLUMN).connectDocument(NO_SHELL, editor.sync);
    await connected.ready;

    connected.disconnect();
    editor.canvas = "written while the editor went\n";
    connected.pushEdit();

    expect(page.changes).toEqual([]);
    expect(() => connected.insertExample()).not.toThrow();
  });
});
