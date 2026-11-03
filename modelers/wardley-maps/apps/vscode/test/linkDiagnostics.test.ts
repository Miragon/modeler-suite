import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosticSeverity, FileType, Uri, vscodeMock, workspace } from "./__mocks__/vscode";
import { WardleyDiagnostics, mapLinkDiagnostics } from "../src/diagnostics.js";
import type { HostToWebview } from "../src/protocol.js";
import { WorkspaceMaps } from "../src/workspaceMaps.js";
import {
  asTextDocument,
  fakeDocument,
  fakeToken,
  fakeWebviewPanel,
  registerMapEditorForTest,
  type FakeDoc,
} from "./fakes.js";

const NOT_A_MAP = "Only .wmap and .owm files open from a map link.";
const OUTSIDE_WORKSPACE = "A map link only opens files inside the workspace.";

let maps: WorkspaceMaps;
let diagnostics: WardleyDiagnostics | undefined;

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(150);
}

async function knownMaps(): Promise<WorkspaceMaps> {
  maps = new WorkspaceMaps();
  await settle();
  return maps;
}

/** A map whose only statements are links: `url <name> [<address>]`, one per address. */
function linking(...addresses: string[]): string {
  return `title Links\n${addresses.map((address, index) => `url L${index} [${address}]\n`).join("")}`;
}

function linkFindings(path: string, text: string): Array<[message: string, range: unknown]> {
  return mapLinkDiagnostics(asTextDocument(fakeDocument(path, text)), maps).map((finding) => [
    finding.message,
    finding.range,
  ]);
}

function messages(path: string, text: string): string[] {
  return linkFindings(path, text).map(([message]) => message);
}

beforeEach(() => {
  vscodeMock.reset();
  vi.useFakeTimers();
  workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }, { uri: Uri.file("/second") }];
  vscodeMock.setFileTypes({
    "/workspace/overview.wmap": FileType.File,
    "/workspace/details/child.wmap": FileType.File,
    "/workspace/details/sibling.wmap": FileType.File,
    "/workspace/details/my map.wmap": FileType.File,
    "/workspace/details/deeper/leaf.owm": FileType.File,
    "/workspace/details/notes.txt": FileType.File,
    "/workspace/details/payment.wmap": FileType.File,
    "/second/shared.wmap": FileType.File,
    "/outside/elsewhere.wmap": FileType.File,
  });
});

afterEach(() => {
  diagnostics?.dispose();
  diagnostics = undefined;
  maps?.dispose();
  vi.useRealTimers();
});

describe("a link to a map that isn't there", () => {
  it("is a warning under its address that names it", async () => {
    await knownMaps();
    const text = [
      "title Overview",
      "url Payment [details/payment.wmap]",
      "  url Missing [ details/missing.wmap ]",
      "component Checkout [0.5, 0.5] url(Payment)",
      "component Gone [0.4, 0.4] url(Missing)",
    ].join("\n");

    const [finding, ...others] = mapLinkDiagnostics(
      asTextDocument(fakeDocument("/workspace/overview.wmap", text)),
      maps,
    );

    expect(others).toEqual([]);
    expect(finding!.message).toBe("The linked map “details/missing.wmap” doesn't exist.");
    expect(finding!.severity).toBe(DiagnosticSeverity.Warning);
    expect(finding!.source).toBe("wardley");
    expect(finding!.range).toEqual({
      start: { line: 2, character: 16 },
      end: { line: 2, character: 36 },
    });
  });

  describe("resolved as Open link resolves it, from details/child.wmap", () => {
    it.each([
      "sibling.wmap",
      "./sibling.wmap",
      "my map.wmap",
      "deeper/leaf.owm",
      "../overview.wmap",
      "../details/../overview.wmap",
      "../../second/shared.wmap",
      "child.wmap",
    ])("%s leads to a map", async (address) => {
      await knownMaps();

      expect(messages("/workspace/details/child.wmap", linking(address))).toEqual([]);
    });

    it.each([
      ["missing.wmap", "The linked map “missing.wmap” doesn't exist."],
      ["../details", "The link “../details” doesn't lead to a map. " + NOT_A_MAP],
      ["notes.txt", "The link “notes.txt” doesn't lead to a map. " + NOT_A_MAP],
      ["sibling.wmap#part", "The link “sibling.wmap#part” doesn't lead to a map. " + NOT_A_MAP],
      [
        "../../outside/elsewhere.wmap",
        "The linked map “../../outside/elsewhere.wmap” is outside the workspace. " +
          OUTSIDE_WORKSPACE,
      ],
      ["my%20map.wmap", "The linked map “my%20map.wmap” doesn't exist."],
      ["%2e%2e/overview.wmap", "The linked map “%2e%2e/overview.wmap” doesn't exist."],
      ["/overview.wmap", "The linked map “/overview.wmap” doesn't exist."],
    ])("%s", async (address, message) => {
      await knownMaps();

      expect(messages("/workspace/details/child.wmap", linking(address))).toEqual([message]);
    });
  });

  it.each([
    "https://example.com/missing.wmap",
    "HTTP://EXAMPLE.COM",
    "mailto:team@example.com",
    "javascript:alert(1)",
  ])("is not looked for behind %s, which has a scheme", async (address) => {
    await knownMaps();

    expect(messages("/workspace/overview.wmap", linking(address))).toEqual([]);
  });

  it("is not looked for in comments", async () => {
    await knownMaps();
    const text = "// url A [missing.wmap]\n/*\nurl B [missing.wmap]\n*/\n";

    expect(messages("/workspace/overview.wmap", text)).toEqual([]);
  });

  it("is not looked for in a map outside the workspace, none of whose links opens", async () => {
    await knownMaps();

    expect(messages("/outside/elsewhere.wmap", linking("missing.wmap"))).toEqual([]);
    expect(messages("/untitled.wmap", linking("missing.wmap"))).toEqual([]);
  });

  it("is not reported before the workspace's maps are known", () => {
    maps = new WorkspaceMaps();

    expect(messages("/workspace/overview.wmap", linking("missing.wmap"))).toEqual([]);
  });
});

describe("WardleyDiagnostics with the workspace's maps", () => {
  let doc: FakeDoc;

  function count(): number {
    return diagnostics!.count(asTextDocument(doc).uri);
  }

  function open(path: string, text: string): FakeDoc {
    doc = fakeDocument(path, text);
    workspace.textDocuments = [doc];
    return doc;
  }

  it("adds the broken links to the parser's findings", async () => {
    await knownMaps();
    open("/workspace/overview.wmap", `${linking("details/missing.wmap")}compnent Typo\n`);
    diagnostics = new WardleyDiagnostics(maps);

    expect(count()).toBe(2);
  });

  it("checks the open maps again once the workspace's maps are known", async () => {
    maps = new WorkspaceMaps();
    open("/workspace/overview.wmap", linking("details/missing.wmap"));
    diagnostics = new WardleyDiagnostics(maps);
    const changes: unknown[] = [];
    diagnostics.onDidChangeCount((change) => changes.push(change));
    expect(count()).toBe(0);

    await settle();

    expect(count()).toBe(1);
    expect(changes).toEqual([{ document: doc, count: 1 }]);
  });

  it("checks them again when a linked map appears, goes away or moves elsewhere", async () => {
    await knownMaps();
    open("/workspace/overview.wmap", linking("details/new.wmap", "details/payment.wmap"));
    diagnostics = new WardleyDiagnostics(maps);
    const counts: number[] = [];
    diagnostics.onDidChangeCount((change) => counts.push(change.count));
    expect(count()).toBe(1);

    vscodeMock.fireFileWatcher("create", "/workspace/details/new.wmap");
    await settle();
    expect(count()).toBe(0);

    vscodeMock.fireFileWatcher("delete", "/workspace/details/new.wmap");
    await settle();
    expect(count()).toBe(1);

    vscodeMock.fireDidRenameFiles([["/workspace/details", "/workspace/archive"]]);
    await settle();
    expect(count()).toBe(2);
    expect(counts).toEqual([0, 1, 2]);
  });

  it("tells nobody when a map file changes nothing for the open maps", async () => {
    await knownMaps();
    open("/workspace/overview.wmap", linking("details/payment.wmap"));
    diagnostics = new WardleyDiagnostics(maps);
    const changes: unknown[] = [];
    diagnostics.onDidChangeCount((change) => changes.push(change));

    vscodeMock.fireFileWatcher("create", "/workspace/unrelated.wmap");
    await settle();

    expect(changes).toEqual([]);
  });
});

describe("the problems pill of an open map editor", () => {
  async function openEditor(text: string) {
    await knownMaps();
    const doc = fakeDocument("/workspace/overview.wmap", text);
    workspace.textDocuments = [doc];
    diagnostics = new WardleyDiagnostics(maps);
    const { provider } = registerMapEditorForTest(diagnostics);
    const panel = fakeWebviewPanel();
    await provider.resolveCustomTextEditor(asTextDocument(doc), panel.panel, fakeToken);
    await panel.receive({ type: "ready" });
    const pill = () =>
      panel.posted.filter(
        (message): message is Extract<HostToWebview, { type: "problems" }> =>
          message.type === "problems",
      );
    return { doc, pill };
  }

  it("counts a broken link like a parser warning", async () => {
    const { pill } = await openEditor(linking("details/missing.wmap"));

    expect(pill()).toEqual([{ type: "problems", count: 1, errors: 0 }]);
  });

  it("follows a linked map that appears or goes away, though the text stays", async () => {
    const { pill } = await openEditor(linking("details/new.wmap"));

    vscodeMock.fireFileWatcher("create", "/workspace/details/new.wmap");
    await settle();
    vscodeMock.fireFileWatcher("delete", "/workspace/details/new.wmap");
    await settle();

    expect(pill().map(({ count }) => count)).toEqual([1, 0, 1]);
  });

  it("then shows each count in turn, also the one the shell had posted last", async () => {
    const { doc, pill } = await openEditor(linking("details/new.wmap"));
    vscodeMock.fireFileWatcher("create", "/workspace/details/new.wmap");
    await settle();

    // 1 again: the shell posted 1 last and holds it back.
    doc.set(linking("details/new.wmap", "details/other.wmap"));
    vscodeMock.fireDidChangeTextDocument(doc);
    doc.set(linking("details/new.wmap", "details/other.wmap", "details/third.wmap"));
    vscodeMock.fireDidChangeTextDocument(doc);

    const counts = pill().map(({ count }) => count);
    const shown = counts.filter((count, index) => count !== counts[index - 1]);
    expect(shown).toEqual([1, 0, 1, 2]);
  });

  it("hears nothing extra while only the text changes", async () => {
    const { doc, pill } = await openEditor(linking("details/missing.wmap"));

    doc.set(linking("details/payment.wmap"));
    vscodeMock.fireDidChangeTextDocument(doc);
    doc.set(linking("details/payment.wmap", "details/gone.wmap"));
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(pill().map(({ count }) => count)).toEqual([1, 0, 1]);
  });
});
