import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import { EMPTY_MAP, EXAMPLE_MAP } from "../src/examples.js";
import { activate } from "../src/extension.js";
import { MAP_VIEW_TYPE } from "../src/mapEditor.js";
import { Uri, commands, vscodeMock, window, workspace } from "./__mocks__/vscode";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
} from "./fakes.js";

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47];
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString("base64");

beforeEach(() => vscodeMock.reset());
afterEach(() => vi.restoreAllMocks());

async function openMap(uri: Uri) {
  const { provider } = registerMapEditorForTest();
  const document = fakeDocument(uri.path, "title Tea\n");
  document.uri = uri;
  const panel = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(asTextDocument(document), panel.panel, fakeToken);
  return panel;
}

function written(): Array<[path: string, text: string]> {
  return vscodeMock
    .writtenFiles()
    .map(({ uri, content }) => [uri.path, new TextDecoder().decode(content)]);
}

describe("an export of the map editor, through the shell's save dialog", () => {
  it.each([
    ["png", "Export as PNG", "PNG image", "/maps/strategy.png"],
    ["svg", "Export as SVG", "SVG image", "/maps/strategy.svg"],
    [
      "png-transparent",
      "Export as PNG (4×, transparent)",
      "PNG image",
      "/maps/strategy-transparent@4x.png",
    ],
  ] as const)(
    "suggests the %s export beside the map, named as the web app names it",
    async (format, title, filter, path) => {
      const showSaveDialog = vi.spyOn(window, "showSaveDialog");
      const panel = await openMap(Uri.file("/maps/strategy.wmap"));

      await panel.receive({ type: "export", format, data: PNG_BASE64 });

      expect(showSaveDialog).toHaveBeenCalledWith({
        title,
        saveLabel: "Export",
        filters: { [filter]: [path.slice(path.lastIndexOf(".") + 1)] },
        defaultUri: expect.objectContaining({ path }),
      });
    },
  );

  it("suggests wardley-map in the first workspace folder for a map that is no file on disk", async () => {
    workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }];
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");
    const panel = await openMap(Uri.parse("untitled:Untitled-1"));

    await panel.receive({ type: "export", format: "png", data: PNG_BASE64 });

    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      defaultUri: { path: "/workspace/wardley-map.png" },
    });
  });

  it("writes the PNG's bytes and names the file with the action that reveals it", async () => {
    const target = Uri.file("/maps/strategy.png");
    vscodeMock.chooseSaveTarget(target);
    const reveal = revealFileLabel(process.platform);
    const showInformationMessage = vi
      .spyOn(window, "showInformationMessage")
      .mockResolvedValue(reveal as never);
    const panel = await openMap(Uri.file("/maps/strategy.wmap"));

    await panel.receive({ type: "export", format: "png", data: PNG_BASE64 });

    expect(vscodeMock.writtenFiles().map((file) => [...file.content])).toEqual([PNG_BYTES]);
    expect(showInformationMessage).toHaveBeenCalledWith("Exported strategy.png.", reveal);
    expect(vscodeMock.executedCommands()).toContainEqual({
      command: "revealFileInOS",
      args: [target],
    });
  });

  it("warns once the PNG is saved when its labels fell back to the system font", async () => {
    vscodeMock.chooseSaveTarget(Uri.file("/maps/strategy.png"));
    const panel = await openMap(Uri.file("/maps/strategy.wmap"));

    await panel.receive({ type: "export", format: "png", data: PNG_BASE64, fontFallback: true });

    expect(vscodeMock.writtenFiles()).toHaveLength(1);
    expect(vscodeMock.warningMessages()).toEqual([
      "Exported strategy.png in a system font. Geist couldn't be embedded.",
    ]);
    expect(vscodeMock.informationMessages()).toEqual([]);
  });
});

describe("New Empty Map and New Map from Example", () => {
  function activateExtension(): void {
    activate({
      extensionUri: Uri.file("/extension"),
      subscriptions: [],
    } as unknown as vscode.ExtensionContext);
  }

  it.each([
    ["wardley.newMap", EMPTY_MAP],
    ["wardley.newMapFromExample", EXAMPLE_MAP],
  ])(
    "%s saves a new map in the workspace folder and opens it in the map editor",
    async (command, text) => {
      activateExtension();
      workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }];
      const target = Uri.file("/workspace/tea.wmap");
      vscodeMock.chooseSaveTarget(target);
      const showSaveDialog = vi.spyOn(window, "showSaveDialog");

      await commands.executeCommand(command);

      expect(showSaveDialog).toHaveBeenCalledWith({
        title: "New Wardley Map",
        saveLabel: "Create map",
        filters: { "Wardley Map": ["wmap", "owm"] },
        defaultUri: expect.objectContaining({ path: "/workspace/wardley-map.wmap" }),
      });
      expect(written()).toEqual([["/workspace/tea.wmap", text]]);
      expect(vscodeMock.executedCommands()).toContainEqual({
        command: "vscode.openWith",
        args: [target, MAP_VIEW_TYPE],
      });
    },
  );

  it("writes and opens nothing when the save dialog is dismissed", async () => {
    activateExtension();

    await commands.executeCommand("wardley.newMapFromExample");

    expect(written()).toEqual([]);
    expect(vscodeMock.executedCommands().map(({ command }) => command)).toEqual([
      "wardley.newMapFromExample",
    ]);
  });

  it("says which file it could not create, and opens nothing", async () => {
    activateExtension();
    vscodeMock.chooseSaveTarget(Uri.file("/read-only/tea.wmap"));
    vi.spyOn(workspace.fs, "writeFile").mockRejectedValue(new Error("EACCES"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const showErrorMessage = vi.spyOn(window, "showErrorMessage");

    await commands.executeCommand("wardley.newMap");

    expect(showErrorMessage).toHaveBeenCalledWith(
      "Couldn't create tea.wmap. Try again, or choose another folder.",
    );
    expect(vscodeMock.executedCommands().map(({ command }) => command)).toEqual(["wardley.newMap"]);
  });
});
