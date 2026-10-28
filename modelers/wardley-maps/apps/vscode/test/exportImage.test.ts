import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { exportImageToFile, fontFallbackText } from "../src/exportImage.js";
import { Uri, vscodeMock, window, workspace } from "./__mocks__/vscode";

const PNG_BASE64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
const SOURCE = Uri.file("/maps/strategy.wmap") as unknown as vscode.Uri;

beforeEach(() => {
  vscodeMock.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exportImageToFile", () => {
  it("saves the picture and confirms it with an information notification", async () => {
    vscodeMock.chooseSaveTarget(Uri.file("/maps/strategy.png"));

    await exportImageToFile(SOURCE, "png", PNG_BASE64);

    expect(vscodeMock.writtenFiles().map((file) => [file.uri.path, [...file.content]])).toEqual([
      ["/maps/strategy.png", [0x89, 0x50, 0x4e, 0x47]],
    ]);
    expect(vscodeMock.informationMessages()).toEqual(["Exported strategy.png."]);
    expect(vscodeMock.warningMessages()).toEqual([]);
  });

  it("warns instead once the PNG is saved when Geist could not be embedded", async () => {
    vscodeMock.chooseSaveTarget(Uri.file("/maps/strategy.png"));

    await exportImageToFile(SOURCE, "png", PNG_BASE64, true);

    expect(vscodeMock.writtenFiles()).toHaveLength(1);
    expect(vscodeMock.warningMessages()).toEqual([fontFallbackText("strategy.png")]);
    expect(vscodeMock.informationMessages()).toEqual([]);
  });

  it("reports a failed write in its own words, logs the cause and shows no success", async () => {
    const cause = new Error("disk full");
    vscodeMock.chooseSaveTarget(Uri.file("/maps/strategy.png"));
    vi.spyOn(workspace.fs, "writeFile").mockRejectedValue(cause);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const showErrorMessage = vi.spyOn(window, "showErrorMessage");

    await exportImageToFile(SOURCE, "png", PNG_BASE64, true);

    expect(showErrorMessage).toHaveBeenCalledWith(
      "Couldn't export strategy.png. Try again, or choose another folder.",
    );
    expect(consoleError).toHaveBeenCalledWith("Couldn't write strategy.png", cause);
    expect(vscodeMock.informationMessages()).toEqual([]);
    expect(vscodeMock.warningMessages()).toEqual([]);
  });

  it("says nothing and writes nothing when the save dialog is dismissed", async () => {
    await exportImageToFile(SOURCE, "png", PNG_BASE64, true);

    expect(vscodeMock.writtenFiles()).toEqual([]);
    expect(vscodeMock.warningMessages()).toEqual([]);
    expect(vscodeMock.informationMessages()).toEqual([]);
  });
});

describe("fontFallbackText", () => {
  it("names the file and the font in the words of the web app's toast", () => {
    expect(fontFallbackText("strategy.png")).toBe(
      "Exported strategy.png in a system font. Geist couldn't be embedded.",
    );
  });
});
