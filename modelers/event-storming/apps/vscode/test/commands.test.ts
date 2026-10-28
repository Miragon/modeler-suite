import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Uri, ViewColumn, vscodeMock, window } from "./__mocks__/vscode";
import {
  NO_BOARD_MESSAGE,
  OPEN_BOARD_COMMAND,
  OPEN_SOURCE_COMMAND,
  WEBVIEW_COMMANDS,
} from "../src/commands.js";
import { fakeDocument, newProvider, openBoard, resetApplyEdit } from "./fakes";

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

describe("board commands", () => {
  it("registers fit and export with the provider", () => {
    newProvider();

    expect(vscodeMock.registeredCommandIds()).toEqual(
      expect.arrayContaining([
        "eventStorming.fitView",
        "eventStorming.exportPng",
        "eventStorming.exportSvg",
        "eventStorming.exportPngTransparent",
        "eventStorming.exportJson",
      ]),
    );
  });

  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "posts %s to the focused board",
    async (name, command) => {
      const h = await openBoard(fakeDocument("/a.storm", "title A\n"));

      vscodeMock.runCommand(command);

      expect(h.messagesOfType("command")).toEqual([{ type: "command", name }]);
    },
  );

  it("routes to the board that became active, not to the others", async () => {
    const provider = newProvider();
    const first = await openBoard(fakeDocument("/a.storm", "title A\n"), {}, provider);
    const second = await openBoard(fakeDocument("/b.storm", "title B\n"), {}, provider);
    first.setViewState({ active: false });
    second.setViewState({ active: false });
    first.setViewState({ active: true });

    vscodeMock.runCommand("eventStorming.fitView");

    expect(first.messagesOfType("command")).toEqual([{ type: "command", name: "fitView" }]);
    expect(second.messagesOfType("command")).toEqual([]);
  });

  it("tells the user when no board is focused instead of using the one focused last", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openBoard(fakeDocument("/a.storm", "title A\n"));
    h.setViewState({ active: false });

    vscodeMock.runCommand("eventStorming.exportPng");

    expect(h.messagesOfType("command")).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_BOARD_MESSAGE);
  });

  it("forgets a closed board", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openBoard(fakeDocument("/a.storm", "title A\n"));
    h.dispose();

    vscodeMock.runCommand("eventStorming.exportSvg");

    expect(h.messagesOfType("command")).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_BOARD_MESSAGE);
  });
});

describe("text and board side by side", () => {
  it("opens the focused board as text beside it", async () => {
    const document = fakeDocument("/a.storm", "title A\n");
    await openBoard(document);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("opens the resource of an editor title button", async () => {
    newProvider();
    const uri = Uri.file("/b.storm");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND, uri);
    await vscodeMock.runCommand(OPEN_BOARD_COMMAND, uri);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, "default", ViewColumn.Beside],
      ["vscode.openWith", uri, "eventStorming.boardEditor", ViewColumn.Beside],
    ]);
  });

  it("opens the focused text editor as a board beside it", async () => {
    newProvider();
    const uri = Uri.file("/c.storm");
    window.activeTextEditor = { document: { uri } };

    await vscodeMock.runCommand(OPEN_BOARD_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, "eventStorming.boardEditor", ViewColumn.Beside],
    ]);
  });

  it("tells the user when no board is open", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    newProvider();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_BOARD_MESSAGE);
  });

  it("opens the board focused last once a walkthrough link has taken the focus", async () => {
    const document = fakeDocument("/a.storm", "title A\n");
    const h = await openBoard(document);
    h.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("follows the order the boards were focused in", async () => {
    const provider = newProvider();
    const first = fakeDocument("/a.storm", "title A\n");
    const a = await openBoard(first, {}, provider);
    a.setViewState({ active: false });
    const b = await openBoard(fakeDocument("/b.storm", "title B\n"), {}, provider);
    b.setViewState({ active: false });
    a.setViewState({ active: true });
    a.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", first.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("opens the board that took the focus when it opened, not an earlier one", async () => {
    const provider = newProvider();
    const a = await openBoard(fakeDocument("/a.storm", "title A\n"), {}, provider);
    const second = fakeDocument("/b.storm", "title B\n");
    const b = await openBoard(second, {}, provider);
    a.setViewState({ active: false });
    b.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", second.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("puts a board opened in the background behind the ones focused before", async () => {
    const provider = newProvider();
    const focused = fakeDocument("/a.storm", "title A\n");
    const a = await openBoard(focused, {}, provider);
    await openBoard(fakeDocument("/b.storm", "title B\n"), { active: false }, provider);
    a.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", focused.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("forgets a closed board and asks for one once none is open", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const provider = newProvider();
    const first = fakeDocument("/a.storm", "title A\n");
    const a = await openBoard(first, {}, provider);
    a.setViewState({ active: false });
    const b = await openBoard(fakeDocument("/b.storm", "title B\n"), {}, provider);
    b.dispose();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    a.dispose();
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", first.uri, "default", ViewColumn.Beside],
    ]);
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_BOARD_MESSAGE);
  });
});
