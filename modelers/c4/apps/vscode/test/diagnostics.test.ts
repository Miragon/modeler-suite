import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { parseCst, parseWorkspace } from "@miragon/c4-dsl";
import {
  C4Diagnostics,
  DIAGNOSTIC_COLLECTION_NAME,
  DIAGNOSTIC_SOURCE,
  documentDiagnostics,
  isStructurizrWorkspaceDocument,
  isStructurizrWorkspaceText,
} from "../src/diagnostics.js";
import { DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { activate } from "../src/extension.js";
import { FakeTextDocument, FakeUri, fakeVsCode } from "./fakeVsCode.js";

vi.mock("vscode", async () => (await import("./fakeVsCode.js")).vscodeModule);

const VALID = 'workspace {\n    model {\n        a = person "A"\n    }\n}\n';
const DUPLICATE =
  'workspace {\n    model {\n        a = person "A"\n        a = person "B"\n    }\n}\n';
const INCLUDE = "workspace {\n    !include other.dsl\n    model {\n    }\n}\n";
const WITH_DYNAMIC_VIEW =
  'workspace {\n    model {\n        a = person "A"\n        b = softwareSystem "B"\n        a -> b "Uses"\n    }\n    views {\n        dynamic * "Steps" {\n            a -> b "Uses"\n        }\n    }\n}\n';
const ACPI =
  '/* Intel ACPI Component Architecture */\nDefinitionBlock ("", "DSDT", 2, "", "", 0)\n{\n}\n';
/** A LikeC4 model: LikeC4's extension claims `.c4` as well. */
const LIKEC4 = "specification {\n  element actor\n}\nmodel {\n  customer = actor 'Customer'\n}\n";

function fakeDocument(path: string, text: string, scheme = "file"): FakeTextDocument {
  return new FakeTextDocument(new FakeUri(scheme, path), text);
}

function asTextDocument(fake: FakeTextDocument): vscode.TextDocument {
  return fake as unknown as vscode.TextDocument;
}

/** A text document as VS Code hands it to the extension. */
function document(path: string, text: string, scheme = "file"): vscode.TextDocument {
  return asTextDocument(fakeDocument(path, text, scheme));
}

function collection() {
  const found = fakeVsCode.diagnosticCollections.find(
    (candidate) => candidate.name === DIAGNOSTIC_COLLECTION_NAME,
  );
  if (!found) throw new Error("No c4 diagnostic collection.");
  return found;
}

function findings(fake: FakeTextDocument) {
  return collection().get(fake.uri) ?? [];
}

beforeEach(() => fakeVsCode.reset());
afterEach(() => vi.useRealTimers());

describe("which documents are Structurizr workspaces", () => {
  it.each([
    ["workspace {\n}\n"],
    ['Workspace "Shop" {\n}\n'],
    ["workspace extends base.dsl {\n}\n"],
    ["// Shop\n# notes\n\nworkspace {\n}\n"],
    ["/*\n * Shop\n */\nworkspace {\n}\n"],
    ["/* one line */\nworkspace {\n}\n"],
    ["!const NAME Shop\nworkspace ${NAME} {\n}\n"],
    ["\uFEFFworkspace {\n}\n"],
    // The reference parser reads a line that starts with /* and ends with */ as one comment.
    ["/*/\nworkspace {\n}\n"],
    ["/*\n/* nested\n*/\n*/\nworkspace {\n}\n"],
  ])("reads %j as one", (text) => {
    expect(isStructurizrWorkspaceText(text)).toBe(true);
  });

  it.each([
    [""],
    ["\n\n"],
    [ACPI],
    ["// only a comment\n"],
    ["workspaces {\n}\n"],
    // Block comments nest, and a // line inside one never closes it.
    [`/*\n/* nested\n*/\nworkspace {\n*/\n${ACPI}`],
    [`/*\n// end */\nworkspace {\n*/\n${ACPI}`],
  ])("leaves %j alone", (text) => {
    expect(isStructurizrWorkspaceText(text)).toBe(false);
  });

  it.each([
    ["/*/\nworkspace {\n}\n"],
    [`/*\n/* nested\n*/\nworkspace {\n*/\n${ACPI}`],
    [`/*\n// end */\nworkspace {\n*/\n${ACPI}`],
  ])("reads the comments of %j as the canvas's parser does", (text) => {
    const [first] = parseCst(text).nodes.filter((node) => node.kind === "statement");
    const keyword = first?.kind === "statement" ? first.tokens[0]?.value : undefined;
    expect(isStructurizrWorkspaceText(text)).toBe(keyword === "workspace");
  });

  it("needs a .c4 or .dsl file and leaves Git's copies alone", () => {
    expect(isStructurizrWorkspaceDocument(document("/shop/workspace.c4", VALID))).toBe(true);
    expect(isStructurizrWorkspaceDocument(document("/shop/SHOP.C4", VALID))).toBe(true);
    expect(isStructurizrWorkspaceDocument(document("/shop/workspace.dsl", VALID))).toBe(true);
    expect(isStructurizrWorkspaceDocument(document("/shop/SHOP.DSL", VALID))).toBe(true);
    expect(isStructurizrWorkspaceDocument(document("/shop/model.c4", LIKEC4))).toBe(false);
    expect(isStructurizrWorkspaceDocument(document("/shop/workspace.c4", VALID, "git"))).toBe(
      false,
    );
    expect(isStructurizrWorkspaceDocument(document("/shop/workspace.txt", VALID))).toBe(false);
    expect(isStructurizrWorkspaceDocument(document("/shop/workspace.dsl", VALID, "git"))).toBe(
      false,
    );
  });
});

describe("documentDiagnostics", () => {
  it.each([
    ["LF", DUPLICATE],
    ["CRLF", DUPLICATE.replace(/\n/g, "\r\n")],
  ])("puts a finding on its exact range with its code (%s)", (_name, text) => {
    const result = parseWorkspace(text);
    const [finding] = result.diagnostics;
    const [diagnostic] = documentDiagnostics(result, document("/a.dsl", text));

    expect(finding?.code).toBe("duplicate-identifier");
    expect(diagnostic).toMatchObject({
      message: finding?.message,
      severity: 0,
      source: DIAGNOSTIC_SOURCE,
      code: "c4.duplicate-identifier",
      range: {
        start: { line: finding!.line - 1, character: finding!.column - 1 },
        end: { line: finding!.endLine - 1, character: finding!.endColumn - 1 },
      },
    });
  });

  it("keeps the parser's severity: a file it does not read is a warning", () => {
    const result = parseWorkspace(INCLUDE);
    expect(documentDiagnostics(result, document("/a.dsl", INCLUDE))).toMatchObject([
      { severity: 1, code: "c4.include-not-read", range: { start: { line: 1, character: 4 } } },
    ]);
  });

  it("is 'C4 Modeler' as the source the Problems view names", () => {
    expect(DIAGNOSTIC_SOURCE).toBe("C4 Modeler");
  });
});

describe("C4Diagnostics, for every open Structurizr workspace", () => {
  it("checks the workspaces already open, and no other .dsl file", () => {
    const workspace = fakeDocument("/shop/workspace.dsl", DUPLICATE);
    const acpi = fakeDocument("/firmware/dsdt.dsl", ACPI);
    fakeVsCode.openTextDocument(workspace);
    fakeVsCode.openTextDocument(acpi);

    const diagnostics = new C4Diagnostics();

    expect(collection().name).toBe("c4");
    expect(findings(workspace).map((finding) => finding.code)).toEqual(["c4.duplicate-identifier"]);
    expect(collection().get(acpi.uri)).toBeUndefined();
    diagnostics.dispose();
  });

  it("checks a .c4 workspace whatever its language, and leaves a LikeC4 model to LikeC4", () => {
    vi.useFakeTimers();
    const diagnostics = new C4Diagnostics();
    const workspace = new FakeTextDocument(FakeUri.file("/shop/workspace.c4"), DUPLICATE, "likec4");
    const model = new FakeTextDocument(FakeUri.file("/shop/model.c4"), LIKEC4, "likec4");

    fakeVsCode.openTextDocument(workspace);
    fakeVsCode.openTextDocument(model);
    expect(findings(workspace).map((finding) => finding.code)).toEqual(["c4.duplicate-identifier"]);
    expect(collection().get(model.uri)).toBeUndefined();

    fakeVsCode.changeTextDocument(workspace, VALID);
    vi.advanceTimersByTime(250);
    expect(findings(workspace)).toHaveLength(0);
    diagnostics.dispose();
  });

  it("checks a document when it opens, waits for a pause in typing and clears it on close", () => {
    vi.useFakeTimers();
    const diagnostics = new C4Diagnostics();
    const workspace = fakeDocument("/shop/workspace.dsl", DUPLICATE);

    fakeVsCode.openTextDocument(workspace);
    expect(findings(workspace)).toHaveLength(1);

    fakeVsCode.changeTextDocument(workspace, VALID);
    expect(findings(workspace)).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(findings(workspace)).toHaveLength(0);

    fakeVsCode.changeTextDocument(workspace, DUPLICATE);
    vi.advanceTimersByTime(250);
    expect(findings(workspace)).toHaveLength(1);

    fakeVsCode.closeTextDocument(workspace);
    expect(collection().get(workspace.uri)).toBeUndefined();
    diagnostics.dispose();
  });

  it("waits for no pause in typing in a document it never checks", () => {
    vi.useFakeTimers();
    const diagnostics = new C4Diagnostics();
    const output = fakeDocument("extension-output-1", DUPLICATE, "output");
    const notes = fakeDocument("/shop/notes.txt", DUPLICATE);

    fakeVsCode.changeTextDocument(output, VALID);
    fakeVsCode.changeTextDocument(notes, VALID);

    expect(vi.getTimerCount()).toBe(0);
    diagnostics.dispose();
  });

  it("drops the findings of a document that is no workspace any longer", () => {
    vi.useFakeTimers();
    const diagnostics = new C4Diagnostics();
    const workspace = fakeDocument("/shop/workspace.dsl", DUPLICATE);
    fakeVsCode.openTextDocument(workspace);

    fakeVsCode.changeTextDocument(workspace, ACPI);
    vi.advanceTimersByTime(250);

    expect(collection().get(workspace.uri)).toBeUndefined();
    diagnostics.dispose();
  });

  it("checks what a C4 editor opened whatever it holds, and forgets it when the editor closes", () => {
    const diagnostics = new C4Diagnostics();
    const acpi = fakeDocument("/firmware/dsdt.dsl", ACPI);

    expect(diagnostics.refreshEditor(asTextDocument(acpi))).toEqual({ count: 1, errors: 1 });
    expect(diagnostics.refresh(asTextDocument(acpi))).toEqual({ count: 1, errors: 1 });
    diagnostics.releaseEditor(asTextDocument(acpi));

    expect(collection().get(acpi.uri)).toBeUndefined();
    diagnostics.dispose();
  });

  it("counts errors and warnings for the pill, while an info stays in the Problems view only", () => {
    const diagnostics = new C4Diagnostics();
    const workspace = fakeDocument("/shop/workspace.dsl", WITH_DYNAMIC_VIEW);

    expect(diagnostics.refreshEditor(asTextDocument(workspace))).toEqual({ count: 0, errors: 0 });
    expect(findings(workspace).map((finding) => finding.code)).toEqual([
      "c4.view-type-not-editable",
    ]);
    diagnostics.dispose();
  });

  it("keeps a workspace's findings after its C4 editor closed", () => {
    const diagnostics = new C4Diagnostics();
    const workspace = fakeDocument("/shop/workspace.dsl", INCLUDE);

    expect(diagnostics.refreshEditor(asTextDocument(workspace))).toEqual({ count: 1, errors: 0 });
    diagnostics.releaseEditor(asTextDocument(workspace));

    expect(findings(workspace)).toHaveLength(1);
    diagnostics.dispose();
  });

  it("reads the views of the last text without a rejection, as the canvas of an invalid file shows it", () => {
    const diagnostics = new C4Diagnostics();
    const workspace = fakeDocument("/shop/workspace.dsl", VALID);
    diagnostics.refreshEditor(asTextDocument(workspace));

    workspace.setText(DUPLICATE);
    diagnostics.refreshEditor(asTextDocument(workspace));

    expect(diagnostics.readable(asTextDocument(workspace))?.text).toBe(VALID);
    expect(diagnostics.readable(document("/never/valid.dsl", DUPLICATE))).toBeUndefined();
    diagnostics.dispose();
  });
});

describe("the C4 editor's problems pill", () => {
  const subscriptions: Array<{ dispose(): unknown }> = [];

  beforeEach(() => {
    activate({
      extensionUri: FakeUri.file("/extension"),
      subscriptions,
    } as unknown as vscode.ExtensionContext);
  });
  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) subscription.dispose();
  });

  it("counts the findings and the errors among them", async () => {
    const { panel } = await fakeVsCode.openCustomEditor(
      DIAGRAM_VIEW_TYPE,
      FakeUri.file("/shop/workspace.dsl"),
      DUPLICATE,
    );

    await panel.receive({ type: "ready" });

    expect(panel.posted).toContainEqual({ type: "problems", count: 1, errors: 1 });
  });

  it("lists the findings of a file opened in the C4 Modeler although it is no workspace", async () => {
    const uri = FakeUri.file("/firmware/dsdt.dsl");
    const { document: opened } = await fakeVsCode.openCustomEditor(DIAGRAM_VIEW_TYPE, uri, ACPI);

    expect(
      collection()
        .get(uri)
        ?.map((finding) => finding.code),
    ).toEqual(["c4.workspace-count"]);
    expect(opened.getText()).toBe(ACPI);
  });
});
