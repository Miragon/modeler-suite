import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import { PNG_VIEW_TYPE } from "../src/commands.js";
import { EMPTY_MAP, EXAMPLE_MAP } from "../src/examples.js";
import { exportMap } from "../src/exportImage.js";
import { activate } from "../src/extension.js";
import { MAP_VIEW_TYPE } from "../src/mapEditorOptions.js";
import { Uri, vscodeMock, window, workspace } from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());
afterEach(() => vi.restoreAllMocks());

function written(): Array<[path: string, text: string]> {
  return workspace.fs.written.map(({ uri, content }) => [
    uri.path,
    new TextDecoder().decode(content),
  ]);
}

function opened(): unknown[][] {
  return vscodeMock.executedCommands().filter(([command]) => command === "vscode.openWith");
}

describe("an export of either editor, through the shell's save dialog", () => {
  it.each([
    ["png", "/maps/shop.cm", "Export as PNG", { "PNG image": ["png"] }, "/maps/shop.png"],
    ["svg", "/maps/shop.cm.png", "Export as SVG", { "SVG image": ["svg"] }, "/maps/shop.svg"],
    [
      "json",
      "/maps/shop.cm",
      "Export as JSON",
      { "Context map": ["cm.json", "json"] },
      "/maps/shop.cm.json",
    ],
    [
      "cml",
      "/maps/shop.cm.json",
      "Export as CML",
      { "Context Mapper CML": ["cml"] },
      "/maps/shop.cml",
    ],
  ] as const)(
    "suggests the %s of %s beside it, without the double extension",
    async (format, source, title, filters, suggested) => {
      const showSaveDialog = vi.spyOn(window, "showSaveDialog");

      await exportMap(Uri.file(source) as never, { type: "export", format, data: "{}" });

      expect(showSaveDialog).toHaveBeenCalledWith({
        title,
        saveLabel: "Export",
        filters,
        defaultUri: expect.objectContaining({ path: suggested }),
      });
    },
  );

  it("suggests context-map in the first workspace folder for a map that is no file", async () => {
    workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }];
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");

    await exportMap(Uri.parse("untitled:Untitled-1") as never, {
      type: "export",
      format: "cml",
      data: "ContextMap {}",
    });

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultUri: expect.objectContaining({ path: "/workspace/context-map.cml" }),
      }),
    );
  });

  it("writes a PNG's bytes and names the file with the action that reveals it", async () => {
    const target = Uri.file("/maps/shop.png");
    vscodeMock.answerSaveDialog(target);
    const reveal = revealFileLabel(process.platform);
    vscodeMock.answerNotification(reveal);

    await exportMap(Uri.file("/maps/shop.cm") as never, {
      type: "export",
      format: "png",
      data: "iVBORw0KGgo=",
    });

    expect([...workspace.fs.written[0]!.content.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(vscodeMock.notifications()).toEqual([
      { level: "info", message: "Exported shop.png.", items: [reveal] },
    ]);
    expect(vscodeMock.executedCommands()).toEqual([["revealFileInOS", target]]);
  });

  it("writes JSON and CML as their text", async () => {
    vscodeMock.answerSaveDialog(Uri.file("/maps/shop.cml"));

    await exportMap(Uri.file("/maps/shop.cm") as never, {
      type: "export",
      format: "cml",
      data: 'ContextMap Shop { contains "Kasse" }',
    });

    expect(written()).toEqual([["/maps/shop.cml", 'ContextMap Shop { contains "Kasse" }']]);
  });
});

describe("the New commands", () => {
  beforeEach(() => {
    activate({ extensionUri: Uri.file("/extension"), subscriptions: [] } as never);
    workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }];
  });

  it.each([
    ["contextMaps.newDiagram", EMPTY_MAP],
    ["contextMaps.newFromExample", EXAMPLE_MAP],
  ])(
    "%s saves a new map in the workspace folder and opens it in the map editor",
    async (command, text) => {
      const target = Uri.file("/workspace/shop.cm");
      vscodeMock.answerSaveDialog(target);
      const showSaveDialog = vi.spyOn(window, "showSaveDialog");

      await vscodeMock.runCommand(command);

      expect(showSaveDialog).toHaveBeenCalledWith({
        title: "New Context Maps Diagram",
        saveLabel: "Create diagram",
        filters: { "Context Maps": ["cm", "cm.json"] },
        defaultUri: expect.objectContaining({ path: "/workspace/context-map.cm" }),
      });
      expect(written()).toEqual([["/workspace/shop.cm", text]]);
      expect(opened()).toEqual([["vscode.openWith", target, MAP_VIEW_TYPE]]);
    },
  );

  it("writes and opens nothing when the save dialog is dismissed", async () => {
    await vscodeMock.runCommand("contextMaps.newFromExample");

    expect(written()).toEqual([]);
    expect(opened()).toEqual([]);
  });

  it("saves an empty embedded PNG under a name the PNG editor claims and opens it there", async () => {
    vscodeMock.answerSaveDialog(Uri.file("/workspace/shop.png"));
    const showSaveDialog = vi.spyOn(window, "showSaveDialog");

    await vscodeMock.runCommand("contextMaps.newPngDiagram");

    expect(showSaveDialog).toHaveBeenCalledWith({
      title: "New Context Maps Diagram (embedded PNG)",
      saveLabel: "Create diagram",
      filters: { "Context Maps (PNG)": ["png"] },
      defaultUri: expect.objectContaining({ path: "/workspace/context-map.cm.png" }),
    });
    expect(written()).toEqual([["/workspace/shop.cm.png", ""]]);
    expect(opened()).toEqual([
      ["vscode.openWith", Uri.file("/workspace/shop.cm.png"), PNG_VIEW_TYPE],
    ]);
  });

  it("keeps a name the PNG editor already claims, without asking", async () => {
    const target = Uri.file("/workspace/shop.cm.png");
    vscodeMock.addFile(target);
    vscodeMock.answerSaveDialog(target);

    await vscodeMock.runCommand("contextMaps.newPngDiagram");

    expect(vscodeMock.notifications()).toEqual([]);
    expect(written()).toEqual([["/workspace/shop.cm.png", ""]]);
  });

  it("asks before it replaces a diagram already at the corrected name, and keeps it unless told", async () => {
    vscodeMock.addFile(Uri.file("/workspace/shop.cm.png"));
    vscodeMock.answerSaveDialog(Uri.file("/workspace/shop.png"));

    await vscodeMock.runCommand("contextMaps.newPngDiagram");

    expect(vscodeMock.notifications()).toEqual([
      {
        level: "warning",
        message: "shop.cm.png already exists. Do you want to replace it?",
        items: ["Replace"],
        modal: true,
      },
    ]);
    expect(written()).toEqual([]);
    expect(opened()).toEqual([]);
  });

  it("replaces the diagram at the corrected name once the question is answered with Replace", async () => {
    vscodeMock.addFile(Uri.file("/workspace/shop.cm.png"));
    vscodeMock.answerSaveDialog(Uri.file("/workspace/shop.png"));
    vscodeMock.answerNotification("Replace");

    await vscodeMock.runCommand("contextMaps.newPngDiagram");

    expect(written()).toEqual([["/workspace/shop.cm.png", ""]]);
    expect(opened()).toHaveLength(1);
  });
});
