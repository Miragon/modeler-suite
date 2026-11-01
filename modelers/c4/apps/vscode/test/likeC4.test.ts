import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { StubWebviewPanel } from "@miragon/modeler-shell/testing/vscode-stub";
import { GO_TO_VIEW_COMMAND, NO_DIAGRAM_MESSAGE, WEBVIEW_COMMANDS } from "../src/commands.js";
import { DIAGRAM_VIEW_TYPE, DSL_DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { activate } from "../src/extension.js";
import {
  LIKEC4_EXTENSION_ID,
  LIKEC4_LANGUAGE_ID,
  STRUCTURIZR_LANGUAGE_ID,
  correctedLanguage,
  isLikeC4Model,
} from "../src/likeC4.js";
import { FakeTextDocument, FakeUri, fakeVsCode, vscodeModule } from "./fakeVsCode.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

const STRUCTURIZR = 'workspace "Shop" {\n    model {\n        a = person "A"\n    }\n}\n';
const LIKEC4 =
  "specification {\n  element actor\n}\nmodel {\n  customer = actor 'Customer'\n}\nviews {\n  view index {\n    include *\n  }\n}\n";

const subscriptions: Array<{ dispose(): unknown }> = [];

function start(): void {
  activate({
    extensionUri: FakeUri.file("/extension"),
    subscriptions,
  } as unknown as vscode.ExtensionContext);
}

function textDocument(path: string, text: string, languageId: string): FakeTextDocument {
  return new FakeTextDocument(FakeUri.file(path), text, languageId);
}

function asTextDocument(fake: FakeTextDocument): vscode.TextDocument {
  return fake as unknown as vscode.TextDocument;
}

/** VS Code delivers nothing to a closed editor's webview. */
async function isClosed(panel: StubWebviewPanel): Promise<boolean> {
  return !(await panel.webview.postMessage({ type: "probe" }));
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => fakeVsCode.reset());
afterEach(() => {
  for (const subscription of subscriptions.splice(0)) subscription.dispose();
  vi.restoreAllMocks();
});

/*
 * LikeC4 (likec4.likec4-vscode) claims `.c4` for its language `likec4` as well, and has no custom
 * editor. VS Code gives every `.c4` file the language of the extension it registered last, so the
 * text decides: a Structurizr workspace is this modeler's, anything else LikeC4's.
 */
describe("the language of a .c4 text document next to LikeC4", () => {
  it.each([
    ["a workspace LikeC4 claimed", STRUCTURIZR, LIKEC4_LANGUAGE_ID, true, STRUCTURIZR_LANGUAGE_ID],
    [
      "a LikeC4 model this modeler claimed",
      LIKEC4,
      STRUCTURIZR_LANGUAGE_ID,
      true,
      LIKEC4_LANGUAGE_ID,
    ],
  ])("hands %s to the other language", (_name, text, languageId, installed, expected) => {
    const document = textDocument("/shop/model.c4", text, languageId);

    expect(correctedLanguage(asTextDocument(document), installed)).toBe(expected);
  });

  it.each([
    [
      "a workspace in its own language",
      "/shop/model.c4",
      STRUCTURIZR,
      STRUCTURIZR_LANGUAGE_ID,
      true,
    ],
    ["a LikeC4 model in LikeC4's", "/shop/model.c4", LIKEC4, LIKEC4_LANGUAGE_ID, true],
    ["a LikeC4 model without LikeC4", "/shop/model.c4", LIKEC4, STRUCTURIZR_LANGUAGE_ID, false],
    ["a blank file, which could be either", "/shop/model.c4", " \n", STRUCTURIZR_LANGUAGE_ID, true],
    ["a .dsl file", "/firmware/dsdt.dsl", LIKEC4, STRUCTURIZR_LANGUAGE_ID, true],
    ["another extension's language", "/shop/model.c4", STRUCTURIZR, "c4", true],
  ])("leaves %s alone", (_name, path, text, languageId, installed) => {
    const document = textDocument(path, text, languageId);

    expect(correctedLanguage(asTextDocument(document), installed)).toBeUndefined();
  });

  it("corrects the documents open at activation and every one that opens later", () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    const open = textDocument("/shop/workspace.c4", STRUCTURIZR, LIKEC4_LANGUAGE_ID);
    fakeVsCode.openTextDocument(open);

    start();
    fakeVsCode.openTextDocument(textDocument("/shop/model.c4", LIKEC4, STRUCTURIZR_LANGUAGE_ID));

    expect(fakeVsCode.languageChanges).toEqual([
      { path: "/shop/workspace.c4", languageId: STRUCTURIZR_LANGUAGE_ID },
      { path: "/shop/model.c4", languageId: LIKEC4_LANGUAGE_ID },
    ]);
    expect(open.languageId).toBe(STRUCTURIZR_LANGUAGE_ID);
  });

  it("keeps the language the user picks in Change Language Mode", async () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    start();
    const document = textDocument("/shop/workspace.c4", STRUCTURIZR, STRUCTURIZR_LANGUAGE_ID);
    fakeVsCode.openTextDocument(document);

    await vscodeModule.languages.setTextDocumentLanguage(document, LIKEC4_LANGUAGE_ID);
    await settle();

    expect(document.languageId).toBe(LIKEC4_LANGUAGE_ID);
    expect(fakeVsCode.languageChanges).toEqual([
      { path: "/shop/workspace.c4", languageId: LIKEC4_LANGUAGE_ID },
    ]);
  });

  it("corrects a document again once it was closed and opens anew", async () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    start();
    const document = textDocument("/shop/workspace.c4", STRUCTURIZR, LIKEC4_LANGUAGE_ID);
    fakeVsCode.openTextDocument(document);
    fakeVsCode.closeTextDocument(document);
    await settle();

    fakeVsCode.openTextDocument(
      textDocument("/shop/workspace.c4", STRUCTURIZR, LIKEC4_LANGUAGE_ID),
    );

    expect(fakeVsCode.languageChanges.map((change) => change.languageId)).toEqual([
      STRUCTURIZR_LANGUAGE_ID,
      STRUCTURIZR_LANGUAGE_ID,
    ]);
  });

  it("logs a language VS Code refuses and changes nothing else", async () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(vscodeModule.languages, "setTextDocumentLanguage").mockRejectedValue(
      new Error("Unknown language id: likec4"),
    );
    start();

    fakeVsCode.openTextDocument(textDocument("/shop/model.c4", LIKEC4, STRUCTURIZR_LANGUAGE_ID));
    await settle();

    expect(consoleError).toHaveBeenCalled();
  });
});

describe("a LikeC4 model opened in the C4 Modeler", () => {
  async function openDiagram(path: string, text: string, viewType = DIAGRAM_VIEW_TYPE) {
    const opened = await fakeVsCode.openCustomEditor(viewType, FakeUri.file(path), text);
    await settle();
    return opened;
  }

  it("is a .c4 file, neither blank nor a Structurizr workspace, while LikeC4 is installed", () => {
    const model = (path: string, text: string) =>
      asTextDocument(textDocument(path, text, STRUCTURIZR_LANGUAGE_ID));

    expect(isLikeC4Model(model("/shop/model.c4", LIKEC4), true)).toBe(true);
    expect(isLikeC4Model(model("/shop/MODEL.C4", LIKEC4), true)).toBe(true);
    expect(isLikeC4Model(model("/shop/model.c4", LIKEC4), false)).toBe(false);
    expect(isLikeC4Model(model("/shop/model.c4", STRUCTURIZR), true)).toBe(false);
    expect(isLikeC4Model(model("/shop/model.c4", ""), true)).toBe(false);
    expect(isLikeC4Model(model("/shop/model.dsl", LIKEC4), true)).toBe(false);
  });

  // Opening a file never notifies (guide §13.5): the text editor in LikeC4's language is the answer.
  it("reopens as text for LikeC4, every time without a notification", async () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    start();

    const first = await openDiagram("/shop/model.c4", LIKEC4);
    const second = await openDiagram("/shop/other.c4", LIKEC4);

    expect(fakeVsCode.executedCommands).toEqual([
      ["vscode.openWith", first.document.uri, "default", undefined],
      ["vscode.openWith", second.document.uri, "default", undefined],
    ]);
    expect(await isClosed(first.panel)).toBe(true);
    expect(await isClosed(second.panel)).toBe(true);
    expect(fakeVsCode.notifications).toEqual([]);
  });

  it("leaves Go to View and the diagram's commands nothing to reach", async () => {
    fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    start();
    const { panel } = await openDiagram("/shop/model.c4", LIKEC4);

    await fakeVsCode.runCommand(GO_TO_VIEW_COMMAND, FakeUri.file("/shop/model.c4"));
    await fakeVsCode.runCommand(WEBVIEW_COMMANDS.fitView);

    expect(fakeVsCode.quickPicks).toEqual([]);
    expect(fakeVsCode.notifications).toEqual([
      { severity: "info", message: NO_DIAGRAM_MESSAGE, items: [] },
      { severity: "info", message: NO_DIAGRAM_MESSAGE, items: [] },
    ]);
    expect(panel.posted.some((message) => (message as { type: string }).type === "command")).toBe(
      false,
    );
  });

  it.each([
    ["without LikeC4", "/shop/model.c4", LIKEC4, DIAGRAM_VIEW_TYPE, false],
    ["for a Structurizr workspace", "/shop/workspace.c4", STRUCTURIZR, DIAGRAM_VIEW_TYPE, true],
    ["for a blank file", "/shop/new.c4", "", DIAGRAM_VIEW_TYPE, true],
    [
      "for a .dsl file the user chose to open",
      "/shop/model.dsl",
      LIKEC4,
      DSL_DIAGRAM_VIEW_TYPE,
      true,
    ],
  ])("stays open %s", async (_name, path, text, viewType, installed) => {
    if (installed) fakeVsCode.installExtension(LIKEC4_EXTENSION_ID);
    start();

    const { panel } = await openDiagram(path, text, viewType);

    expect(fakeVsCode.executedCommands).toEqual([]);
    expect(await isClosed(panel)).toBe(false);
  });
});
