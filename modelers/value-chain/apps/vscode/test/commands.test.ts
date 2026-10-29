import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabInputCustom, Uri, ViewColumn, vscodeMock, window } from "./__mocks__/vscode";
import {
  NO_DIAGRAM_MESSAGE,
  OPEN_DIAGRAM_COMMAND,
  OPEN_SOURCE_COMMAND,
  WEBVIEW_COMMANDS,
} from "../src/commands.js";
import { fakeDocument, newProvider, openDiagram, resetApplyEdit } from "./fakes";

import { EMPTY_DOCUMENT } from "../src/examples.js";

const DOC_A = EMPTY_DOCUMENT.replace("New value chain", "A");
const DOC_B = EMPTY_DOCUMENT.replace("New value chain", "B");

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

describe("diagram commands", () => {
  it("registers fit and export with the provider", () => {
    newProvider();

    expect(vscodeMock.registeredCommandIds()).toEqual(
      expect.arrayContaining([
        "valueChain.fitView",
        "valueChain.exportPng",
        "valueChain.exportSvg",
      ]),
    );
  });

  it.each(Object.entries(WEBVIEW_COMMANDS))(
    "posts %s to the focused diagram",
    async (name, command) => {
      const h = await openDiagram(fakeDocument("/a.vc.json", DOC_A));

      vscodeMock.runCommand(command);

      expect(h.messagesOfType("command")).toEqual([{ type: "command", name }]);
    },
  );

  it("routes to the diagram that became active, not to the others", async () => {
    const provider = newProvider();
    const first = await openDiagram(fakeDocument("/a.vc.json", DOC_A), {}, provider);
    const second = await openDiagram(fakeDocument("/b.vc.json", DOC_B), {}, provider);
    first.setViewState({ active: false });
    second.setViewState({ active: false });
    first.setViewState({ active: true });

    vscodeMock.runCommand("valueChain.fitView");

    expect(first.messagesOfType("command")).toEqual([{ type: "command", name: "fitView" }]);
    expect(second.messagesOfType("command")).toEqual([]);
  });

  it("tells the user when no diagram is focused instead of using the one focused last", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openDiagram(fakeDocument("/a.vc.json", DOC_A));
    h.setViewState({ active: false });

    vscodeMock.runCommand("valueChain.exportPng");

    expect(h.messagesOfType("command")).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_DIAGRAM_MESSAGE);
  });

  it("forgets a closed diagram", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const h = await openDiagram(fakeDocument("/a.vc.json", DOC_A));
    h.dispose();

    vscodeMock.runCommand("valueChain.exportSvg");

    expect(h.messagesOfType("command")).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_DIAGRAM_MESSAGE);
  });
});

describe("text and diagram side by side", () => {
  it("opens the focused diagram as text beside it", async () => {
    const document = fakeDocument("/a.vc.json", DOC_A);
    await openDiagram(document);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("opens the resource of an editor title button", async () => {
    newProvider();
    const uri = Uri.file("/b.vc.json");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND, uri);
    await vscodeMock.runCommand(OPEN_DIAGRAM_COMMAND, uri);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, "default", ViewColumn.Beside],
      ["vscode.openWith", uri, "valueChain.diagramEditor", ViewColumn.Beside],
    ]);
  });

  it("opens the focused text editor as a diagram beside it", async () => {
    newProvider();
    const uri = Uri.file("/c.vc.json");
    window.activeTextEditor = { document: { uri } };

    await vscodeMock.runCommand(OPEN_DIAGRAM_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, "valueChain.diagramEditor", ViewColumn.Beside],
    ]);
  });

  it("tells the user when no diagram is open", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    newProvider();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_DIAGRAM_MESSAGE);
  });

  it("opens the diagram focused last once a walkthrough link has taken the focus", async () => {
    const document = fakeDocument("/a.vc.json", DOC_A);
    const h = await openDiagram(document);
    h.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("follows the order the diagrams were focused in", async () => {
    const provider = newProvider();
    const first = fakeDocument("/a.vc.json", DOC_A);
    const a = await openDiagram(first, {}, provider);
    a.setViewState({ active: false });
    const b = await openDiagram(fakeDocument("/b.vc.json", DOC_B), {}, provider);
    b.setViewState({ active: false });
    a.setViewState({ active: true });
    a.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", first.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("opens the diagram that took the focus when it opened, not an earlier one", async () => {
    const provider = newProvider();
    const a = await openDiagram(fakeDocument("/a.vc.json", DOC_A), {}, provider);
    const second = fakeDocument("/b.vc.json", DOC_B);
    const b = await openDiagram(second, {}, provider);
    a.setViewState({ active: false });
    b.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", second.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("puts a diagram opened in the background behind the ones focused before", async () => {
    const provider = newProvider();
    const focused = fakeDocument("/a.vc.json", DOC_A);
    const a = await openDiagram(focused, {}, provider);
    await openDiagram(fakeDocument("/b.vc.json", DOC_B), { active: false }, provider);
    a.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", focused.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("forgets a closed diagram and asks for one once none is open", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    const provider = newProvider();
    const first = fakeDocument("/a.vc.json", DOC_A);
    const a = await openDiagram(first, {}, provider);
    a.setViewState({ active: false });
    const b = await openDiagram(fakeDocument("/b.vc.json", DOC_B), {}, provider);
    b.dispose();

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    a.dispose();
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", first.uri, "default", ViewColumn.Beside],
    ]);
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_DIAGRAM_MESSAGE);
  });
});

describe("Open Source to the Side beside the diagram", () => {
  it("shows the diagram focused last and focuses it, so its group is the one the source opens beside", async () => {
    const document = fakeDocument("/a.vc.json", DOC_A);
    const h = await openDiagram(document);
    h.setViewState({ active: false });

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(h.revealed).toEqual([[undefined, false]]);
    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("leaves a focused diagram where it is", async () => {
    const document = fakeDocument("/a.vc.json", DOC_A);
    const h = await openDiagram(document);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(h.revealed).toEqual([]);
    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });

  it("opens the resource of an editor title button without showing another diagram", async () => {
    const h = await openDiagram(fakeDocument("/a.vc.json", DOC_A));
    h.setViewState({ active: false });
    const uri = Uri.file("/b.vc.json");

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND, uri);

    expect(h.revealed).toEqual([]);
    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, "default", ViewColumn.Beside],
    ]);
  });
});

describe("Open Source to the Side after a reload", () => {
  const viewType = "valueChain.diagramEditor";
  const walkthrough = undefined;

  it("shows a diagram tab VS Code restored but has not resolved, then opens its source beside it", async () => {
    newProvider();
    const uri = Uri.file("/a.vc.json");
    vscodeMock.setTabGroups([
      { inputs: [walkthrough, new TabInputCustom(uri, viewType)], activeTab: 0 },
    ]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", uri, viewType, 1],
      ["vscode.openWith", uri, "default", ViewColumn.Beside],
    ]);
  });

  it("prefers a tab of the active group, then the tab a group shows, then any other", async () => {
    newProvider();
    const hidden = Uri.file("/hidden.vc.json");
    const shown = Uri.file("/shown.vc.json");
    const besideWalkthrough = Uri.file("/beside-walkthrough.vc.json");
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [new TabInputCustom(shown, viewType)], activeTab: 0 },
      {
        inputs: [walkthrough, new TabInputCustom(besideWalkthrough, viewType)],
        activeTab: 0,
        active: true,
      },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [new TabInputCustom(shown, viewType)], activeTab: 0 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", besideWalkthrough, viewType, 3],
      ["vscode.openWith", besideWalkthrough, "default", ViewColumn.Beside],
      ["vscode.openWith", shown, viewType, 2],
      ["vscode.openWith", shown, "default", ViewColumn.Beside],
      ["vscode.openWith", hidden, viewType, 1],
      ["vscode.openWith", hidden, "default", ViewColumn.Beside],
    ]);
  });

  it("passes over the tabs of other editors", async () => {
    const showInformationMessage = vi.spyOn(window, "showInformationMessage");
    newProvider();
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(Uri.file("/a.png"), "imagePreview.previewEditor")] },
    ]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([]);
    expect(showInformationMessage).toHaveBeenCalledWith(NO_DIAGRAM_MESSAGE);
  });

  it("takes an open diagram over a restored tab", async () => {
    const document = fakeDocument("/a.vc.json", DOC_A);
    const h = await openDiagram(document);
    h.setViewState({ active: false });
    vscodeMock.setTabGroups([{ inputs: [new TabInputCustom(Uri.file("/b.vc.json"), viewType)] }]);

    await vscodeMock.runCommand(OPEN_SOURCE_COMMAND);

    expect(vscodeMock.executedCommands()).toEqual([
      ["vscode.openWith", document.uri, "default", ViewColumn.Beside],
    ]);
  });
});
