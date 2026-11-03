import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { FileType, type Range, Uri, vscodeMock, workspace } from "./__mocks__/vscode";
import { registerLinkUpdates, updateMapLinksAfterMove } from "../src/linkUpdates.js";
import { applyRangeEdit, fakeDocument } from "./fakes.js";

const SETTING = "miragon.wardleyMaps.updateLinksOnFileMove.enabled";
const UPDATE = "Update links";

const OVERVIEW = [
  "title Overview",
  "// details/payment.wmap holds the payment flow",
  "url Payment [details/payment.wmap]",
  "url  PaymentToo   [ ./details/payment.wmap ]",
  "url Legacy [details/legacy.owm]",
  "url Web [https://example.com/details/payment.wmap]",
  "/*",
  "url Commented [details/payment.wmap]",
  "*/",
  "component Checkout [0.5, 0.5] url(Payment)",
  "component Old [0.4, 0.4] url(Legacy)",
  "",
].join("\n");

const PAYMENT = [
  "title Payment",
  "url Back [../overview.wmap]",
  "url Sibling [./legacy.owm]",
  "url Shared [../../second/shared.wmap]",
  "url Missing [gone.wmap]",
  "url Outside [../../outside/elsewhere.wmap]",
  "submap Overview [0.9, 0.5] url(Back)",
  "",
].join("\n");

const LEGACY = "title Legacy\nurl Up [../overview.wmap]\n";
const SHARED = "title Shared\nurl Payment [../workspace/details/payment.wmap]\n";
const ELSEWHERE = "title Elsewhere\nurl Payment [../workspace/details/payment.wmap]\n";
const TEXTS = {
  "/workspace/overview.wmap": OVERVIEW,
  "/workspace/details/payment.wmap": PAYMENT,
  "/workspace/details/legacy.owm": LEGACY,
  "/workspace/details/notes.txt": "not a map",
  "/second/shared.wmap": SHARED,
  "/outside/elsewhere.wmap": ELSEWHERE,
};

/** OVERVIEW once its two links to payment.wmap lead to `address` (`./` kept on the second). */
function overviewLinkingTo(address: string): string {
  return OVERVIEW.replace("url Payment [details/payment.wmap]", `url Payment [${address}]`).replace(
    "url  PaymentToo   [ ./details/payment.wmap ]",
    `url  PaymentToo   [ ./${address} ]`,
  );
}

beforeEach(() => {
  vscodeMock.reset();
  workspace.workspaceFolders = [{ uri: Uri.file("/workspace") }, { uri: Uri.file("/second") }];
  vscodeMock.setFileTypes({ "/workspace/details": FileType.Directory });
  vscodeMock.setFileTexts(TEXTS);
  vscodeMock.setConfiguration(SETTING, "always");
});

function isAtOrBelow(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** The file system after VS Code moved `oldPath` (a file or a folder) to `newPath`. */
function moveOnDisk(oldPath: string, newPath: string): void {
  const types = Object.fromEntries(
    [...vscodeMock.fileTypes()].map(([path, type]) => [
      isAtOrBelow(path, oldPath) ? newPath + path.slice(oldPath.length) : path,
      type,
    ]),
  );
  const texts = Object.fromEntries(
    [...vscodeMock.fileTypes().keys()]
      .filter((path) => vscodeMock.fileText(path) !== undefined)
      .map((path) => [
        isAtOrBelow(path, oldPath) ? newPath + path.slice(oldPath.length) : path,
        vscodeMock.fileText(path)!,
      ]),
  );
  vscodeMock.setFileTypes(types);
  vscodeMock.setFileTexts(texts);
}

async function move(...moves: Array<[oldPath: string, newPath: string]>): Promise<void> {
  for (const [oldPath, newPath] of moves) moveOnDisk(oldPath, newPath);
  await updateMapLinksAfterMove(
    moves.map(([oldPath, newPath]) => ({
      oldUri: Uri.file(oldPath) as unknown as vscode.Uri,
      newUri: Uri.file(newPath) as unknown as vscode.Uri,
    })),
  );
}

/** Each file the applied edits change, with its text once they are applied. */
function editedTexts(textOf: (path: string) => string = (path) => vscodeMock.fileText(path)!) {
  const edits = vscodeMock.appliedEdits().flatMap(({ edits }) => edits);
  const paths = [...new Set(edits.map(({ uri }) => (uri as Uri).path))];
  return Object.fromEntries(
    paths.map((path) => {
      const own = edits
        .filter(({ uri }) => (uri as Uri).path === path)
        .map(({ range, text }) => ({ range: range as Range, text }))
        .sort((a, b) => b.range.start.line - a.range.start.line);
      return [
        path,
        own.reduce((text, edit) => applyRangeEdit(text, edit.range, edit.text), textOf(path)),
      ];
    }),
  );
}

describe("after a map is renamed or moved", () => {
  it("updates the links of other maps to it, in every workspace folder, keeping ./", async () => {
    await move(["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"]);

    expect(vscodeMock.appliedEdits()).toHaveLength(1);
    expect(editedTexts()).toEqual({
      "/workspace/overview.wmap": overviewLinkingTo("details/billing.wmap"),
      "/second/shared.wmap": SHARED.replace("details/payment.wmap", "details/billing.wmap"),
    });
  });

  it("updates the moved map's own links to the maps that stayed, leaving a broken one", async () => {
    await move(["/workspace/details/payment.wmap", "/workspace/details/2024/q1/payment.wmap"]);

    const edited = editedTexts();
    expect(edited["/workspace/details/2024/q1/payment.wmap"]).toBe(
      [
        "title Payment",
        "url Back [../../../overview.wmap]",
        "url Sibling [../../legacy.owm]",
        "url Shared [../../../../second/shared.wmap]",
        "url Missing [gone.wmap]",
        "url Outside [../../outside/elsewhere.wmap]",
        "submap Overview [0.9, 0.5] url(Back)",
        "",
      ].join("\n"),
    );
    expect(edited["/workspace/overview.wmap"]).toBe(
      overviewLinkingTo("details/2024/q1/payment.wmap"),
    );
  });

  it("writes ../ where the new address goes up, and keeps ./ where it stays below", async () => {
    await move(["/workspace/overview.wmap", "/workspace/maps/overview.wmap"]);

    expect(editedTexts()).toEqual({
      "/workspace/maps/overview.wmap": OVERVIEW.replace(
        "url Payment [details/payment.wmap]",
        "url Payment [../details/payment.wmap]",
      )
        .replace(
          "url  PaymentToo   [ ./details/payment.wmap ]",
          "url  PaymentToo   [ ../details/payment.wmap ]",
        )
        .replace("url Legacy [details/legacy.owm]", "url Legacy [../details/legacy.owm]"),
      "/workspace/details/payment.wmap": PAYMENT.replace(
        "url Back [../overview.wmap]",
        "url Back [../maps/overview.wmap]",
      ),
      "/workspace/details/legacy.owm": LEGACY.replace("../overview.wmap", "../maps/overview.wmap"),
    });
  });

  it("changes only the addresses: comments, web addresses and spacing stay byte for byte", async () => {
    await move(["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"]);

    const edits = vscodeMock
      .appliedEdits()[0]!
      .edits.filter(({ uri }) => (uri as Uri).path === "/workspace/overview.wmap");
    expect(edits.map(({ range, text }) => [range, text])).toEqual([
      [
        { start: { line: 2, character: 13 }, end: { line: 2, character: 33 } },
        "details/billing.wmap",
      ],
      [
        { start: { line: 3, character: 20 }, end: { line: 3, character: 42 } },
        "./details/billing.wmap",
      ],
    ]);
    const overview = editedTexts()["/workspace/overview.wmap"]!;
    expect(overview).toContain("// details/payment.wmap holds the payment flow");
    expect(overview).toContain("url Commented [details/payment.wmap]");
    expect(overview).toContain("url Web [https://example.com/details/payment.wmap]");
  });

  it("keeps the line breaks of a CRLF map", async () => {
    vscodeMock.setFileTexts({
      ...TEXTS,
      "/workspace/overview.wmap": OVERVIEW.replace(/\n/g, "\r\n"),
    });

    await move(["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"]);

    expect(editedTexts()["/workspace/overview.wmap"]).toBe(
      overviewLinkingTo("details/billing.wmap").replace(/\n/g, "\r\n"),
    );
  });

  it("edits the text of an open map, with its unsaved changes", async () => {
    const unsaved = `// not saved yet\n${OVERVIEW}`;
    workspace.textDocuments = [fakeDocument("/workspace/overview.wmap", unsaved)];

    await move(["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"]);

    expect(editedTexts(() => unsaved)["/workspace/overview.wmap"]).toBe(
      `// not saved yet\n${overviewLinkingTo("details/billing.wmap")}`,
    );
  });
});

describe("after a folder of maps is renamed or moved", () => {
  it("updates the links into it and out of it, and leaves the links within it", async () => {
    await move(["/workspace/details", "/workspace/areas/details"]);

    expect(editedTexts()).toEqual({
      "/workspace/overview.wmap": overviewLinkingTo("areas/details/payment.wmap").replace(
        "url Legacy [details/legacy.owm]",
        "url Legacy [areas/details/legacy.owm]",
      ),
      "/workspace/areas/details/payment.wmap": PAYMENT.replace(
        "url Back [../overview.wmap]",
        "url Back [../../overview.wmap]",
      ).replace(
        "url Shared [../../second/shared.wmap]",
        "url Shared [../../../second/shared.wmap]",
      ),
      "/workspace/areas/details/legacy.owm": LEGACY.replace(
        "../overview.wmap",
        "../../overview.wmap",
      ),
      "/second/shared.wmap": SHARED.replace("details/payment.wmap", "areas/details/payment.wmap"),
    });
  });

  it("updates nothing for a rename that keeps every address", async () => {
    vscodeMock.setFileTexts({
      "/workspace/details/payment.wmap": "title Payment\nurl Sibling [legacy.owm]\n",
      "/workspace/details/legacy.owm": "title Legacy\nurl Sibling [./payment.wmap]\n",
    });

    await move(["/workspace/details", "/workspace/parts"]);

    expect(vscodeMock.appliedEdits()).toEqual([]);
    expect(vscodeMock.shownMessages()).toEqual([]);
  });
});

describe("what it leaves alone", () => {
  it("a map outside the workspace, and a link to one", async () => {
    await move(["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"]);

    const edited = editedTexts();
    expect(Object.keys(edited)).not.toContain("/outside/elsewhere.wmap");
    expect(vscodeMock.fileText("/outside/elsewhere.wmap")).toBe(ELSEWHERE);
  });

  it("a map moved out of the workspace, and the links to it", async () => {
    await move(["/workspace/details/payment.wmap", "/outside/payment.wmap"]);

    expect(vscodeMock.appliedEdits()).toEqual([]);
  });

  it("a link whose new address a map can't store", async () => {
    await move(["/workspace/details/payment.wmap", "/workspace/details/[old]/payment.wmap"]);

    expect(Object.keys(editedTexts())).toEqual(["/workspace/details/[old]/payment.wmap"]);
    expect(editedTexts()["/workspace/details/[old]/payment.wmap"]).toContain(
      "url Back [../../overview.wmap]",
    );
  });

  it("everything when no map moved", async () => {
    const readFile = vi.spyOn(workspace.fs, "readFile");

    await move(["/workspace/details/notes.txt", "/workspace/details/readme.txt"]);

    expect(readFile).not.toHaveBeenCalled();
    expect(vscodeMock.appliedEdits()).toEqual([]);
    expect(vscodeMock.shownMessages()).toEqual([]);
    readFile.mockRestore();
  });
});

describe("miragon.wardleyMaps.updateLinksOnFileMove.enabled", () => {
  const renamed = ["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"] as [
    string,
    string,
  ];

  it.each([undefined, "prompt", "something else"])(
    "asks first (%s), naming how many maps change",
    async (value) => {
      vscodeMock.setConfiguration(SETTING, value);
      vscodeMock.answerMessage(UPDATE);

      await move(renamed);

      expect(vscodeMock.shownMessages()).toEqual([
        {
          message: "The move changes where the links in 2 maps lead. Update them?",
          options: { modal: true },
          items: [{ title: UPDATE }, { title: "Don't update", isCloseAffordance: true }],
        },
      ]);
      expect(Object.keys(editedTexts()).sort()).toEqual([
        "/second/shared.wmap",
        "/workspace/overview.wmap",
      ]);
    },
  );

  it("says 1 map for one", async () => {
    vscodeMock.setConfiguration(SETTING, "prompt");
    vscodeMock.answerMessage(UPDATE);

    await move(["/second/shared.wmap", "/second/common.wmap"]);

    expect(vscodeMock.shownMessages().map(({ message }) => message)).toEqual([
      "The move changes where the links in 1 map lead. Update them?",
    ]);
  });

  it.each(["Don't update", undefined])("changes nothing when the answer is %s", async (answer) => {
    vscodeMock.setConfiguration(SETTING, "prompt");
    vscodeMock.answerMessage(answer);

    await move(renamed);

    expect(vscodeMock.appliedEdits()).toEqual([]);
  });

  it("updates without asking when always", async () => {
    await move(renamed);

    expect(vscodeMock.shownMessages()).toEqual([]);
    expect(vscodeMock.appliedEdits()).toHaveLength(1);
  });

  it("neither searches nor asks nor updates when never", async () => {
    vscodeMock.setConfiguration(SETTING, "never");

    await move(renamed);

    expect(vscodeMock.findFilesCalls()).toEqual([]);
    expect(vscodeMock.shownMessages()).toEqual([]);
    expect(vscodeMock.appliedEdits()).toEqual([]);
  });
});

describe("registerLinkUpdates", () => {
  it("updates the links after VS Code renamed files, and stops once disposed", async () => {
    const registration = registerLinkUpdates();
    moveOnDisk("/workspace/details/payment.wmap", "/workspace/details/billing.wmap");

    vscodeMock.fireDidRenameFiles([
      ["/workspace/details/payment.wmap", "/workspace/details/billing.wmap"],
    ]);
    await vi.waitFor(() => expect(vscodeMock.appliedEdits()).toHaveLength(1));

    registration.dispose();
    vscodeMock.fireDidRenameFiles([
      ["/workspace/details/billing.wmap", "/workspace/details/payment.wmap"],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(vscodeMock.appliedEdits()).toHaveLength(1);
  });
});
