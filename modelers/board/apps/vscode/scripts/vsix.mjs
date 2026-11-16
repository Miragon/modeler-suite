import { inflateRawSync } from "node:zlib";

/**
 * What a packed extension holds, read from the VSIX itself. A VSIX is a zip archive whose files
 * lie under `extension/`; vsce renames the README, the CHANGELOG and the LICENSE on the way in
 * (`readme.md`, `changelog.md`, `LICENSE.txt`), so the papers are looked for whatever their case.
 */

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const STORED = 0;
const DEFLATED = 8;

/**
 * The files of a zip archive, from its central directory.
 *
 * @param {Buffer} archive
 * @returns {{ names: string[], read(name: string): Buffer }}
 */
export function zipEntries(archive) {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== END_OF_DIRECTORY) end -= 1;
  if (end < 0) throw new Error("not a zip archive: it has no end of central directory");
  /** @type {Map<string, { method: number, size: number, header: number }>} */
  const entries = new Map();
  let at = archive.readUInt32LE(end + 16);
  for (let index = 0; index < archive.readUInt16LE(end + 10); index += 1) {
    if (archive.readUInt32LE(at) !== DIRECTORY_ENTRY) throw new Error("a broken zip directory");
    const nameLength = archive.readUInt16LE(at + 28);
    entries.set(archive.toString("utf8", at + 46, at + 46 + nameLength), {
      method: archive.readUInt16LE(at + 10),
      size: archive.readUInt32LE(at + 20),
      header: archive.readUInt32LE(at + 42),
    });
    at += 46 + nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (entry === undefined) throw new Error(`the archive holds no ${name}`);
      const { method, size, header } = entry;
      const start =
        header + 30 + archive.readUInt16LE(header + 26) + archive.readUInt16LE(header + 28);
      const data = archive.subarray(start, start + size);
      if (method === STORED) return data;
      if (method === DEFLATED) return inflateRawSync(data);
      throw new Error(`${name} is packed with method ${method}, which this reader does not know`);
    },
  };
}

/** What a VSIX must hold beside its bundles, by the name vsce gives each. */
export const PAPERS = ["package.json", "readme.md", "changelog.md", "LICENSE.txt"];

/** What a VSIX must not hold: sources, tests, tooling, dependencies and source maps. */
export const LEFT_OUT = /^(?:node_modules|src|test|test-smoke|scripts)\/|\.map$|\.tsbuildinfo$/;

/**
 * @param {readonly string[]} names the names of a VSIX's entries
 * @param {{ icon?: string | undefined }} manifest the extension's manifest
 * @returns {string[]} the papers the VSIX lacks and the files it should have left out
 */
export function vsixProblems(names, manifest) {
  const files = names
    .filter((name) => name.startsWith("extension/"))
    .map((name) => name.slice("extension/".length));
  const lower = files.map((file) => file.toLowerCase());
  const wanted = [...PAPERS, ...(manifest.icon === undefined ? [] : [manifest.icon])];
  return [
    ...wanted
      .filter((paper) => !lower.includes(paper.toLowerCase()))
      .map((paper) => `it holds no ${paper}`),
    ...files
      .filter((file) => LEFT_OUT.test(file))
      .map((file) => `it holds ${file}, which .vscodeignore should leave out`),
  ];
}
