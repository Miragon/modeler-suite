import type * as vscode from "vscode";
import { beforeEach, describe, expect, it } from "vitest";
import { TabInputCustom, Uri, ViewColumn, commands, vscodeMock } from "./__mocks__/vscode";
import {
  NO_DIAGRAM_MESSAGE,
  SHOW_SOURCE_COMMAND,
  registerEditorCommands,
} from "../src/commands.js";
import { MAP_VIEW_TYPE } from "../src/mapEditor.js";
import { WEBVIEW_COMMANDS } from "../src/protocol.js";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
  type FakeDoc,
  type FakePanel,
} from "./fakes.js";

function newProvider(): vscode.CustomTextEditorProvider {
  const { editors, provider } = registerMapEditorForTest();
  registerEditorCommands(editors);
  return provider;
}

async function openMap(
  provider: vscode.CustomTextEditorProvider,
  doc: FakeDoc,
  { active = true }: { active?: boolean } = {},
): Promise<FakePanel> {
  const h = fakeWebviewPanel({ active });
  await provider.resolveCustomTextEditor(asTextDocument(doc), h.panel, fakeToken);
  return h;
}

function openedBeside(): unknown[][] {
  return vscodeMock
    .executedCommands()
    .filter(({ command }) => command === "vscode.openWith")
    .map(({ args }) => args);
}

function commandsPosted(h: FakePanel): unknown[] {
  return h.posted.filter((message) => message.type === "command");
}

beforeEach(() => vscodeMock.reset());

describe("Open Source to the Side without a resource", () => {
  it("opens the map focused last once a walkthrough link has taken the focus", async () => {
    const provider = newProvider();
    const doc = fakeDocument("/a.wmap", "title A\n");
    const h = await openMap(provider, doc);
    h.setActive(false);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[doc.uri, "default", ViewColumn.Beside]]);
    expect(vscodeMock.informationMessages()).toEqual([]);
  });

  it("follows the order the maps were focused in", async () => {
    const provider = newProvider();
    const first = fakeDocument("/a.wmap", "title A\n");
    const second = fakeDocument("/b.wmap", "title B\n");
    const a = await openMap(provider, first);
    a.setActive(false);
    const b = await openMap(provider, second);
    b.setActive(false);
    a.setActive(true);
    a.setActive(false);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[first.uri, "default", ViewColumn.Beside]]);
  });

  it("opens the map that took the focus when it opened, not an earlier one", async () => {
    const provider = newProvider();
    const a = await openMap(provider, fakeDocument("/a.wmap", "title A\n"));
    const second = fakeDocument("/b.wmap", "title B\n");
    const b = await openMap(provider, second);
    a.setActive(false);
    b.setActive(false);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[second.uri, "default", ViewColumn.Beside]]);
  });

  it("puts a map opened in the background behind the ones focused before", async () => {
    const provider = newProvider();
    const focused = fakeDocument("/a.wmap", "title A\n");
    const a = await openMap(provider, focused);
    await openMap(provider, fakeDocument("/b.wmap", "title B\n"), { active: false });
    a.setActive(false);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[focused.uri, "default", ViewColumn.Beside]]);
  });

  it("forgets a closed map and asks for one once none is open", async () => {
    const provider = newProvider();
    const first = fakeDocument("/a.wmap", "title A\n");
    const a = await openMap(provider, first);
    a.setActive(false);
    const b = await openMap(provider, fakeDocument("/b.wmap", "title B\n"));
    b.dispose();

    await commands.executeCommand(SHOW_SOURCE_COMMAND);
    a.dispose();
    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[first.uri, "default", ViewColumn.Beside]]);
    expect(vscodeMock.informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});

describe("Open Source to the Side beside the map", () => {
  it("shows the map focused last and focuses it, so its group is the one the source opens beside", async () => {
    const provider = newProvider();
    const doc = fakeDocument("/a.wmap", "title A\n");
    const h = await openMap(provider, doc);
    h.setActive(false);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(h.revealed).toEqual([[undefined, false]]);
    expect(openedBeside()).toEqual([[doc.uri, "default", ViewColumn.Beside]]);
  });

  it("leaves a focused map where it is", async () => {
    const doc = fakeDocument("/a.wmap", "title A\n");
    const h = await openMap(newProvider(), doc);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(h.revealed).toEqual([]);
    expect(openedBeside()).toEqual([[doc.uri, "default", ViewColumn.Beside]]);
  });

  it("opens the resource of an editor title button without showing another map", async () => {
    const provider = newProvider();
    const h = await openMap(provider, fakeDocument("/a.wmap", "title A\n"));
    h.setActive(false);
    const uri = Uri.file("/b.wmap");

    await commands.executeCommand(SHOW_SOURCE_COMMAND, uri);

    expect(h.revealed).toEqual([]);
    expect(openedBeside()).toEqual([[uri, "default", ViewColumn.Beside]]);
  });
});

describe("Open Source to the Side after a reload", () => {
  const viewType = MAP_VIEW_TYPE;
  const walkthrough = undefined;

  it("shows a map tab VS Code restored but has not resolved, then opens its source beside it", async () => {
    newProvider();
    const uri = Uri.file("/a.wmap");
    vscodeMock.setTabGroups([
      { inputs: [walkthrough, new TabInputCustom(uri, viewType)], activeTab: 0 },
    ]);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      [uri, viewType, 1],
      [uri, "default", ViewColumn.Beside],
    ]);
    expect(vscodeMock.informationMessages()).toEqual([]);
  });

  it("prefers a tab of the active group, then the tab a group shows, then any other", async () => {
    newProvider();
    const hidden = Uri.file("/hidden.wmap");
    const shown = Uri.file("/shown.wmap");
    const besideWalkthrough = Uri.file("/beside-walkthrough.wmap");
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [new TabInputCustom(shown, viewType)], activeTab: 0 },
      {
        inputs: [walkthrough, new TabInputCustom(besideWalkthrough, viewType)],
        activeTab: 0,
        active: true,
      },
    ]);
    await commands.executeCommand(SHOW_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [new TabInputCustom(shown, viewType)], activeTab: 0 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await commands.executeCommand(SHOW_SOURCE_COMMAND);
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(hidden, viewType), walkthrough], activeTab: 1 },
      { inputs: [walkthrough], activeTab: 0, active: true },
    ]);
    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([
      [besideWalkthrough, viewType, 3],
      [besideWalkthrough, "default", ViewColumn.Beside],
      [shown, viewType, 2],
      [shown, "default", ViewColumn.Beside],
      [hidden, viewType, 1],
      [hidden, "default", ViewColumn.Beside],
    ]);
  });

  it("passes over the tabs of other editors", async () => {
    newProvider();
    vscodeMock.setTabGroups([
      { inputs: [new TabInputCustom(Uri.file("/a.png"), "imagePreview.previewEditor")] },
    ]);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([]);
    expect(vscodeMock.informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });

  it("takes an open map over a restored tab", async () => {
    const provider = newProvider();
    const doc = fakeDocument("/a.wmap", "title A\n");
    (await openMap(provider, doc)).setActive(false);
    vscodeMock.setTabGroups([{ inputs: [new TabInputCustom(Uri.file("/b.wmap"), viewType)] }]);

    await commands.executeCommand(SHOW_SOURCE_COMMAND);

    expect(openedBeside()).toEqual([[doc.uri, "default", ViewColumn.Beside]]);
  });
});

describe("fit and export from the Command Palette", () => {
  it.each(Object.entries(WEBVIEW_COMMANDS))("posts %s to the focused map", async (name, id) => {
    const h = await openMap(newProvider(), fakeDocument("/a.wmap", "title A\n"));

    await commands.executeCommand(id);

    expect(commandsPosted(h)).toEqual([{ type: "command", name }]);
  });

  it("needs the focused map, not the one focused last", async () => {
    const h = await openMap(newProvider(), fakeDocument("/a.wmap", "title A\n"));
    h.setActive(false);

    await commands.executeCommand(WEBVIEW_COMMANDS.fitView);

    expect(commandsPosted(h)).toEqual([]);
    expect(vscodeMock.informationMessages()).toEqual([NO_DIAGRAM_MESSAGE]);
  });
});
