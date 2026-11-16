import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import type { BuildOptions, Metafile } from "esbuild";
import { build } from "esbuild";
import { beforeAll, describe, expect, test } from "vitest";

/**
 * The third-party notices of the extension as `esbuild.config.mjs` builds it for the VSIX, and
 * the reader of a packed VSIX that `scripts/check-notices.mjs` stands on. The generator and the
 * check have their own tests in `apps/editors/test/notices.test.ts`; here they run on the two
 * production bundles of this extension, built in memory.
 */

const APP = fileURLToPath(new URL("../", import.meta.url));
const NOTICES = "THIRD_PARTY_NOTICES.md";
const LEGAL_FILE = "dagre.esm.js.LEGAL.txt";

interface Bundled {
  name: string;
  version: string;
  suite: boolean;
  licence: string | undefined;
}

interface Notices {
  text: string;
  beside: Record<string, string>;
  packages: Bundled[];
  works: { work: { name: string; licence: string }; carriers: string[] }[];
  problems: string[];
}

interface Helpers {
  bundleOptions(mode: { production: boolean }): { host: BuildOptions; web: BuildOptions };
  metafileInputs(metafile: Metafile, workingDirectory: string): string[];
  composeNotices(build: {
    product: string;
    files: readonly string[];
    outputs: Record<string, string>;
  }): Notices;
  noticesProblems(build: {
    notices: string | undefined;
    texts: Record<string, string>;
    names: readonly string[];
    bundled: readonly Bundled[];
    works?: readonly { name: string; licence: string }[] | undefined;
  }): string[];
  zipEntries(archive: Buffer): { names: string[]; read(name: string): Buffer };
  vsixProblems(names: readonly string[], manifest: { icon?: string | undefined }): string[];
}

/** The build's modules are untyped JavaScript, loaded by Node and not compiled by Vite. */
async function helpers(): Promise<Helpers> {
  const load = (path: string): Promise<Record<string, unknown>> =>
    import(/* @vite-ignore */ new URL(path, import.meta.url).href) as Promise<
      Record<string, unknown>
    >;
  const modules = await Promise.all([
    load("../esbuild.config.mjs"),
    load("../../editors/build/notices-build.mjs"),
    load("../../editors/build/notices.mjs"),
    load("../../editors/build/notices-check.mjs"),
    load("../scripts/vsix.mjs"),
  ]);
  return Object.assign({}, ...modules) as Helpers;
}

describe("the notices of the extension's two production bundles", () => {
  let use: Helpers;
  let notices: Notices;
  let texts: Record<string, string>;
  let names: string[];

  beforeAll(async () => {
    use = await helpers();
    const { host, web } = use.bundleOptions({ production: true });
    const files: string[] = [];
    texts = {};
    names = [];
    for (const options of [host, web]) {
      const result = await build({
        ...options,
        write: false,
        metafile: true,
        logLevel: "silent",
        absWorkingDir: APP,
      });
      files.push(...use.metafileInputs(result.metafile, APP));
      for (const { path, text } of result.outputFiles) {
        const name = path.slice(`${APP}dist/`.length);
        names.push(name);
        if (/\.(cjs|js|css)$/.test(name)) texts[name] = text;
      }
    }
    notices = use.composeNotices({ product: "The Board Modeler extension", files, outputs: texts });
  }, 120_000);

  test("are whole: every licence is one the suite ships and has its text", () => {
    expect(notices.problems).toEqual([]);
    expect(notices.packages.filter(({ licence }) => licence === undefined)).toEqual([]);
  });

  test("list the host bundle's packages and the page's", () => {
    const bundled = notices.packages.map(({ name }) => name);
    expect(bundled).toEqual(
      expect.arrayContaining([
        // the extension host
        "board-modeler",
        "@miragon/board-files",
        "@miragon/modeler-shell",
        // the page
        "react",
        "react-dom",
        "@xyflow/react",
        "yjs",
        "lucide-react",
        "markdown-it",
        "dompurify",
        "zod",
        "diagram-js",
        "@dagrejs/dagre",
        "@dagrejs/graphlib",
        "@fontsource-variable/geist",
        "@fontsource-variable/geist-mono",
      ]),
    );
    expect(notices.works.map(({ work }) => work.name)).toEqual([
      "Lucide",
      "Material Icons",
      "Tailwind CSS preflight",
    ]);
  });

  test("hand out the licence file the page's script names, to lie beside it in dist", () => {
    expect(texts["webview.js"]).toContain(`please see ${LEGAL_FILE}`);
    expect(Object.keys(notices.beside)).toEqual([LEGAL_FILE]);
  });

  test("pass the check with what the build writes beside the bundles, and fail without", () => {
    const written = [...names, NOTICES, ...Object.keys(notices.beside)];
    const whole = {
      notices: notices.text,
      texts,
      names: written,
      bundled: notices.packages,
      works: notices.works.map(({ work }) => work),
    };
    expect(use.noticesProblems(whole)).toEqual([]);
    expect(use.noticesProblems({ ...whole, names: [...names, NOTICES] })).toEqual([
      `webview.js names the licence file ${LEGAL_FILE}, and the build holds no ${LEGAL_FILE}`,
    ]);
    expect(use.noticesProblems({ ...whole, notices: undefined })).toEqual([
      "the build holds no third-party notices",
    ]);
  });

  test("fail the check without the section of a font package or of a copied work", () => {
    const written = [...names, NOTICES, ...Object.keys(notices.beside)];
    const without = (heading: string): string => {
      const start = notices.text.indexOf(heading);
      if (start === -1) throw new Error(`the notices have no section that starts ${heading}`);
      return (
        notices.text.slice(0, start) + notices.text.slice(notices.text.indexOf("\n## ", start) + 1)
      );
    };
    const problems = (text: string): string[] =>
      use.noticesProblems({
        notices: text,
        texts,
        names: written,
        bundled: notices.packages,
        works: notices.works.map(({ work }) => work),
      });
    const geist = notices.packages.find(({ name }) => name === "@fontsource-variable/geist");
    // a font is no script: the measurement of the bundles names it, a source map would not
    expect(problems(without("## @fontsource-variable/geist "))).toEqual([
      `@fontsource-variable/geist ${geist?.version} is in the build and the notices have no ` +
        "section for it",
    ]);
    for (const work of ["Lucide", "Material Icons", "Tailwind CSS preflight"]) {
      expect(problems(without(`## ${work} (`))).toEqual([
        `${work} is copied into a source of the build and the notices have no section for it`,
      ]);
    }
  });
});

/** A zip archive as vsce writes a VSIX: deflated entries, a central directory, no zip64. */
function zip(files: Record<string, { text: string; deflate: boolean }>): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [name, { text, deflate }] of Object.entries(files)) {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(Buffer.byteLength(name), 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(Buffer.byteLength(name), 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, Buffer.from(name), data);
    directory.push(entry, Buffer.from(name));
    offset += 30 + Buffer.byteLength(name) + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end]);
}

describe("a packed VSIX, as the notices check reads it", () => {
  const PAPERS = [
    "extension.vsixmanifest",
    "extension/package.json",
    "extension/readme.md",
    "extension/changelog.md",
    "extension/LICENSE.txt",
    "extension/icon.png",
    "extension/dist/extension.cjs",
    `extension/dist/${NOTICES}`,
  ];

  test("is read entry by entry, packed or stored", async () => {
    const { zipEntries } = await helpers();
    const text = "# Third-party notices\n".repeat(40);
    const archive = zipEntries(
      zip({
        "extension/package.json": { text: '{"name":"board-modeler"}', deflate: false },
        [`extension/dist/${NOTICES}`]: { text, deflate: true },
      }),
    );
    expect(archive.names).toEqual(["extension/package.json", `extension/dist/${NOTICES}`]);
    expect(archive.read("extension/package.json").toString()).toBe('{"name":"board-modeler"}');
    expect(archive.read(`extension/dist/${NOTICES}`).toString()).toBe(text);
    expect(() => archive.read("extension/src/extension.ts")).toThrow(/holds no/);
    expect(() => zipEntries(Buffer.from("no archive at all, only some text"))).toThrow(
      /not a zip archive/,
    );
  });

  test("has its papers and the icon the manifest names", async () => {
    const { vsixProblems } = await helpers();
    expect(vsixProblems(PAPERS, { icon: "icon.png" })).toEqual([]);
    expect(
      vsixProblems(
        PAPERS.filter((name) => !/changelog|icon|LICENSE/.test(name)),
        { icon: "icon.png" },
      ),
    ).toEqual(["it holds no changelog.md", "it holds no LICENSE.txt", "it holds no icon.png"]);
    expect(
      vsixProblems(
        PAPERS.filter((name) => name !== "extension/icon.png"),
        {},
      ),
    ).toEqual([]);
  });

  test("holds no source, test, tooling, dependency or source map", async () => {
    const { vsixProblems } = await helpers();
    const extra = [
      "extension/src/extension.ts",
      "extension/test/papers.test.ts",
      "extension/scripts/check-notices.mjs",
      "extension/node_modules/esbuild/package.json",
      "extension/dist/webview.js.map",
    ];
    expect(vsixProblems([...PAPERS, ...extra], { icon: "icon.png" })).toEqual(
      extra.map(
        (name) =>
          `it holds ${name.slice("extension/".length)}, which .vscodeignore should leave out`,
      ),
    );
  });
});
