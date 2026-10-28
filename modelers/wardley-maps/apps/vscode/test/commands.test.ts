import { beforeEach, describe, expect, it } from "vitest";
import { ViewColumn, commands, vscodeMock } from "./__mocks__/vscode";
import {
  NO_DIAGRAM_MESSAGE,
  SHOW_SOURCE_COMMAND,
  registerEditorCommands,
} from "../src/commands.js";
import { WEBVIEW_COMMANDS } from "../src/protocol.js";
import { WardleyEditorProvider } from "../src/WardleyEditorProvider.js";
import {
  asTextDocument,
  fakeContext,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  type FakeDoc,
  type FakePanel,
} from "./fakes.js";

function newProvider(): WardleyEditorProvider {
  const { provider } = WardleyEditorProvider.register(fakeContext);
  registerEditorCommands(provider);
  return provider;
}

async function openMap(
  provider: WardleyEditorProvider,
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
