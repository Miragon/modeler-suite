import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import { DIAGRAM_VIEW_TYPE } from "../src/diagramEditorOptions.js";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "../src/examples.js";
import { activate } from "../src/extension.js";
import { Uri, vscodeMock, window, workspace } from "./__mocks__/vscode";
import { fakeDocument, openDiagram, resetApplyEdit } from "./fakes";

const DOC_A = EMPTY_DOCUMENT.replace("New value chain", "A");
const PNG_BASE64 = Buffer.from("png!").toString("base64");

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

describe("an export of the diagram editor, through the shell's save dialog", () => {
  it.each([
    ["png", "/chains/checkout.vc.json", "Export as PNG", "PNG image", "/chains/checkout.png"],
    ["svg", "/chains/checkout.vc", "Export as SVG", "SVG image", "/chains/checkout.svg"],
  ] as const)(
    "suggests the %s of %s beside it, without the double extension",
    async (format, source, title, filter, suggested) => {
      const showSaveDialog = vi.spyOn(window, "showSaveDialog");
      const h = await openDiagram(fakeDocument(source, DOC_A));

      await h.receive({ type: "export", format, data: PNG_BASE64 });

      expect(showSaveDialog).toHaveBeenCalledWith({
        title,
        saveLabel: "Export",
        filters: { [filter]: [format] },
        defaultUri: expect.objectContaining({ path: suggested }),
      });
    },
  );

  it("suggests value-chain in the first workspace folder for a diagram that is no file", async () => {
    workspace.workspaceFolders = [{ uri: Uri.parse("file:/workspace") }];
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");
    const diagram = fakeDocument("/Untitled-1", DOC_A);
    diagram.uri = Uri.parse("untitled:Untitled-1");
    const h = await openDiagram(diagram);

    await h.receive({ type: "export", format: "svg", data: "<svg/>" });

    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      defaultUri: { path: "/workspace/value-chain.svg" },
    });
  });

  it("writes the PNG's bytes and names the file with the action that reveals it", async () => {
    const target = Uri.parse("file:/chains/checkout.png");
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(target);
    const writeFile = vi.spyOn(workspace.fs, "writeFile");
    const reveal = revealFileLabel(process.platform);
    const showInformationMessage = vi
      .spyOn(window, "showInformationMessage")
      .mockResolvedValue(reveal);
    const h = await openDiagram(fakeDocument("/chains/checkout.vc.json", DOC_A));

    await h.receive({ type: "export", format: "png", data: PNG_BASE64 });

    expect(Buffer.from(writeFile.mock.calls[0]![1]).toString()).toBe("png!");
    expect(showInformationMessage).toHaveBeenCalledWith("Exported checkout.png.", reveal);
    expect(vscodeMock.executedCommands()).toContainEqual(["revealFileInOS", target]);
  });

  it("warns instead of confirming when the PNG's labels fell back to the system font", async () => {
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(Uri.parse("file:/chains/checkout.png"));
    const showWarningMessage = vi.spyOn(window, "showWarningMessage");
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openDiagram(fakeDocument("/chains/checkout.vc.json", DOC_A));

    await h.receive({ type: "export", format: "png", data: PNG_BASE64, fontFallback: true });

    expect(showWarningMessage).toHaveBeenCalledWith(
      "Exported checkout.png in a system font. Geist couldn't be embedded.",
      revealFileLabel(process.platform),
    );
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it("shows the error a failed export in the webview reports", async () => {
    const showErrorMessage = vi.spyOn(window, "showErrorMessage");
    const h = await openDiagram(fakeDocument("/chains/checkout.vc.json", DOC_A));

    await h.receive({
      type: "error",
      message: "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
    });

    expect(showErrorMessage).toHaveBeenCalledWith(
      "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
    );
  });
});

describe("New Empty Value Chain Diagram and New Value Chain Diagram from Example", () => {
  beforeEach(() => {
    activate({
      extensionUri: Uri.parse("file:/ext"),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);
    workspace.workspaceFolders = [{ uri: Uri.parse("file:/workspace") }];
  });

  function writes(writeFile: { mock: { calls: Array<[Uri, Uint8Array]> } }): unknown[][] {
    return writeFile.mock.calls.map(([uri, bytes]) => [uri.path, Buffer.from(bytes).toString()]);
  }

  function opened(): unknown[][] {
    return vscodeMock.executedCommands().filter(([command]) => command === "vscode.openWith");
  }

  it.each([
    ["valueChain.newDiagram", EMPTY_DOCUMENT],
    ["valueChain.newDiagramFromExample", EXAMPLE_DOCUMENT],
  ])(
    "%s saves a new diagram in the workspace folder and opens it in the diagram editor",
    async (command, text) => {
      const target = Uri.parse("file:/workspace/chain.vc.json");
      const showSaveDialog = vi.spyOn(window, "showSaveDialog").mockResolvedValue(target);
      const writeFile = vi.spyOn(workspace.fs, "writeFile");

      await vscodeMock.runCommand(command);

      expect(showSaveDialog).toHaveBeenCalledWith({
        title: "New Value Chain Diagram",
        saveLabel: "Create diagram",
        filters: { "Value Chain Diagram": ["vc.json", "vc"] },
        defaultUri: expect.objectContaining({ path: "/workspace/value-chain.vc.json" }),
      });
      expect(writes(writeFile)).toEqual([["/workspace/chain.vc.json", text]]);
      expect(opened()).toEqual([["vscode.openWith", target, DIAGRAM_VIEW_TYPE]]);
    },
  );

  it.each([
    ["/workspace/chain.json", "/workspace/chain.vc.json"],
    ["/workspace/chain", "/workspace/chain.vc.json"],
    ["/workspace/chain.vc", "/workspace/chain.vc"],
  ])("writes %s as %s, a name the diagram editor claims", async (chosen, path) => {
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(Uri.parse(`file:${chosen}`));
    const writeFile = vi.spyOn(workspace.fs, "writeFile");

    await vscodeMock.runCommand("valueChain.newDiagram");

    expect(writes(writeFile)).toEqual([[path, EMPTY_DOCUMENT]]);
    expect(opened()).toEqual([
      ["vscode.openWith", expect.objectContaining({ path }), DIAGRAM_VIEW_TYPE],
    ]);
  });

  it("writes and opens nothing when the save dialog is dismissed", async () => {
    const writeFile = vi.spyOn(workspace.fs, "writeFile");

    await vscodeMock.runCommand("valueChain.newDiagramFromExample");

    expect(writeFile).not.toHaveBeenCalled();
    expect(opened()).toEqual([]);
  });

  it("asks before it replaces a diagram already at the corrected name, and keeps it unless told", async () => {
    vscodeMock.addFile(Uri.parse("file:/workspace/chain.vc.json"));
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(Uri.parse("file:/workspace/chain.json"));
    const showWarningMessage = vi.spyOn(window, "showWarningMessage");
    const writeFile = vi.spyOn(workspace.fs, "writeFile");

    await vscodeMock.runCommand("valueChain.newDiagramFromExample");

    expect(showWarningMessage).toHaveBeenCalledWith(
      "chain.vc.json already exists. Do you want to replace it?",
      { modal: true },
      "Replace",
    );
    expect(writeFile).not.toHaveBeenCalled();
    expect(opened()).toEqual([]);
  });

  it("replaces the diagram at the corrected name once the question is answered with Replace", async () => {
    vscodeMock.addFile(Uri.parse("file:/workspace/chain.vc.json"));
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(Uri.parse("file:/workspace/chain.json"));
    vi.spyOn(window, "showWarningMessage").mockResolvedValue("Replace");
    const writeFile = vi.spyOn(workspace.fs, "writeFile");

    await vscodeMock.runCommand("valueChain.newDiagramFromExample");

    expect(writes(writeFile)).toEqual([["/workspace/chain.vc.json", EXAMPLE_DOCUMENT]]);
    expect(opened()).toHaveLength(1);
  });

  it("does not ask about the file the save dialog itself confirmed", async () => {
    const target = Uri.parse("file:/workspace/chain.vc.json");
    vscodeMock.addFile(target);
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(target);
    const showWarningMessage = vi.spyOn(window, "showWarningMessage");

    await vscodeMock.runCommand("valueChain.newDiagram");

    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(opened()).toHaveLength(1);
  });
});
