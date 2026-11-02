import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, Uri, commands, vscodeMock, workspace } from "./__mocks__/vscode";
import { MAP_VIEW_TYPE } from "../src/mapEditor.js";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
} from "./fakes.js";

const OVERVIEW = "/workspace/overview.wmap";
const DETAIL = "/workspace/details/child.wmap";

const NOT_A_MAP = "Only .wmap and .owm files open from a map link.";
const OUTSIDE_WORKSPACE = "A map link only opens files inside the workspace.";
const NOT_FOUND = "Check that the file exists.";

beforeEach(() => {
  vscodeMock.reset();
  workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }];
  vscodeMock.setFileTypes({
    [OVERVIEW]: FileType.File,
    [DETAIL]: FileType.File,
    "/workspace/details/sibling.wmap": FileType.File,
    "/workspace/details/my map.wmap": FileType.File,
    "/workspace/details/shouting.WMAP": FileType.File,
    "/workspace/details/legacy.owm": FileType.File,
    "/workspace/details/linked.wmap": FileType.File | FileType.SymbolicLink,
    "/workspace/parent.wmap": FileType.File,
    "/workspace/folder.wmap": FileType.Directory,
    "/other-root/shared.wmap": FileType.File,
    "/outside.wmap": FileType.File,
    "/workspace-evil/map.wmap": FileType.File,
  });
});

async function followLink(mapPath: string, address: string): Promise<void> {
  const { provider } = registerMapEditorForTest();
  const panel = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(
    asTextDocument(fakeDocument(mapPath, "title Map\n")),
    panel.panel,
    fakeToken,
  );
  await panel.receive({ type: "openLink", address });
}

/** The path and editor of every `vscode.openWith`. */
function openedMaps(): Array<[path: string, viewType: unknown]> {
  return vscodeMock
    .executedCommands()
    .filter(({ command }) => command === "vscode.openWith")
    .map(({ args: [uri, viewType] }) => [(uri as Uri).path, viewType]);
}

describe("following a relative link of a map", () => {
  it.each([
    [OVERVIEW, "details/child.wmap", DETAIL],
    [DETAIL, "./sibling.wmap", "/workspace/details/sibling.wmap"],
    [DETAIL, "sibling.wmap", "/workspace/details/sibling.wmap"],
    [DETAIL, "../parent.wmap", "/workspace/parent.wmap"],
    [OVERVIEW, "details/../parent.wmap", "/workspace/parent.wmap"],
    [DETAIL, "my map.wmap", "/workspace/details/my map.wmap"],
    [DETAIL, "legacy.owm", "/workspace/details/legacy.owm"],
    [DETAIL, "shouting.WMAP", "/workspace/details/shouting.WMAP"],
    [DETAIL, "linked.wmap", "/workspace/details/linked.wmap"],
  ])("from %s, %s opens %s in the map editor", async (mapPath, address, target) => {
    await followLink(mapPath, address);

    expect(openedMaps()).toEqual([[target, MAP_VIEW_TYPE]]);
    expect(vscodeMock.errorMessages()).toEqual([]);
  });

  it("opens a map in another folder of a multi-root workspace", async () => {
    workspace.workspaceFolders = [
      { uri: Uri.file("/workspace") },
      { uri: Uri.file("/other-root") },
    ];

    await followLink(OVERVIEW, "../other-root/shared.wmap");

    expect(openedMaps()).toEqual([["/other-root/shared.wmap", MAP_VIEW_TYPE]]);
  });

  describe("refuses before it asks the file system", () => {
    it.each([
      ["notes.txt", NOT_A_MAP],
      ["child.wmap.txt", NOT_A_MAP],
      ["child.wmap#section", NOT_A_MAP],
      ["child.wmap?version=1", NOT_A_MAP],
      ["example.com", NOT_A_MAP],
      ["../../secret.txt", NOT_A_MAP],
      ["../../outside.wmap", OUTSIDE_WORKSPACE],
      ["../../../../../../etc/passwd.wmap", OUTSIDE_WORKSPACE],
      ["../sibling/../../outside.wmap", OUTSIDE_WORKSPACE],
      ["../../workspace-evil/map.wmap", OUTSIDE_WORKSPACE],
    ])("%s", async (address, reason) => {
      const stat = vi.spyOn(workspace.fs, "stat");

      await followLink(DETAIL, address);

      expect(vscodeMock.errorMessages()).toEqual([`Couldn't open “${address}”. ${reason}`]);
      expect(stat).not.toHaveBeenCalled();
      expect(openedMaps()).toEqual([]);
      stat.mockRestore();
    });

    it("every map link in a window without a folder", async () => {
      workspace.workspaceFolders = undefined;
      const stat = vi.spyOn(workspace.fs, "stat");

      await followLink(DETAIL, "sibling.wmap");

      expect(vscodeMock.errorMessages()).toEqual([
        `Couldn't open “sibling.wmap”. ${OUTSIDE_WORKSPACE}`,
      ]);
      expect(stat).not.toHaveBeenCalled();
      stat.mockRestore();
    });
  });

  describe("says which address it couldn't open", () => {
    it.each([
      ["details/missing.wmap", "a missing file"],
      ["folder.wmap", "a folder with a map's name"],
      ["//example.com/map.wmap", "a network path, which stays beside the map"],
      ["/outside.wmap", "a rooted path, which stays beside the map"],
      ["%2e%2e/parent.wmap", "an encoded parent folder, which stays a folder name"],
      ["my%20map.wmap", "an encoded space, which stays part of the name"],
    ])("%s: %s", async (address) => {
      await followLink(OVERVIEW, address);

      expect(vscodeMock.errorMessages()).toEqual([`Couldn't open “${address}”. ${NOT_FOUND}`]);
      expect(openedMaps()).toEqual([]);
    });

    it("a map VS Code refuses to open", async () => {
      const executeCommand = vi
        .spyOn(commands, "executeCommand")
        .mockRejectedValueOnce(new Error("Unable to open"));

      await followLink(OVERVIEW, "details/child.wmap");

      expect(vscodeMock.errorMessages()).toEqual([
        `Couldn't open “details/child.wmap”. ${NOT_FOUND}`,
      ]);
      executeCommand.mockRestore();
    });
  });
});
