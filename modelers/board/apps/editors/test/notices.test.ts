import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild, type Metafile } from "esbuild";
import { build as viteBuild, type Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sourceAliases } from "../build/aliases.mjs";
import { cssBaseAliases } from "../build/css-base.mjs";
import { webviewBundle } from "../build/esbuild.mjs";
import { metafileInputs, noticesPlugin, writeBundleNotices } from "../build/notices-build.mjs";
import {
  checkBuildNotices,
  noticesProblems,
  noticesSections,
  sourceMapSources,
} from "../build/notices-check.mjs";
import {
  bundledPackages,
  composeNotices,
  COPIED_WORKS,
  copiedWorks,
  INLINED_BY_UPSTREAM,
  legalFilesBeside,
  licenceTaken,
  namedLegalFiles,
  NOTICES_FILE,
  packageDirectory,
  SHIPPED_LICENCES,
  SUPPLIED_TEXTS,
  BPMN_IO_LICENCE,
} from "../build/notices.mjs";

/**
 * The third-party notices of a build (`build/notices.mjs`), the two bundlers' ways to them
 * (`build/notices-build.mjs`) and the check of a build (`build/notices-check.mjs`): on trees the
 * tests write, where a licence is missing or is one the suite does not ship, and on a real page
 * of the board with the seven notations in it, built in memory.
 */

const BOARD = fileURLToPath(new URL("../../../", import.meta.url));
const EDITORS = join(BOARD, "apps/editors");
const WEBVIEW_APP = join(BOARD, "apps/vscode");
const REPOSITORY = fileURLToPath(new URL("../../../../../", import.meta.url));
const MODULES = join(REPOSITORY, "node_modules");
const DAGRE = join(MODULES, "@dagrejs/dagre/dist/dagre.esm.js");
const LEGAL_FILE = "dagre.esm.js.LEGAL.txt";

const MIT = "MIT License\n\nCopyright (c) a test\n\nPermission is hereby granted.";

const trees: string[] = [];
afterAll(() => {
  for (const root of trees) rmSync(root, { recursive: true, force: true });
});

/** A folder of the test's own with these files in it, removed when the file is done. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "board-notices-"));
  trees.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const manifest = (fields: Record<string, unknown>): string => JSON.stringify(fields);

describe("the package a bundled file belongs to", () => {
  it("is the last node_modules folder on its path, with its scope", () => {
    expect(packageDirectory("/x/node_modules/a/node_modules/@scope/b/lib/index.js")).toEqual({
      directory: "/x/node_modules/a/node_modules/@scope/b",
      suite: false,
    });
    expect(packageDirectory("/x/node_modules/a/index.js")).toEqual({
      directory: "/x/node_modules/a",
      suite: false,
    });
  });

  it("is not a folder inside a package that has a manifest of its own", () => {
    // preact/hooks and htm/preact each carry a package.json that names no licence
    expect(existsSync(join(MODULES, "preact/hooks/package.json"))).toBe(true);
    expect(packageDirectory(join(MODULES, "preact/hooks/dist/hooks.module.js"))).toEqual({
      directory: join(MODULES, "preact"),
      suite: false,
    });
  });

  it("is for a source of the suite the nearest workspace above it", () => {
    expect(packageDirectory(join(BOARD, "packages/renderer/src/canvas/board.tsx"))).toEqual({
      directory: join(BOARD, "packages/renderer"),
      suite: true,
    });
  });

  it("is nothing for a file that lies in no package", () => {
    const root = tree({ "loose.js": "export {};" });
    expect(packageDirectory(join(root, "loose.js"))).toBeUndefined();
  });
});

describe("the licence a package is taken under", () => {
  it.each([
    ["MIT", "MIT"],
    ["OFL-1.1", "OFL-1.1"],
    ["(MPL-2.0 OR Apache-2.0)", "Apache-2.0"],
    ["GPL-3.0-only OR BSD-3-Clause", "BSD-3-Clause"],
    ["GPL-3.0-only", undefined],
    ["MIT AND GPL-2.0", undefined],
    [undefined, undefined],
  ])("%s is taken under %s", (declared, taken) => {
    expect(licenceTaken(declared)).toBe(taken);
  });

  it("ships permissive licences, the fonts' one and bpmn-js's, and no copyleft", () => {
    expect([...SHIPPED_LICENCES].sort()).toEqual(
      [
        "0BSD",
        "Apache-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "CC0-1.0",
        "ISC",
        BPMN_IO_LICENCE,
        "MIT",
        "OFL-1.1",
      ].sort(),
    );
  });
});

describe("the packages of a build", () => {
  // a notice that quotes a fenced text of its own, with a line that reads like a section
  const NOTICE = "alpha stands on work of others:\n```\n## inner 9.9.9 (GPL-3.0-only)\n```";
  const root = tree({
    "node_modules/alpha/package.json": manifest({
      name: "alpha",
      version: "1.0.0",
      license: "MIT",
    }),
    "node_modules/alpha/LICENSE": `${MIT.replace(/\n/g, "\r\n")}\r\n`,
    "node_modules/alpha/NOTICE": NOTICE,
    "node_modules/alpha/index.js": "",
    "node_modules/alpha/lib/deep.js": "",
    "node_modules/@scope/beta/package.json": manifest({
      name: "@scope/beta",
      version: "2.0.0",
      license: "(MPL-2.0 OR Apache-2.0)",
    }),
    "node_modules/@scope/beta/LICENSE": "Apache License\nVersion 2.0",
    "node_modules/@scope/beta/LICENSE-MPL": "Mozilla Public License",
    "node_modules/@scope/beta/index.js": "",
    "node_modules/Zulu/package.json": manifest({
      name: "Zulu",
      version: "0.1.0",
      licenses: [{ type: "ISC" }],
    }),
    "node_modules/Zulu/license": "ISC License",
    "node_modules/Zulu/index.js": "",
    "node_modules/alpha/node_modules/alpha/package.json": manifest({
      name: "alpha",
      version: "0.9.0",
      license: "MIT",
    }),
    "node_modules/alpha/node_modules/alpha/LICENSE.md": MIT,
    "node_modules/alpha/node_modules/alpha/index.js": "",
    "node_modules/copyleft/package.json": manifest({
      name: "copyleft",
      version: "3.0.0",
      license: "GPL-3.0-only",
    }),
    "node_modules/copyleft/COPYING": "GNU GENERAL PUBLIC LICENSE",
    "node_modules/copyleft/index.js": "",
    "node_modules/silent/package.json": manifest({ name: "silent", version: "1.0.0" }),
    "node_modules/silent/index.js": "",
  });
  const file = (path: string): string => join(root, "node_modules", path);
  const permissive = [
    file("alpha/lib/deep.js"),
    file("Zulu/index.js"),
    file("alpha/index.js"),
    file("@scope/beta/index.js"),
    file("alpha/node_modules/alpha/index.js"),
  ];

  it("names each once per version, in code point order whatever the order of the files", () => {
    const { packages, problems } = bundledPackages(permissive);
    expect(packages.map(({ name, version }) => `${name}@${version}`)).toEqual([
      "@scope/beta@2.0.0",
      "Zulu@0.1.0",
      "alpha@0.9.0",
      "alpha@1.0.0",
    ]);
    expect(problems).toEqual([]);
    expect(bundledPackages([...permissive].reverse()).packages).toEqual(packages);
  });

  it("quotes every licence and notice file of a package, with Unix line ends", () => {
    const alpha = bundledPackages(permissive).packages.find(({ version }) => version === "1.0.0");
    expect(alpha?.texts).toEqual([
      { file: "LICENSE", text: MIT },
      { file: "NOTICE", text: NOTICE },
    ]);
  });

  it("are quoted in the notices so that no quoted text ends its own quote", () => {
    const { text, problems } = composeNotices({ product: "A build", files: permissive });
    expect(problems).toEqual([]);
    expect(text).toContain(`\`NOTICE\`:\n\n\`\`\`\`text\n${NOTICE}\n\`\`\`\`\n`);
    expect(noticesSections(text).map(({ name, version }) => `${name}@${version}`)).toEqual([
      "@scope/beta@2.0.0",
      "Zulu@0.1.0",
      "alpha@0.9.0",
      "alpha@1.0.0",
    ]);
    expect(noticesProblems({ notices: text, texts: {}, names: [], bundled: [] })).toEqual([]);
  });

  it("takes a dual licence under the one the suite ships, and leaves the other's text out", () => {
    const beta = bundledPackages(permissive).packages.find(({ name }) => name === "@scope/beta");
    expect(beta).toMatchObject({ declared: "(MPL-2.0 OR Apache-2.0)", licence: "Apache-2.0" });
    expect(beta?.texts.map(({ file: name }) => name)).toEqual(["LICENSE"]);
  });

  it("reads the licence a manifest names in npm's old spelling", () => {
    const zulu = bundledPackages(permissive).packages.find(({ name }) => name === "Zulu");
    expect(zulu).toMatchObject({ declared: "ISC", licence: "ISC" });
  });

  it("refuses a licence the suite does not ship", () => {
    const { packages, problems } = bundledPackages([file("copyleft/index.js")]);
    expect(packages[0]).toMatchObject({ declared: "GPL-3.0-only", licence: undefined });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^copyleft 3\.0\.0 is under GPL-3\.0-only, which the suite does not ship/,
    );
  });

  it("refuses a package that names no licence and has no licence file", () => {
    expect(bundledPackages([file("silent/index.js")]).problems).toEqual([
      "silent 1.0.0 names no licence in its manifest",
      "silent 1.0.0 has no licence file to quote",
    ]);
  });

  it("reads a manifest that names its licence in no SPDX words by the text it ships", () => {
    const words = tree({
      "node_modules/viewer/package.json": manifest({
        name: "viewer",
        version: "18.0.0",
        license: "SEE LICENSE IN LICENSE",
      }),
      "node_modules/viewer/LICENSE":
        "Copyright (c) 2014-present Camunda Services GmbH\n\nPermission is hereby granted.\n\n" +
        "The source code responsible for displaying the bpmn.io project watermark MUST NOT be removed.",
      "node_modules/viewer/index.js": "",
      "node_modules/colours/package.json": manifest({
        name: "colours",
        version: "0.6.2",
        license: "CC0",
      }),
      "node_modules/colours/LICENSE.md": "CC0 1.0 Universal\n\nStatement of Purpose",
      "node_modules/colours/index.js": "",
      "node_modules/elsewhere/package.json": manifest({
        name: "elsewhere",
        version: "1.0.0",
        license: "SEE LICENSE IN LICENSE",
      }),
      "node_modules/elsewhere/LICENSE": "All rights reserved.",
      "node_modules/elsewhere/index.js": "",
    });
    const { packages, problems } = bundledPackages(
      ["viewer", "colours", "elsewhere"].map((name) =>
        join(words, "node_modules", name, "index.js"),
      ),
    );
    expect(packages.map(({ name, declared, licence }) => [name, declared, licence])).toEqual([
      ["colours", "CC0-1.0", "CC0-1.0"],
      ["elsewhere", "SEE LICENSE IN LICENSE", undefined],
      ["viewer", BPMN_IO_LICENCE, BPMN_IO_LICENCE],
    ]);
    expect(problems).toEqual([
      "elsewhere 1.0.0 is under SEE LICENSE IN LICENSE, which the suite does not ship " +
        `(${SHIPPED_LICENCES.join(", ")})`,
    ]);
  });

  it("quotes the repository's text for a package that ships none, and says so", () => {
    const shipsNone = join(MODULES, "@bpmn-io/semver-compat");
    expect(readdirSync(shipsNone).filter((name) => /licen[cs]e/i.test(name))).toEqual([]);
    const files = [join(shipsNone, "dist/index.js")];
    const { packages, problems } = bundledPackages(files);
    expect(problems).toEqual([]);
    expect(packages[0]?.texts.map(({ file: name }) => name)).toEqual([
      SUPPLIED_TEXTS["@bpmn-io/semver-compat"]?.file,
    ]);
    expect(packages[0]?.texts[0]?.text).toMatch(/^The MIT License \(MIT\)\n\nCopyright/);
    const { text } = composeNotices({ product: "A build", files });
    expect(text).toContain(
      `The package ships no licence text: ${SUPPLIED_TEXTS["@bpmn-io/semver-compat"]?.from}.`,
    );
  });

  it("supplies a text only for a package that ships none, from a file it keeps", () => {
    for (const [name, { file }] of Object.entries(SUPPLIED_TEXTS)) {
      const directory = join(MODULES, name);
      expect(existsSync(join(directory, "package.json")), name).toBe(true);
      expect(readdirSync(directory).filter((one) => /^(licen[cs]e|copying)/i.test(one))).toEqual(
        [],
      );
      expect(existsSync(join(EDITORS, "build/licences", file)), file).toBe(true);
    }
  });

  it("names a package that an upstream build holds inside its own file", () => {
    expect(INLINED_BY_UPSTREAM["@dagrejs/dagre"]).toEqual(["@dagrejs/graphlib"]);
    // dagre's ESM build imports nothing: graphlib is in it, and no bundler names graphlib
    expect(readFileSync(DAGRE, "utf8")).not.toMatch(/\bfrom\s*["']|\brequire\(/);
    const { packages, problems } = bundledPackages([DAGRE]);
    expect(packages.map(({ name, within }) => [name, within])).toEqual([
      ["@dagrejs/dagre", undefined],
      ["@dagrejs/graphlib", "@dagrejs/dagre"],
    ]);
    expect(problems).toEqual([]);
  });

  it("takes a workspace of the suite under the LICENSE above it, named in its manifest or not", () => {
    const { packages, problems } = bundledPackages([
      join(BOARD, "apps/webapp/src/main.ts"),
      join(BOARD, "packages/files/src/index.ts"),
      join(REPOSITORY, "packages/shell/src/index.ts"),
    ]);
    expect(problems).toEqual([]);
    expect(packages.map(({ name, suite, licence }) => [name, suite, licence])).toEqual([
      ["@miragon/board-files", true, "MIT"],
      ["@miragon/board-webapp", true, "MIT"],
      ["@miragon/modeler-shell", true, "MIT"],
    ]);
    const shell = packages.find(({ name }) => name === "@miragon/modeler-shell");
    // the shell keeps the notices of the Lucide geometry it inlines in its own folder
    expect(shell?.texts.map(({ file: name }) => name)).toEqual([
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ]);
  });
});

describe("the licence files a bundle names", () => {
  it("are found in a built text by their name", () => {
    expect(
      namedLegalFiles(
        `var a;/*! For license information please see ${LEGAL_FILE} */\n` +
          "/*! see vendor.js.LICENSE.txt */ /* the LICENSE file in the root of this source tree */",
      ),
    ).toEqual([LEGAL_FILE, "vendor.js.LICENSE.txt"]);
    expect(namedLegalFiles("/* @license React, see LICENSE */")).toEqual([]);
  });

  it("lie beside the bundled file whose name they carry", () => {
    expect(legalFilesBeside([DAGRE])).toEqual([
      { name: LEGAL_FILE, source: `${DAGRE}.LEGAL.txt`, owner: "@dagrejs/dagre" },
    ]);
    // dagre ships one such file per build of its own; only the bundled build's is taken
    expect(existsSync(join(dirname(DAGRE), "dagre.cjs.LEGAL.txt"))).toBe(true);
  });
});

describe("the works copied into sources of the suite", () => {
  const LUCIDE_COMMENT =
    "/*! @fake/renderer icon geometry\n * Lucide (lucide-static 1.59.0) @license ISC\n" +
    " * Copyright (c) 2026 Lucide Icons and Contributors */";
  const root = tree({
    "suite/package.json": manifest({ name: "@fake/renderer", version: "0.0.0", license: "MIT" }),
    "suite/LICENSE": MIT,
    "suite/src/icons.ts": `${LUCIDE_COMMENT}\nexport const plus = "M5 12h14";\n`,
    "suite/src/plain.ts": "/** Copied unchanged from lucide-static 1.59.0. */\nexport {};\n",
    "suite/src/base.css":
      "/*! tailwindcss v4.3.5 (preflight.css) | MIT License */\n* { margin: 0 }\n",
    "suite/src/own.ts": "/** The board's own code. */\nexport {};\n",
    "other/package.json": manifest({ name: "@fake/other", version: "0.0.0", license: "MIT" }),
    "other/LICENSE": MIT,
    "other/src/copied.ts": "/*! a parser of somebody else @license WTFPL */\nexport {};\n",
    "other/node_modules/dep/package.json": manifest({ name: "dep", version: "1.0.0" }),
    "other/node_modules/dep/index.js": "/*! @license Whatever */",
  });
  const suite = ["icons.ts", "plain.ts", "base.css", "own.ts"].map((name) =>
    join(root, "suite/src", name),
  );

  it("are found by their mark, with the legal comments the sources carry", () => {
    const { works, problems } = copiedWorks(suite);
    expect(problems).toEqual([]);
    expect(works.map(({ work, carriers, comments }) => [work.name, carriers, comments])).toEqual([
      ["Lucide", ["@fake/renderer"], [LUCIDE_COMMENT]],
      [
        "Tailwind CSS preflight",
        ["@fake/renderer"],
        ["/*! tailwindcss v4.3.5 (preflight.css) | MIT License */"],
      ],
    ]);
  });

  it("have their licence text at hand: Lucide's from the installed package, the others kept", () => {
    const texts = Object.fromEntries(
      copiedWorks(suite).works.map(({ work, text }) => [work.name, text]),
    );
    expect(texts.Lucide).toMatch(
      /^ISC License\n\nCopyright \(c\) \d+ Lucide Icons and Contributors/,
    );
    expect(texts.Lucide).toContain("Copyright (c) 2013-present Cole Bemis");
    expect(texts["Tailwind CSS preflight"]).toMatch(
      /^MIT License\n\nCopyright \(c\) Tailwind Labs/,
    );
    for (const work of COPIED_WORKS) {
      if ("file" in work.text) expect(existsSync(work.text.file), work.name).toBe(true);
      expect(SHIPPED_LICENCES, work.name).toContain(work.licence);
    }
  });

  it("name a source that says so in a plain comment, as two renderers of the suite do", () => {
    const { works } = copiedWorks([join(root, "suite/src/plain.ts")]);
    expect(works.map(({ work, carriers, comments }) => [work.name, carriers, comments])).toEqual([
      ["Lucide", ["@fake/renderer"], []],
    ]);
  });

  it("report a legal comment that no work answers, and read no package of npm", () => {
    const { works, problems } = copiedWorks([
      join(root, "other/src/copied.ts"),
      join(root, "other/node_modules/dep/index.js"),
    ]);
    expect(works).toEqual([]);
    expect(problems).toEqual([
      `${join(root, "other/src/copied.ts")} of @fake/other carries a legal comment that no ` +
        "notice answers: /*! a parser of somebody else @license WTFPL */",
    ]);
  });
});

describe("the notices of a real page of the board", () => {
  const PAGE = `
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import { mountShell } from "@miragon/modeler-shell";
import { createCollaborativeModeler } from "@miragon/board-renderer";
import { SUITE_EDITORS } from "board-suite-editors";

(globalThis as Record<string, unknown>).page = {
  mountShell,
  createCollaborativeModeler,
  editors: Promise.all(SUITE_EDITORS.map((entry) => entry.load())),
};
`;
  let metafile: Metafile;
  let files: string[];
  let script: string;
  let notices: ReturnType<typeof composeNotices>;

  beforeAll(async () => {
    const result = await esbuild({
      ...webviewBundle,
      stdin: { contents: PAGE, resolveDir: WEBVIEW_APP, sourcefile: "page.ts", loader: "ts" },
      absWorkingDir: BOARD,
      outfile: join(WEBVIEW_APP, "dist/webview.js"),
      format: "iife",
      minify: true,
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    metafile = result.metafile;
    files = metafileInputs(metafile, BOARD);
    script = result.outputFiles.find(({ path }) => path.endsWith(".js"))!.text;
    notices = composeNotices({
      product: "A page of the test",
      files,
      outputs: { "webview.js": script },
    });
  }, 60_000);

  const headings = (): string[] =>
    noticesSections(notices.text).map(({ name, version, licence }) =>
      version === undefined ? `## ${name} (${licence})` : `## ${name} ${version} (${licence})`,
    );
  const names = (): string[] => notices.packages.map(({ name }) => name);
  const isThirdParty = (name: string): boolean =>
    notices.packages.some((bundled) => bundled.name === name && !bundled.suite);

  it("are whole", () => {
    expect(notices.problems).toEqual([]);
  });

  it("list what the board and its seven notations stand on", () => {
    expect(names()).toEqual(
      expect.arrayContaining([
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
        "@miragon/modeler-shell",
        "@miragon/board-renderer",
        "@miragon/c4-renderer",
      ]),
    );
  });

  it("have a section for every package of npm the bundler names with a byte in the output", () => {
    const withBytes = new Set<string>();
    for (const { inputs } of Object.values(metafile.outputs)) {
      for (const [input, { bytesInOutput }] of Object.entries(inputs)) {
        const name = /^.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1];
        if (name !== undefined && bytesInOutput > 0) withBytes.add(name);
      }
    }
    expect(withBytes.size).toBeGreaterThan(40);
    const sections = noticesSections(notices.text).map(({ name }) => name);
    expect([...withBytes].filter((name) => !sections.includes(name))).toEqual([]);
    // graphlib is the one section no input stands behind: dagre's build holds it
    expect(withBytes.has("@dagrejs/graphlib")).toBe(false);
    expect(sections).toContain("@dagrejs/graphlib");
  });

  it("carry only licences the suite ships, each with its text", () => {
    const sections = noticesSections(notices.text);
    expect(sections.length).toBe(notices.works.length + names().filter(isThirdParty).length + 1);
    for (const { name, licence, quoted } of sections) {
      expect(SHIPPED_LICENCES, name).toContain(licence);
      expect(quoted, name).toBe(true);
    }
  });

  it("say under which of its two licences DOMPurify is bundled, and where graphlib is", () => {
    const dompurify = notices.packages.find(({ name }) => name === "dompurify")!;
    expect(notices.text).toContain(
      `## dompurify ${dompurify.version} (Apache-2.0)\n\n` +
        "Offered under `(MPL-2.0 OR Apache-2.0)`; bundled under Apache-2.0.",
    );
    expect(notices.text).toMatch(
      /## @dagrejs\/graphlib \S+ \(MIT\)\n\nInside the published build of `@dagrejs\/dagre`\./,
    );
  });

  it("name the copied works and the workspaces that carry them", () => {
    const carriers = Object.fromEntries(
      notices.works.map(({ work, carriers: names }) => [work.name, names]),
    );
    expect(Object.keys(carriers)).toEqual(["Lucide", "Material Icons", "Tailwind CSS preflight"]);
    expect(carriers.Lucide).toEqual(
      expect.arrayContaining([
        "@miragon/modeler-shell",
        "@miragon/business-model-canvas-renderer",
        "@miragon/c4-renderer",
        "@miragon/context-maps-renderer",
        "@miragon/value-chain-renderer",
        "@miragon/wardley-renderer",
        // these two say so in a plain comment: no legal comment of theirs reaches a bundle, and
        // their names are here by the mark alone
        "@miragon/event-storming-renderer",
        "@miragon/team-topologies-renderer",
      ]),
    );
    expect(carriers.Lucide).not.toContain("@miragon/board-renderer");
    expect(carriers["Material Icons"]).toEqual(
      expect.arrayContaining(["@miragon/context-maps-renderer", "@miragon/wardley-renderer"]),
    );
    expect(carriers["Tailwind CSS preflight"]).toEqual(["@miragon/board-renderer"]);
    expect(headings().slice(0, 3)).toEqual([
      "## Lucide (ISC)",
      "## Material Icons (Apache-2.0)",
      "## Tailwind CSS preflight (MIT)",
    ]);
    expect(notices.text).toContain("Apache License\n                           Version 2.0");
    expect(notices.text).toContain("Copyright (c) Tailwind Labs, Inc.");
  });

  it("put the workspaces of the suite under one licence text, without their versions", () => {
    expect(headings().at(-1)).toBe("## Miragon modeler suite (MIT)");
    const suite = noticesSections(notices.text).at(-1)!;
    expect(suite.members).toEqual(
      notices.packages.filter((bundled) => bundled.suite).map(({ name }) => name),
    );
    expect(suite.members).toContain("@miragon/wardley-renderer");
    expect(notices.text.match(/^Copyright \(c\) \d{4}[^\n]* Miragon$/gm)).toHaveLength(1);
  });

  it("take no heading of a quoted text for a section", () => {
    // the shell's own notices, quoted whole, have a heading "## Lucide"
    expect(notices.text).toContain("\n## Lucide\n");
    expect(noticesSections(notices.text).filter(({ name }) => name === "Lucide")).toHaveLength(1);
  });

  it("hand out the licence file the bundle names, to lie beside the script that names it", () => {
    expect(namedLegalFiles(script)).toEqual([LEGAL_FILE]);
    expect(notices.beside).toEqual({ [LEGAL_FILE]: readFileSync(`${DAGRE}.LEGAL.txt`, "utf8") });
    expect(notices.text).toContain(
      `\`${LEGAL_FILE}\`, the licence file its published build names:\n\n\`\`\`text\n/*\n@license`,
    );
    const inChunks = composeNotices({ product: "A", files, outputs: { "assets/c4.js": script } });
    expect(Object.keys(inChunks.beside)).toEqual([`assets/${LEGAL_FILE}`]);
  });

  it("report a named licence file that no bundled file has beside it", () => {
    const { problems } = composeNotices({
      product: "A",
      files: files.filter((file) => file !== DAGRE),
      outputs: { "webview.js": script },
    });
    expect(problems).toEqual([
      `webview.js names ${LEGAL_FILE}, and no bundled file has such a file beside it`,
    ]);
  });

  it("are the same text for the same files in another order", () => {
    const again = composeNotices({
      product: "A page of the test",
      files: [...files].reverse(),
      outputs: { "webview.js": script },
    });
    expect(again.text).toBe(notices.text);
  });

  describe("held by the check", () => {
    const build = (): Parameters<typeof noticesProblems>[0] => ({
      notices: notices.text,
      texts: { "webview.js": script },
      names: ["webview.js", NOTICES_FILE, LEGAL_FILE],
      bundled: notices.packages,
      works: notices.works.map(({ work }) => work),
    });

    it("pass as they were written", () => {
      expect(noticesProblems(build())).toEqual([]);
    });

    it("fail when the bundle names a licence file the build does not hold", () => {
      expect(noticesProblems({ ...build(), names: ["webview.js", NOTICES_FILE] })).toEqual([
        `webview.js names the licence file ${LEGAL_FILE}, and the build holds no ${LEGAL_FILE}`,
      ]);
      // beside the script that names it, not anywhere in the build
      expect(
        noticesProblems({
          ...build(),
          texts: { "assets/c4.js": script },
          names: ["assets/c4.js", NOTICES_FILE, LEGAL_FILE],
        }),
      ).toEqual([
        `assets/c4.js names the licence file ${LEGAL_FILE}, and the build holds no ` +
          `assets/${LEGAL_FILE}`,
      ]);
    });

    it("fail when a bundled package has no section", () => {
      const zod = notices.packages.find(({ name }) => name === "zod")!;
      const start = notices.text.indexOf(`## zod ${zod.version} (MIT)`);
      const without =
        notices.text.slice(0, start) + notices.text.slice(notices.text.indexOf("\n## ", start) + 1);
      expect(noticesProblems({ ...build(), notices: without })).toEqual([
        `zod ${zod.version} is in the build and the notices have no section for it`,
      ]);
    });

    it("fail when a work copied into a source has no section, or stands under another licence", () => {
      const start = notices.text.indexOf("## Tailwind CSS preflight (MIT)");
      expect(start).toBeGreaterThan(-1);
      const without =
        notices.text.slice(0, start) + notices.text.slice(notices.text.indexOf("\n## ", start) + 1);
      expect(noticesProblems({ ...build(), notices: without })).toEqual([
        "Tailwind CSS preflight is copied into a source of the build and the notices have no " +
          "section for it",
      ]);
      const relabelled = notices.text.replace(
        "## Material Icons (Apache-2.0)",
        "## Material Icons (MIT)",
      );
      expect(noticesProblems({ ...build(), notices: relabelled })).toEqual([
        "Material Icons is under Apache-2.0, and the notices say MIT",
      ]);
    });

    it("fail when a workspace of the suite in the build is not named", () => {
      const without = notices.text.replace("- `@miragon/c4-renderer`\n", "");
      expect(noticesProblems({ ...build(), notices: without })).toEqual([
        "@miragon/c4-renderer, a workspace of the suite, is in the build and the notices do " +
          "not name it",
      ]);
    });

    it("fail when a package in the build is under a licence the suite does not ship", () => {
      const copyleft = {
        name: "copyleft",
        version: "3.0.0",
        directory: "/nowhere",
        suite: false,
        declared: "GPL-3.0-only",
        licence: undefined,
        texts: [],
      };
      const [first, second, ...rest] = noticesProblems({
        ...build(),
        bundled: [...notices.packages, copyleft],
      });
      expect(first).toMatch(
        /^copyleft 3\.0\.0 is in the build under GPL-3\.0-only, which the suite does not ship/,
      );
      expect(second).toBe("copyleft 3.0.0 is in the build and the notices have no section for it");
      expect(rest).toEqual([]);
    });

    it("fail when the notices list something under such a licence, or under another than its own", () => {
      const zod = notices.packages.find(({ name }) => name === "zod")!;
      const relabelled = notices.text.replace(
        `## zod ${zod.version} (MIT)`,
        `## zod ${zod.version} (GPL-3.0-only)`,
      );
      const problems = noticesProblems({ ...build(), notices: relabelled });
      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(
        /^the notices list zod \S+ under GPL-3\.0-only, which the suite does not ship/,
      );
      expect(problems[1]).toBe(`zod ${zod.version} is under MIT, and the notices say GPL-3.0-only`);
    });

    it("fail when a section quotes no text, and when there are no notices", () => {
      const bare = `${notices.text}\n## bare 1.0.0 (MIT)\n\nNothing quoted.\n`;
      expect(noticesProblems({ ...build(), notices: bare })).toEqual([
        "the notices quote no licence text for bare 1.0.0",
      ]);
      expect(noticesProblems({ ...build(), notices: undefined })).toEqual([
        "the build holds no third-party notices",
      ]);
    });
  });
});

describe("the sections of a notices file", () => {
  const text = [
    "# Third-party notices",
    "",
    "## Some Work (ISC)",
    "",
    "Copied into `@fake/renderer`.",
    "",
    "````text",
    "a text that quotes a fence of its own:",
    "```",
    "## quoted 1.0.0 (GPL-3.0-only)",
    "```",
    "## quoted-again 2.0.0 (GPL-3.0-only)",
    "````",
    "",
    "## @scope/name 1.2.3-beta.1 (Apache-2.0)",
    "",
    "## Miragon modeler suite (MIT)",
    "",
    "- `@fake/renderer`",
    "- `fake-app`",
    "",
    "```text",
    "MIT License",
    "- `not-a-member`",
    "```",
  ].join("\n");

  it("are its headings outside every quoted text, with what each lists and whether it quotes", () => {
    expect(noticesSections(text)).toEqual([
      { name: "Some Work", version: undefined, licence: "ISC", quoted: true, members: [] },
      {
        name: "@scope/name",
        version: "1.2.3-beta.1",
        licence: "Apache-2.0",
        quoted: false,
        members: [],
      },
      {
        name: "Miragon modeler suite",
        version: undefined,
        licence: "MIT",
        quoted: true,
        members: ["@fake/renderer", "fake-app"],
      },
    ]);
  });
});

describe("the files a metafile of esbuild names", () => {
  const root = tree({
    "node_modules/sheet/base.css": "a { color: red }",
    "node_modules/shaken/index.js": "",
    "node_modules/font/files/regular.woff2": "",
    "src/page.ts": "",
  });
  const metafile = {
    outputs: {
      "out/page.js": {
        inputs: {
          "src/page.ts": { bytesInOutput: 120 },
          "node_modules/shaken/index.js": { bytesInOutput: 0 },
          "node_modules/gone/index.js": { bytesInOutput: 40 },
        },
      },
      "out/page.css": {
        inputs: {
          "node_modules/sheet/base.css?base": { bytesInOutput: 16 },
          "css-base-empty:diagram-js/assets/diagram-js.css": { bytesInOutput: 0 },
          "dataurl:node_modules/font/files/regular.woff2": { bytesInOutput: 0 },
          "src/page.ts": { bytesInOutput: 0 },
        },
      },
    },
  };

  it("are the ones with a byte in an output and every font, once, without query or namespace", () => {
    expect(metafileInputs(metafile, root)).toEqual([
      join(root, "src/page.ts"),
      join(root, "node_modules/sheet/base.css"),
      join(root, "node_modules/font/files/regular.woff2"),
    ]);
  });
});

describe("a build of esbuild on disk", () => {
  let root: string;
  let outdir: string;
  let metafile: Metafile;
  const write = (): ReturnType<typeof writeBundleNotices> =>
    writeBundleNotices({
      product: "A build",
      outdir,
      metafiles: [metafile],
      workingDirectory: root,
    });

  beforeAll(async () => {
    root = tree({
      "entry.js": `import { layout } from ${JSON.stringify(DAGRE)};\nconsole.log(layout);\n`,
    });
    outdir = join(root, "out");
    const result = await esbuild({
      entryPoints: [join(root, "entry.js")],
      bundle: true,
      format: "esm",
      sourcemap: true,
      outdir,
      absWorkingDir: root,
      metafile: true,
      logLevel: "silent",
    });
    metafile = result.metafile;
  });

  it("gets its notices and the named licence file written beside the bundle", () => {
    expect(write()).toEqual({ written: [NOTICES_FILE, LEGAL_FILE], problems: [] });
    expect(readFileSync(join(outdir, NOTICES_FILE), "utf8")).toMatch(
      /^# Third-party notices\n\nA build bundles/,
    );
    expect(readFileSync(join(outdir, LEGAL_FILE), "utf8")).toBe(
      readFileSync(`${DAGRE}.LEGAL.txt`, "utf8"),
    );
  });

  it("is held against the packages its source maps name", () => {
    write();
    // dagre ships a map of its own, so its sources are named as files it does not ship
    expect(sourceMapSources(outdir)).toContain(join(MODULES, "@dagrejs/dagre/lib/graph-lib.ts"));
    expect(checkBuildNotices(outdir)).toEqual({ problems: [], held: 2, works: 0, sections: 2 });
  });

  it("fails the check for each of its three reasons", () => {
    write();
    rmSync(join(outdir, LEGAL_FILE));
    expect(checkBuildNotices(outdir).problems).toEqual([
      `entry.js names the licence file ${LEGAL_FILE}, and the build holds no ${LEGAL_FILE}`,
    ]);

    const { text } = { text: (write(), readFileSync(join(outdir, NOTICES_FILE), "utf8")) };
    const graphlib = text.indexOf("## @dagrejs/graphlib");
    writeFileSync(join(outdir, NOTICES_FILE), text.slice(0, graphlib));
    expect(checkBuildNotices(outdir).problems).toEqual([
      expect.stringMatching(
        /^@dagrejs\/graphlib \S+ is in the build and the notices have no section for it$/,
      ),
    ]);

    writeFileSync(
      join(outdir, NOTICES_FILE),
      text.replace(/(## @dagrejs\/dagre \S+) \(MIT\)/, "$1 (AGPL-3.0)"),
    );
    expect(checkBuildNotices(outdir).problems).toEqual([
      expect.stringMatching(
        /^the notices list @dagrejs\/dagre \S+ under AGPL-3\.0, which the suite does not ship/,
      ),
      expect.stringMatching(/^@dagrejs\/dagre \S+ is under MIT, and the notices say AGPL-3\.0$/),
    ]);
  });

  it("hears what keeps the notices from being whole, which stops the build of a VSIX", async () => {
    const other = tree({
      "node_modules/copyleft/package.json": manifest({
        name: "copyleft",
        version: "3.0.0",
        license: "GPL-3.0-only",
      }),
      "node_modules/copyleft/COPYING": "GNU GENERAL PUBLIC LICENSE",
      "node_modules/copyleft/index.js": "globalThis.copyleft = true;\n",
      "entry.js": 'import "./node_modules/copyleft/index.js";\n',
    });
    const result = await esbuild({
      entryPoints: [join(other, "entry.js")],
      bundle: true,
      outdir: join(other, "out"),
      absWorkingDir: other,
      metafile: true,
      logLevel: "silent",
    });
    const { written, problems } = writeBundleNotices({
      product: "A build",
      outdir: join(other, "out"),
      metafiles: [result.metafile],
      workingDirectory: other,
    });
    expect(written).toEqual([NOTICES_FILE]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^copyleft 3\.0\.0 is under GPL-3\.0-only, which the suite does not ship/,
    );
    // the notices say it too, so the check of the written build fails as the build did
    expect(checkBuildNotices(join(other, "out"), { bundled: [] }).problems).toEqual([
      expect.stringMatching(
        /^the notices list copyleft 3\.0\.0 under GPL-3\.0-only, which the suite does not ship/,
      ),
      expect.stringMatching(/^nothing says which packages are in this build/),
    ]);
  });

  it("is held against the copied works its source maps name, said in a legal comment or not", async () => {
    // a workspace as the suite has them: one source says in a plain comment that it carries
    // copied icon geometry, and the bundler drops that comment
    const suite = tree({
      "package.json": manifest({ name: "@fake/renderer", version: "0.0.0", license: "MIT" }),
      LICENSE: MIT,
      "src/icons.ts":
        "/** Copied unchanged from lucide-static 1.59.0. */\n" +
        'export const plus = "M5 12h14";\n',
      "src/entry.ts":
        `import { layout } from ${JSON.stringify(DAGRE)};\n` +
        'import { plus } from "./icons.js";\nconsole.log(layout, plus);\n',
    });
    const out = join(suite, "out");
    const result = await esbuild({
      entryPoints: [join(suite, "src/entry.ts")],
      bundle: true,
      format: "esm",
      sourcemap: true,
      outdir: out,
      absWorkingDir: suite,
      metafile: true,
      logLevel: "silent",
    });
    const written = writeBundleNotices({
      product: "A build",
      outdir: out,
      metafiles: [result.metafile],
      workingDirectory: suite,
    });
    expect(written.problems).toEqual([]);
    expect(readFileSync(join(out, "entry.js"), "utf8")).not.toContain("lucide-static");
    expect(checkBuildNotices(out)).toEqual({ problems: [], held: 3, works: 1, sections: 4 });

    const text = readFileSync(join(out, NOTICES_FILE), "utf8");
    const start = text.indexOf("## Lucide (ISC)");
    expect(start).toBeGreaterThan(-1);
    writeFileSync(
      join(out, NOTICES_FILE),
      text.slice(0, start) + text.slice(text.indexOf("\n## ", start) + 1),
    );
    expect(checkBuildNotices(out).problems).toEqual([
      "Lucide is copied into a source of the build and the notices have no section for it",
    ]);
    // a caller that measured the build says which works are in it, and the maps are not asked
    expect(checkBuildNotices(out, { works: [] }).problems).toEqual([]);
  });

  it("is not passed when nothing says what is in it", () => {
    write();
    const copy = tree({
      "entry.js": readFileSync(join(outdir, "entry.js"), "utf8"),
      [NOTICES_FILE]: readFileSync(join(outdir, NOTICES_FILE), "utf8"),
      [LEGAL_FILE]: readFileSync(join(outdir, LEGAL_FILE), "utf8"),
    });
    expect(checkBuildNotices(copy).problems).toEqual([
      "nothing says which packages are in this build: it has no source map that names a file " +
        "on disk, and its caller measured none",
    ]);
    expect(checkBuildNotices(join(copy, "nowhere")).problems).toEqual([
      `there is no build at ${join(copy, "nowhere")}`,
    ]);
  });
});

describe("noticesPlugin, for a build of Vite", () => {
  const ENTRY = "page-of-the-test";
  const entry = (code: string): Plugin => ({
    name: "page-of-the-test",
    resolveId: (id) => (id === ENTRY ? `\0${ENTRY}` : undefined),
    load: (id) => (id === `\0${ENTRY}` ? code : undefined),
  });

  async function built(root: string, code: string): Promise<Record<string, string>> {
    const result = await viteBuild({
      configFile: false,
      root,
      logLevel: "silent",
      publicDir: false,
      resolve: { alias: [...cssBaseAliases, ...sourceAliases] },
      plugins: [entry(code), noticesPlugin({ product: "A page of Vite" })],
      build: {
        write: false,
        rolldownOptions: { input: ENTRY, output: { comments: { legal: true } } },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    return Object.fromEntries(
      outputs
        .flatMap((output) => ("output" in output ? output.output : []))
        .map((file) => [file.fileName, file.type === "chunk" ? file.code : String(file.source)]),
    );
  }

  it("writes the notices as a text file and the named licence file beside the chunk", async () => {
    const files = await built(
      EDITORS,
      'import "@miragon/board-renderer/assets/board.css";\n' +
        `import { layout } from ${JSON.stringify(DAGRE)};\nconsole.log(layout);\n`,
    );
    const notices = files["THIRD_PARTY_NOTICES.txt"]!;
    expect(notices).toMatch(/^# Third-party notices\n\nA page of Vite bundles/);
    const sections = noticesSections(notices).map(({ name }) => name);
    // React Flow's sheet comes in by an @import of the board's sheet alone, which is no module
    expect(sections).toEqual([
      "Tailwind CSS preflight",
      "@dagrejs/dagre",
      "@dagrejs/graphlib",
      "@xyflow/react",
      "Miragon modeler suite",
    ]);
    const naming = Object.keys(files).filter((name) => files[name]!.includes(LEGAL_FILE));
    const chunk = naming.find((name) => name.endsWith(".js"))!;
    expect(chunk).toMatch(/^assets\//);
    expect(files[`assets/${LEGAL_FILE}`]).toBe(readFileSync(`${DAGRE}.LEGAL.txt`, "utf8"));
    expect(
      noticesProblems({
        notices,
        texts: { [chunk]: files[chunk]! },
        names: Object.keys(files),
        bundled: bundledPackages([DAGRE]).packages,
      }),
    ).toEqual([]);
  }, 60_000);

  it("fails a build that carries a licence the suite does not ship", async () => {
    const root = tree({
      "node_modules/copyleft/package.json": manifest({
        name: "copyleft",
        version: "3.0.0",
        license: "GPL-3.0-only",
      }),
      "node_modules/copyleft/COPYING": "GNU GENERAL PUBLIC LICENSE",
      "node_modules/copyleft/index.js": "globalThis.copyleft = true;\n",
    });
    const code = `import ${JSON.stringify(join(root, "node_modules/copyleft/index.js"))};\n`;
    await expect(built(root, code)).rejects.toThrow(
      /the third-party notices of this build are not whole:\n- copyleft 3\.0\.0 is under GPL-3\.0-only, which the suite does not ship/,
    );
  }, 60_000);
});
