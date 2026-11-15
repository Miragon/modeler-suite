import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bySuffix } from "@miragon/board-files";
import {
  encodeBoard,
  isEdgeAttrs,
  isNodeAttrs,
  parseBoardText,
  type NodeAttrs,
} from "@miragon/board-schema-model";
import { SUITE_SUFFIXES } from "board-suite-editors/suffixes";
import { describe, expect, test } from "vitest";
import { EXAMPLE } from "../src/example.js";

const FOLDER = fileURLToPath(new URL("../../../example/", import.meta.url));

/** every file below a folder, as a path with forward slashes relative to it */
function filesBelow(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path));

const repositoryFiles = filesBelow(FOLDER).filter((file) => file !== "example.board");
const boardFile = readFileSync(join(FOLDER, "example.board"), "utf8");
const parsed = parseBoardText(boardFile);
if (!parsed.ok) throw new Error(`example.board is no board: ${parsed.reason}`);
const elements = Object.values(parsed.snapshot.elements);
const nodes = elements.filter(isNodeAttrs);
const filesOf = (type: NodeAttrs["type"]): string[] =>
  nodes.flatMap((node) => (node.type === type ? [node.file ?? ""] : [])).sort();

describe("example.board", () => {
  test("is in the canonical form: the board writes the same bytes back", () => {
    expect(encodeBoard(parsed.snapshot)).toBe(boardFile);
  });

  test("holds seven models, two notes, a group, a picture and an arrow, and nothing else", () => {
    const count = (type: NodeAttrs["type"]): number =>
      nodes.filter((node) => node.type === type).length;
    const arrows = elements.filter(isEdgeAttrs);

    expect({
      model: count("model"),
      text: count("text"),
      group: count("group"),
      image: count("image"),
      arrows: arrows.length,
      elements: elements.length,
    }).toEqual({ model: 7, text: 2, group: 1, image: 1, arrows: 1, elements: 12 });
    // an arrow whose end is no node stays off the canvas
    const ids = new Set(Object.keys(parsed.snapshot.elements));
    for (const arrow of arrows) {
      expect(ids.has(arrow.source) && ids.has(arrow.target), JSON.stringify(arrow)).toBe(true);
    }
  });

  test("has one model per notation of the suite", () => {
    const notations = filesOf("model").map((file) => bySuffix(SUITE_SUFFIXES, file)?.notation);

    expect([...notations].sort()).toEqual(SUITE_SUFFIXES.map((entry) => entry.notation).sort());
  });

  test("names only files that are in the folder", () => {
    const inFolder = new Set(filesBelow(FOLDER));
    const named = [...filesOf("model"), ...filesOf("image")];

    expect(named.filter((file) => !inFolder.has(file))).toEqual([]);
    expect(filesOf("image").every((file) => file.startsWith("assets/"))).toBe(true);
  });

  test("keeps every node on whole numbers, and every member inside a node that is a group", () => {
    const groups = new Set(
      Object.entries(parsed.snapshot.elements).flatMap(([id, attrs]) =>
        isNodeAttrs(attrs) && attrs.type === "group" ? [id] : [],
      ),
    );
    for (const node of nodes) {
      expect(
        [node.x, node.y, node.width, node.height].every(Number.isInteger),
        JSON.stringify(node),
      ).toBe(true);
      if (node.parent !== undefined) expect(groups.has(node.parent), node.parent).toBe(true);
    }
  });
});

describe("the example as the app reads it", () => {
  test("the board text is the file's", () => {
    expect(EXAMPLE.board).toBe(boardFile);
  });

  // a file no glob of example.ts reads (a picture that is no SVG) fails here
  test("the repository is every other file of the folder, under the path a node stores", () => {
    expect(Object.keys(EXAMPLE.files).sort()).toEqual(repositoryFiles);
    expect(repositoryFiles.length).toBeGreaterThan(0);
  });

  test.each(repositoryFiles)("%s has the bytes of the file", (path) => {
    const file = EXAMPLE.files[path];
    const bytes = typeof file === "string" ? new TextEncoder().encode(file) : file?.bytes;

    expect(bytes).toEqual(bytesOf(join(FOLDER, path)));
    expect(typeof file === "string").toBe(path.startsWith("models/"));
  });

  test("the picture carries the type an <img> draws it by", () => {
    const picture = EXAMPLE.files["assets/miragon-komet-blau.svg"];

    expect(typeof picture === "string" ? undefined : picture?.mime).toBe("image/svg+xml");
  });
});
