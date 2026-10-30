import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import { BOARD_VIEW_TYPE } from "../src/boardEditorOptions.js";
import { EMPTY_BOARD, EXAMPLE_BOARD } from "../src/examples.js";
import { Uri, vscodeMock, window, workspace } from "./__mocks__/vscode";
import { fakeDocument, newProvider, openBoard, resetApplyEdit } from "./fakes";

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

const target = Uri.parse("file:/boards/checkout.png");
const PNG_BASE64 = Buffer.from("png!").toString("base64");

describe("an export of the board editor, through the shell's save dialog", () => {
  it.each([
    ["png", "/boards/checkout.png", "PNG image", "Export as PNG"],
    ["svg", "/boards/checkout.svg", "SVG image", "Export as SVG"],
    [
      "png-transparent",
      "/boards/checkout-transparent@4x.png",
      "PNG image",
      "Export as PNG (4×, transparent)",
    ],
    ["json", "/boards/checkout.json", "JSON board", "Export as JSON"],
  ] as const)(
    "suggests the %s export beside the board, named as the web app names it",
    async (format, path, filter, title) => {
      const showSaveDialog = vi
        .spyOn(window, "showSaveDialog")
        .mockResolvedValue(Uri.parse(`file:${path}`));
      const writeFile = vi.spyOn(workspace.fs, "writeFile");
      const h = await openBoard(fakeDocument("/boards/checkout.storm", "title A\n"));
      const data = { json: '{"config":{}}', svg: "<svg/>" }[format as string] ?? PNG_BASE64;

      await h.receive({ type: "export", format, data });

      expect(showSaveDialog).toHaveBeenCalledWith({
        title,
        saveLabel: "Export",
        filters: { [filter]: [path.slice(path.lastIndexOf(".") + 1)] },
        defaultUri: expect.objectContaining({ path }),
      });
      expect(Buffer.from(writeFile.mock.calls[0]![1]).toString()).toBe(
        data === PNG_BASE64 ? "png!" : data,
      );
    },
  );

  it("suggests event-storming-board in the first workspace folder for a board that is no file", async () => {
    workspace.workspaceFolders = [{ uri: Uri.parse("file:/workspace") }];
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");
    const board = fakeDocument("/Untitled-1", "title A\n");
    board.uri = Uri.parse("untitled:Untitled-1");
    const h = await openBoard(board);

    await h.receive({ type: "export", format: "json", data: "{}" });

    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      defaultUri: { path: "/workspace/event-storming-board.json" },
    });
  });

  it("names the file with the action that reveals it", async () => {
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(target);
    const reveal = revealFileLabel(process.platform);
    const showInformationMessage = vi
      .spyOn(window, "showInformationMessage")
      .mockResolvedValue(reveal);
    const h = await openBoard(fakeDocument("/boards/checkout.storm", "title A\n"));

    await h.receive({ type: "export", format: "png", data: PNG_BASE64 });

    expect(showInformationMessage).toHaveBeenCalledWith("Exported checkout.png.", reveal);
    expect(vscodeMock.executedCommands()).toContainEqual(["revealFileInOS", target]);
  });

  it("saves a PNG in the system font and warns about it, with the same reveal action", async () => {
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(target);
    const writeFile = vi.spyOn(workspace.fs, "writeFile");
    const showWarningMessage = vi.spyOn(window, "showWarningMessage");
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openBoard(fakeDocument("/boards/checkout.storm", "title A\n"));

    await h.receive({ type: "export", format: "png", data: PNG_BASE64, fontFallback: true });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(showWarningMessage).toHaveBeenCalledWith(
      "Exported checkout.png in a system font. Geist couldn't be embedded.",
      revealFileLabel(process.platform),
    );
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it("shows the error a failed export in the webview reports", async () => {
    const showErrorMessage = vi.spyOn(window, "showErrorMessage");
    const h = await openBoard(fakeDocument("/boards/checkout.storm", "title A\n"));

    await h.receive({
      type: "error",
      message: "Couldn't export the board as PNG. Try again, or export it as SVG.",
    });

    expect(showErrorMessage).toHaveBeenCalledWith(
      "Couldn't export the board as PNG. Try again, or export it as SVG.",
    );
  });
});

describe("New Empty Board and New Board from Example", () => {
  function opened(): unknown[][] {
    return vscodeMock.executedCommands().filter(([command]) => command === "vscode.openWith");
  }

  it.each([
    ["eventStorming.newBoard", EMPTY_BOARD],
    ["eventStorming.newBoardFromExample", EXAMPLE_BOARD],
  ])(
    "%s saves a new board in the workspace folder and opens it in the board editor",
    async (command, text) => {
      newProvider();
      workspace.workspaceFolders = [{ uri: Uri.parse("file:/workspace") }];
      const board = Uri.parse("file:/workspace/checkout.storm");
      const showSaveDialog = vi.spyOn(window, "showSaveDialog").mockResolvedValue(board);
      const writeFile = vi.spyOn(workspace.fs, "writeFile");

      await vscodeMock.runCommand(command);

      expect(showSaveDialog).toHaveBeenCalledWith({
        title: "New Event Storming Board",
        saveLabel: "Create board",
        filters: { "Event Storming Board": ["storm"] },
        defaultUri: expect.objectContaining({ path: "/workspace/untitled.storm" }),
      });
      expect(
        writeFile.mock.calls.map(([uri, bytes]) => [uri, Buffer.from(bytes).toString()]),
      ).toEqual([[board, text]]);
      expect(opened()).toEqual([["vscode.openWith", board, BOARD_VIEW_TYPE]]);
    },
  );

  it("writes and opens nothing when the save dialog is dismissed", async () => {
    newProvider();
    const writeFile = vi.spyOn(workspace.fs, "writeFile");

    await vscodeMock.runCommand("eventStorming.newBoardFromExample");

    expect(writeFile).not.toHaveBeenCalled();
    expect(opened()).toEqual([]);
  });

  it("says which file it could not create, and opens nothing", async () => {
    newProvider();
    vi.spyOn(window, "showSaveDialog").mockResolvedValue(Uri.parse("file:/read-only/a.storm"));
    vi.spyOn(workspace.fs, "writeFile").mockRejectedValue(new Error("EACCES"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const showErrorMessage = vi.spyOn(window, "showErrorMessage");

    await vscodeMock.runCommand("eventStorming.newBoard");

    expect(showErrorMessage).toHaveBeenCalledWith(
      "Couldn't create a.storm. Try again, or choose another folder.",
    );
    expect(opened()).toEqual([]);
  });
});
