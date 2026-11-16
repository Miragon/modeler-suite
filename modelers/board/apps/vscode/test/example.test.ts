import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBoardText } from "@miragon/board-schema-model";
import { describe, expect, test } from "vitest";

import { EXAMPLE, type ExampleRepository } from "../src/example-files.js";
import { exampleBoardText, keptMessage, writeExample } from "../src/example.js";
import { createMemoryVsCode, MemoryUri, type MemoryVsCode } from "../src/files/memory-vscode.js";

/**
 * The example of "New Board from Example": that the host's bundle holds the folder
 * `modelers/board/example` as it is, and how it is written around a board file.
 */

const FOLDER = fileURLToPath(new URL("../../../example/", import.meta.url));

function filesBelow(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const onDisk = filesBelow(FOLDER)
  .map((path) => relative(FOLDER, path).split("\\").join("/"))
  .sort();

describe("the example inside the extension host", () => {
  test("is every file of the example folder, the board and what it shows, and no other", () => {
    expect(["example.board", ...Object.keys(EXAMPLE.files)].sort()).toEqual(onDisk);
  });

  test("has each file's bytes: every file of the folder is a text, which is how the bundle holds it", () => {
    const texts: Record<string, string> = { "example.board": EXAMPLE.board, ...EXAMPLE.files };
    for (const path of onDisk) {
      const bytes = readFileSync(join(FOLDER, path));
      expect(Buffer.from(texts[path] ?? "", "utf8").equals(bytes), path).toBe(true);
    }
  });

  test("names only files of the example in its board, each of which is in the bundle", () => {
    const parsed = parseBoardText(EXAMPLE.board);
    if (!parsed.ok) throw new Error(parsed.reason);
    const named = Object.values(parsed.snapshot.elements).flatMap((attrs) =>
      typeof attrs.file === "string" ? [attrs.file] : [],
    );
    expect(named.sort()).toEqual(Object.keys(EXAMPLE.files).sort());
  });
});

/** a small example: two files, a node for each, an arrow that quotes one, and a note */
const SMALL: ExampleRepository = {
  board: [
    '{"format":"structured-model","meta":{"title":"Example","version":1},"version":1}',
    '{"id":"e1","kind":"edge","label":"models/tea.owm","source":"n1","target":"n2"}',
    '{"id":"e2","kind":"edge","label":"reads","source":"n2","target":"n1"}',
    '{"file":"models/tea.owm","id":"n1","kind":"node","type":"model"}',
    '{"file":"assets/logo.svg","id":"n2","kind":"node","type":"image"}',
    '{"id":"n3","kind":"node","text":"## Where an edit goes\\n\\nInto the file under `models/`.\\n\\nThis browser keeps the files. **Reset the example** brings them back.\\n\\nBrowsers forget nothing.","type":"text"}',
    '{"file":"elsewhere/other.owm","id":"n4","kind":"node","type":"model"}',
    "",
  ].join("\n"),
  files: {
    "models/tea.owm": "title Tea\n",
    "models/team.tt": "team\n",
    "assets/logo.svg": "<svg/>",
    "about.md": "# About\n",
  },
};

describe("the example's board for the place it is written to", () => {
  test("is the example's own text at the root of a repository, but for what is true in a browser alone", () => {
    const text = exampleBoardText(SMALL, "");
    expect(text).toBe(
      SMALL.board.replace(
        "\\n\\nThis browser keeps the files. **Reset the example** brings them back.\\n\\nBrowsers forget nothing.",
        "",
      ),
    );
  });

  test("names each example file below the board's folder, in a node and in an arrow's label, and no other path", () => {
    const parsed = parseBoardText(exampleBoardText(SMALL, "docs/boards/"));
    if (!parsed.ok) throw new Error(parsed.reason);
    const { elements } = parsed.snapshot;
    expect(elements.n1?.file).toBe("docs/boards/models/tea.owm");
    expect(elements.n2?.file).toBe("docs/boards/assets/logo.svg");
    expect(elements.e1?.label).toBe("docs/boards/models/tea.owm");
    // a label that quotes no file, a file that is none of the example's, an element without either
    expect(elements.e2?.label).toBe("reads");
    expect(elements.n4?.file).toBe("elsewhere/other.owm");
    expect(Object.hasOwn(elements.n3 ?? {}, "file")).toBe(false);
    expect(Object.hasOwn(elements.n3 ?? {}, "label")).toBe(false);
  });

  test("says nothing of a browser or of a reset: the suite's example as VS Code writes it", () => {
    const text = exampleBoardText(EXAMPLE, "");
    expect(text).not.toMatch(/browser|Reset the example/i);
    // and all else of it is there: no line differs but a note that spoke of the browser
    const written = text.split("\n");
    const changed = EXAMPLE.board.split("\n").filter((line) => !written.includes(line));
    expect(changed.length).toBeLessThanOrEqual(1);
    for (const line of changed) expect(line).toMatch(/browser/i);
    expect(parseBoardText(text).ok).toBe(true);
  });

  test("fails with the reader's reason for an example that is no board", () => {
    expect(() => exampleBoardText({ board: "no board\n", files: {} }, "")).toThrow(
      "the example board cannot be read: line 1 is no JSON",
    );
  });
});

describe("the example written around a board file", () => {
  const REPO = { "/work/repo/.git/HEAD": "", "/work/repo/readme.md": "# Repo\n" };
  const write = (memory: MemoryVsCode, board: string) =>
    writeExample(memory.vscode, SMALL, MemoryUri.file(board));
  const fileOf = (memory: MemoryVsCode, board: string, id: string): unknown => {
    const parsed = parseBoardText(memory.disk.text(board) ?? "");
    return parsed.ok ? parsed.snapshot.elements[id]?.file : parsed.reason;
  };

  test("puts every file beside the board, in the folders the example has, and the board last", async () => {
    const memory = createMemoryVsCode(REPO, { workspaceFolders: ["/work/repo"] });
    expect(await write(memory, "/work/repo/example.board")).toEqual({ kept: [] });
    expect(memory.calls.writeFile).toEqual([
      "/work/repo/models/tea.owm",
      "/work/repo/models/team.tt",
      "/work/repo/assets/logo.svg",
      "/work/repo/about.md",
      "/work/repo/example.board",
    ]);
    // each folder of the example once, and none for a file that lies beside the board
    expect(memory.calls.createDirectory).toEqual(["/work/repo/models", "/work/repo/assets"]);
    expect(memory.disk.text("/work/repo/models/tea.owm")).toBe("title Tea\n");
    expect(memory.disk.text("/work/repo/assets/logo.svg")).toBe("<svg/>");
    expect(fileOf(memory, "/work/repo/example.board", "n1")).toBe("models/tea.owm");
  });

  test("names each file by its path from the repository's root, which is how a board finds it", async () => {
    const memory = createMemoryVsCode(REPO, { workspaceFolders: ["/work/repo"] });
    await write(memory, "/work/repo/docs/boards/example.board");
    expect(memory.disk.has("/work/repo/docs/boards/models/tea.owm")).toBe(true);
    expect(memory.disk.has("/work/repo/models/tea.owm")).toBe(false);
    expect(fileOf(memory, "/work/repo/docs/boards/example.board", "n1")).toBe(
      "docs/boards/models/tea.owm",
    );
  });

  test("takes the folder VS Code has open for the root where there is no repository, and the paths as they are outside both", async () => {
    const memory = createMemoryVsCode({ "/work/readme.md": "" }, { workspaceFolders: ["/work"] });
    await write(memory, "/work/play/example.board");
    expect(fileOf(memory, "/work/play/example.board", "n1")).toBe("play/models/tea.owm");
    await write(memory, "/downloads/example.board");
    expect(memory.disk.has("/downloads/models/tea.owm")).toBe(true);
    expect(fileOf(memory, "/downloads/example.board", "n1")).toBe("models/tea.owm");
    // and beside a board at the top of a disk
    await write(memory, "/example.board");
    expect(memory.disk.has("/models/tea.owm")).toBe(true);
    expect(memory.disk.has("/about.md")).toBe(true);
  });

  test("never writes over a file that is there: it is kept as it is and named", async () => {
    const memory = createMemoryVsCode(
      { ...REPO, "/work/repo/models/tea.owm": "title My own tea\n" },
      { workspaceFolders: ["/work/repo"] },
    );
    expect(await write(memory, "/work/repo/example.board")).toEqual({ kept: ["models/tea.owm"] });
    expect(memory.disk.text("/work/repo/models/tea.owm")).toBe("title My own tea\n");
    expect(memory.calls.writeFile).toEqual([
      "/work/repo/models/team.tt",
      "/work/repo/assets/logo.svg",
      "/work/repo/about.md",
      "/work/repo/example.board",
    ]);
    // a folder under an example file's name, and a link, are in the way as well
    const blocked = createMemoryVsCode(REPO, { workspaceFolders: ["/work/repo"] });
    blocked.disk.folder("/work/repo/models/tea.owm");
    blocked.disk.link("/work/repo/assets/logo.svg", "/work/repo/readme.md");
    expect(await write(blocked, "/work/repo/example.board")).toEqual({
      kept: ["models/tea.owm", "assets/logo.svg"],
    });
    expect(blocked.disk.text("/work/repo/readme.md")).toBe("# Repo\n");
  });

  test("writes no board where a file of the example could not be written", async () => {
    const memory = createMemoryVsCode(REPO, { workspaceFolders: ["/work/repo"] });
    const { writeFile } = memory.vscode.workspace.fs;
    memory.vscode.workspace.fs.writeFile = (uri, content) =>
      uri.path.endsWith("logo.svg")
        ? Promise.reject(new Error("no space left"))
        : writeFile(uri, content);
    await expect(write(memory, "/work/repo/example.board")).rejects.toThrow("no space left");
    expect(memory.disk.has("/work/repo/example.board")).toBe(false);
  });
});

describe("what a person is told about files that were there", () => {
  test("is nothing where every file was written", () => {
    expect(keptMessage([])).toBeUndefined();
  });

  test("names one file, and up to three of several with the number of the rest", () => {
    expect(keptMessage(["models/tea.owm"])).toBe(
      "models/tea.owm was already there. It was left as it is, and the board shows it.",
    );
    expect(keptMessage(["a.owm", "b.tt"])).toBe(
      "2 files of the example were already there: a.owm, b.tt. They were left as they are, and the board shows them.",
    );
    expect(keptMessage(["a.owm", "b.tt", "c.cm"])).toBe(
      "3 files of the example were already there: a.owm, b.tt, c.cm. They were left as they are, and the board shows them.",
    );
    expect(keptMessage(["a.owm", "b.tt", "c.cm", "d.vc", "e.c4"])).toBe(
      "5 files of the example were already there: a.owm, b.tt, c.cm and 2 more. They were left as they are, and the board shows them.",
    );
  });
});
