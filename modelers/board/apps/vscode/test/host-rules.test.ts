import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * What the extension host must not do, read from its sources: every source of `src` outside
 * `src/webview`, which is a page and another work's.
 */

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === "webview" ? [] : sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

/** the code of a file without its comments, which may name what the code must not do */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const HOST = sources(SRC).map((path) => ({ file: relative(SRC, path), code: codeOf(path) }));
const using = (pattern: RegExp): string[] =>
  HOST.filter(({ code }) => pattern.test(code)).map(({ file }) => file);

describe("the sources of the extension host", () => {
  test("are found: the entry, the editor, its options and the files of a workspace", () => {
    expect(HOST.map(({ file }) => file).sort()).toEqual([
      "boardEditor.ts",
      "boardEditorOptions.ts",
      "extension.ts",
      "files/backend.ts",
      "files/bytes.ts",
      "files/documents.ts",
      "files/file-index.ts",
      "files/memory-vscode.ts",
      "files/root.ts",
      "files/vscode-like.ts",
    ]);
  });

  test("reach a file through VS Code alone: no module of Node, so that a remote window keeps its files", () => {
    expect(using(/from\s+"node:|require\(/)).toEqual([]);
    expect(using(/from\s+"(fs|path|os|child_process)"/)).toEqual([]);
  });

  test("never read a URI's fsPath; the one mention is the fake's own member", () => {
    expect(using(/\.fsPath\b/)).toEqual([]);
    expect(using(/\bfsPath\b/)).toEqual(["files/memory-vscode.ts"]);
  });

  test("never save a document, and write no file but a new picture", () => {
    expect(using(/\.save\(|saveAll|workspace\.save\b/)).toEqual([]);
    // the fake implements writeFile; the one caller is the store of a new picture
    expect(using(/\.writeFile\(/)).toEqual(["files/bytes.ts"]);
  });

  test("import vscode itself only where the extension is registered: the files run on the structural type", () => {
    expect(using(/from\s+"vscode"/).sort()).toEqual(["boardEditor.ts", "extension.ts"]);
  });
});
