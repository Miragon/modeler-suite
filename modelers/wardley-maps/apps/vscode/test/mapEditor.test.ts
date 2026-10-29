import { beforeEach, describe, expect, it } from "vitest";
import { Uri, vscodeMock, window } from "./__mocks__/vscode";
import { WardleyDiagnostics } from "../src/diagnostics.js";
import { MAP_VIEW_TYPE } from "../src/mapEditor.js";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
} from "./fakes.js";

beforeEach(() => vscodeMock.reset());

const VALID = "title Tea\ncomponent Water [0.4, 0.8]\n";
const TYPO = "title Tea\ncompnent Water [0.4, 0.8]\n";

async function openMap(text: string, diagnostics?: WardleyDiagnostics) {
  const { provider, editors } = registerMapEditorForTest(diagnostics);
  const doc = fakeDocument("/tea.wmap", text);
  const panel = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(asTextDocument(doc), panel.panel, fakeToken);
  return { doc, panel, editors };
}

describe("the map editor on the shell's document plumbing", () => {
  it("registers the custom editor of the manifest", () => {
    registerMapEditorForTest();
    expect(vscodeMock.registeredEditors().map((editor) => editor.viewType)).toEqual([
      MAP_VIEW_TYPE,
    ]);
  });

  it("saves an export next to the map and confirms it", async () => {
    const { panel } = await openMap(VALID);
    vscodeMock.chooseSaveTarget(Uri.file("/tea.svg"));

    await panel.receive({ type: "export", format: "svg", data: "<svg/>" });

    const [written] = vscodeMock.writtenFiles();
    expect(written?.uri.path).toBe("/tea.svg");
    expect(new TextDecoder().decode(written?.content)).toBe("<svg/>");
    expect(vscodeMock.informationMessages()).toEqual(["Exported tea.svg."]);
  });

  it("shows the renamed-label note of the webview as an information message", async () => {
    const { panel } = await openMap(VALID);
    await panel.receive({ type: "info", message: "“Tea” already exists. Renamed to “Tea 2”." });
    expect(vscodeMock.informationMessages()).toEqual(["“Tea” already exists. Renamed to “Tea 2”."]);
  });

  it("counts the parser's findings as warnings on the pill, and follows a change", async () => {
    const diagnostics = new WardleyDiagnostics();
    const { doc, panel } = await openMap(VALID, diagnostics);
    await panel.receive({ type: "ready" });

    doc.set(TYPO);
    vscodeMock.fireDidChangeTextDocument(doc);

    const problems = panel.posted.filter((message) => message.type === "problems");
    expect(problems).toEqual([
      { type: "problems", count: 0, errors: 0 },
      { type: "problems", count: diagnostics.count(asTextDocument(doc).uri), errors: 0 },
    ]);
    expect(diagnostics.count(asTextDocument(doc).uri)).toBeGreaterThan(0);
    diagnostics.dispose();
  });

  it("runs a command in the map of a resource that is not focused", async () => {
    const { doc, panel, editors } = await openMap(VALID);
    panel.setActive(false);
    window.activeTextEditor = undefined;

    expect(editors.runCommand("exportPng")).toBe(false);
    expect(editors.runCommand("exportPng", asTextDocument(doc).uri)).toBe(true);
    expect(panel.posted).toContainEqual({ type: "command", name: "exportPng" });
  });
});
