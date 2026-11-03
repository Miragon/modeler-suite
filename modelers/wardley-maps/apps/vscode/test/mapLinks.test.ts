import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileType, Uri, commands, vscodeMock, workspace } from "./__mocks__/vscode";
import { MAP_VIEW_TYPE } from "../src/mapEditor.js";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
  type FakePanel,
} from "./fakes.js";

const OVERVIEW = "/workspace/overview.wmap";
const DETAIL = "/workspace/details/child.wmap";

const NOT_A_MAP = "Only .wmap and .owm files open from a map link.";
const OUTSIDE_WORKSPACE = "A map link only opens files inside the workspace.";
const NOT_FOUND = "Check that the file exists.";
const OTHER_SCHEME = "A map link opens only http(s) and mailto addresses or other maps.";
/** `vscode.openWith`'s options: a map opened from a link never replaces the map in a preview tab. */
const PINNED = { preview: false };

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

async function openMapEditor(mapPath: string): Promise<FakePanel> {
  const { provider } = registerMapEditorForTest();
  const panel = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(
    asTextDocument(fakeDocument(mapPath, "title Map\n")),
    panel.panel,
    fakeToken,
  );
  return panel;
}

async function followLink(mapPath: string, address: string): Promise<void> {
  const panel = await openMapEditor(mapPath);
  await panel.receive({ type: "openLink", address });
}

/** The path, editor and options of every `vscode.openWith`. */
function openedMaps(): Array<[path: string, viewType: unknown, options: unknown]> {
  return vscodeMock
    .executedCommands()
    .filter(({ command }) => command === "vscode.openWith")
    .map(({ args: [uri, viewType, options] }) => [(uri as Uri).path, viewType, options]);
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

    expect(openedMaps()).toEqual([[target, MAP_VIEW_TYPE, PINNED]]);
    expect(vscodeMock.errorMessages()).toEqual([]);
  });

  it("opens a map in another folder of a multi-root workspace", async () => {
    workspace.workspaceFolders = [
      { uri: Uri.file("/workspace") },
      { uri: Uri.file("/other-root") },
    ];

    await followLink(OVERVIEW, "../other-root/shared.wmap");

    expect(openedMaps()).toEqual([["/other-root/shared.wmap", MAP_VIEW_TYPE, PINNED]]);
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

describe("following a link with a scheme", () => {
  it.each([
    "https://example.com/docs",
    "http://example.com",
    "HTTPS://EXAMPLE.COM/A",
    "mailto:team@example.com",
  ])("hands %s to VS Code's opener, which a webview can't reach", async (address) => {
    const stat = vi.spyOn(workspace.fs, "stat");

    await followLink(OVERVIEW, address);

    expect(vscodeMock.openedExternally().map(String)).toEqual([address]);
    expect(stat).not.toHaveBeenCalled();
    expect(openedMaps()).toEqual([]);
    expect(vscodeMock.errorMessages()).toEqual([]);
    stat.mockRestore();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///workspace/details/child.wmap",
    "command:workbench.action.quit",
    "vscode://file/workspace/details/child.wmap",
    "C:\\maps\\child.wmap",
  ])("refuses %s, which the webview never sends", async (address) => {
    const stat = vi.spyOn(workspace.fs, "stat");

    await followLink(OVERVIEW, address);

    expect(vscodeMock.errorMessages()).toEqual([`Couldn't open “${address}”. ${OTHER_SCHEME}`]);
    expect(vscodeMock.openedExternally()).toEqual([]);
    expect(stat).not.toHaveBeenCalled();
    expect(openedMaps()).toEqual([]);
    stat.mockRestore();
  });
});

describe("choosing a map to link to", () => {
  async function chooseFrom(mapPath: string, requestId = 7): Promise<FakePanel> {
    const panel = await openMapEditor(mapPath);
    await panel.receive({ type: "chooseLinkTarget", requestId });
    return panel;
  }

  function offered(): string[] {
    return vscodeMock.quickPicks().flatMap(({ items }) => items.map(({ label }) => label));
  }

  function answers(panel: FakePanel): unknown[] {
    return panel.posted.filter(({ type }) => type === "linkTargetChosen");
  }

  it("offers the other maps of the workspace relative to this one, the nearest first", async () => {
    vscodeMock.setFileTypes({
      [DETAIL]: FileType.File,
      "/workspace/details/sibling.wmap": FileType.File,
      "/workspace/details/legacy.owm": FileType.File,
      "/workspace/details/deeper/leaf.wmap": FileType.File,
      "/workspace/overview.wmap": FileType.File,
      "/workspace/other/far.wmap": FileType.File,
      "/workspace/details/notes.txt": FileType.File,
      "/workspace/details/folder.wmap": FileType.Directory,
    });

    await chooseFrom(DETAIL);

    expect(offered()).toEqual([
      "legacy.owm",
      "sibling.wmap",
      "deeper/leaf.wmap",
      "../overview.wmap",
      "../other/far.wmap",
    ]);
  });

  it("answers the request with the chosen map's address", async () => {
    vscodeMock.answerQuickPick("details/child.wmap");

    const panel = await chooseFrom(OVERVIEW, 3);

    expect(answers(panel)).toEqual([
      { type: "linkTargetChosen", requestId: 3, address: "details/child.wmap" },
    ]);
  });

  it("answers without an address when the user cancels", async () => {
    vscodeMock.answerQuickPick(undefined);

    const panel = await chooseFrom(OVERVIEW, 4);

    expect(answers(panel)).toEqual([{ type: "linkTargetChosen", requestId: 4 }]);
  });

  it("leaves out maps a link can't carry or reach", async () => {
    workspace.workspaceFolders = [
      { uri: Uri.file("/workspace") },
      { uri: Uri.file("/other-root") },
    ];
    vscodeMock.setFileTypes({
      [OVERVIEW]: FileType.File,
      "/workspace/a [draft].wmap": FileType.File,
      "/workspace/ trailing.wmap": FileType.File,
      "/workspace/plain.wmap": FileType.File,
      "/other-root/shared.wmap": FileType.File,
    });

    await chooseFrom(OVERVIEW);

    expect(offered()).toEqual(["plain.wmap", "../other-root/shared.wmap"]);
  });

  it("says so when there is no other map, and answers without an address", async () => {
    vscodeMock.setFileTypes({ [OVERVIEW]: FileType.File });

    const panel = await chooseFrom(OVERVIEW, 5);

    expect(vscodeMock.quickPicks()).toEqual([]);
    expect(vscodeMock.informationMessages()).toEqual([
      "There is no other .wmap or .owm file in the workspace to link to.",
    ]);
    expect(answers(panel)).toEqual([{ type: "linkTargetChosen", requestId: 5 }]);
  });
});
