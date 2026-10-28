import { beforeEach, describe, expect, it } from "vitest";
import { revealFileLabel } from "@miragon/modeler-shell/vscode/extension";
import { exportToFile } from "../src/exportImage.js";
import { Uri, vscodeMock, workspace } from "./__mocks__/vscode.js";

beforeEach(() => vscodeMock.reset());

describe("exportToFile", () => {
  it("writes the file and offers the platform's reveal action", async () => {
    const target = Uri.file("/maps/shop.svg");
    vscodeMock.answerSaveDialog(target);
    vscodeMock.answerNotification(revealFileLabel(process.platform));
    await exportToFile(Uri.file("/maps/shop.cm") as never, "svg", "<svg/>");
    expect(new TextDecoder().decode(workspace.fs.written[0]!.content)).toBe("<svg/>");
    expect(vscodeMock.notifications()).toEqual([
      { level: "info", message: "Exported shop.svg.", items: [revealFileLabel(process.platform)] },
    ]);
    expect(vscodeMock.executedCommands()).toEqual([["revealFileInOS", target]]);
  });

  it("warns instead of confirming when the PNG's labels fell back to the system font", async () => {
    const target = Uri.file("/maps/shop.png");
    vscodeMock.answerSaveDialog(target);
    vscodeMock.answerNotification(revealFileLabel(process.platform));
    await exportToFile(Uri.file("/maps/shop.cm") as never, "png", "iVBORw0KGgo=", true);
    expect(workspace.fs.written).toHaveLength(1);
    expect(vscodeMock.notifications()).toEqual([
      {
        level: "warning",
        message: "Exported shop.png in a system font. Geist couldn't be embedded.",
        items: [revealFileLabel(process.platform)],
      },
    ]);
    expect(vscodeMock.executedCommands()).toEqual([["revealFileInOS", target]]);
  });

  it("decodes a PNG from Base64 and writes nothing when the dialog is cancelled", async () => {
    await exportToFile(Uri.file("/maps/shop.cm") as never, "png", "iVBORw0KGgo=");
    expect(workspace.fs.written).toHaveLength(0);
    vscodeMock.answerSaveDialog(Uri.file("/maps/shop.png"));
    await exportToFile(Uri.file("/maps/shop.cm") as never, "png", "iVBORw0KGgo=");
    expect([...workspace.fs.written[0]!.content.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
