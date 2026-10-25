// Writes THIRD_PARTY_NOTICES.md for the VSIX: the license of every npm package that ends up in
// dist/ (read from esbuild's metafile, so a new dependency cannot go unlisted), the fonts, and the
// Lucide and Material icons the renderer and the shell inline. `node scripts/third-party-notices.mjs
// --check` fails when the committed file is stale; the unit test runs that check.
import * as esbuild from "esbuild";
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const root = resolve(app, "../..");
const output = join(app, "THIRD_PARTY_NOTICES.md");

// Inlined as geometry (no npm dependency), so not visible in the metafile.
const LUCIDE = `## Lucide (lucide-static 1.59.0)

The map's lasso, context pad, connect handle and validation marker icons, the dialogs' Close icon
and the team glyph on the canvas (\`@miragon/context-maps-renderer\`) and the chrome icons
(\`@miragon/modeler-shell\`) are Lucide icons, copied into the sources.

ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The icons \`arrow-right\`, \`check\`, \`circle-x\`, \`maximize\`, \`minus\`, \`plus\`, \`trash\`,
\`triangle-alert\` and \`x\` are derived from the Feather project:

The MIT License (MIT)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

// Apache-2.0 §4(a) asks for a copy of the licence itself, not only a link to it.
const APACHE_LICENSE = readFileSync(join(here, "apache-2.0.txt"), "utf8")
  .replace(/^\n+/, "")
  .trimEnd();

const MATERIAL = `## Material Icons

The star and the open hand that mark core and supporting subdomains on the map
(\`@miragon/context-maps-renderer\`) are the paths of the Material Icons \`star\` and \`pan_tool\`
(https://github.com/google/material-design-icons), copied into the sources.

Copyright Google LLC. Licensed under the Apache License, Version 2.0:

\`\`\`text
${APACHE_LICENSE}
\`\`\`
`;

const sources = (path) => resolve(root, path);
const alias = {
  "@miragon/context-maps-renderer": sources("packages/renderer/src/index.ts"),
  "@miragon/context-maps-schema-model": sources("packages/schema-model/src/index.ts"),
  "@miragon/context-maps-cml": sources("packages/cml/src/index.ts"),
};

/** The npm packages with at least one byte in the production bundles, by package directory. */
async function bundledPackages() {
  const builds = [
    {
      entryPoints: [join(app, "src/extension.ts")],
      platform: "node",
      format: "cjs",
      external: ["vscode"],
    },
    {
      entryPoints: [join(app, "src/webview/main.ts")],
      platform: "browser",
      format: "iife",
      loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
    },
  ];
  const directories = new Map();
  for (const options of builds) {
    const result = await esbuild.build({
      ...options,
      bundle: true,
      minify: true,
      write: false,
      metafile: true,
      logLevel: "silent",
      absWorkingDir: root,
      outdir: join(app, "dist"),
      alias,
    });
    for (const out of Object.values(result.metafile.outputs)) {
      for (const [input, info] of Object.entries(out.inputs)) {
        if (info.bytesInOutput === 0 && !/\.(woff2?|ttf)$/.test(input)) continue;
        const match = /^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(input);
        if (match) directories.set(match[2], resolve(root, match[1]));
        // The suite's shared packages (packages/shell) are workspace links, which esbuild reports by
        // their real path: outside this modeler and outside node_modules.
        const shared = /^((?:\.\.\/)+packages\/[^/]+)\//.exec(input);
        if (shared) {
          const directory = resolve(root, shared[1]);
          const { name } = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
          directories.set(name, directory);
        }
      }
    }
  }
  return [...directories.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function licenseText(directory) {
  const file = readdirSync(directory).find((name) => /^licen[cs]e(\.md|\.txt)?$/i.test(name));
  if (!file) throw new Error(`No license file in ${directory}`);
  // Git stores the notices with LF line breaks; a license file with CRLF would make --check fail
  // in a checkout that does not convert them.
  return readFileSync(join(directory, file), "utf8").replace(/\r\n?/g, "\n").trim();
}

// The suite's own workspace packages (the contract, the shell) are Miragon's, under the same MIT
// license as this extension, and every suite release bumps their version: with it in their heading,
// each release pull request would find this file stale.
function isSuiteWorkspacePackage(directory) {
  return !realpathSync(directory).split(sep).includes("node_modules");
}

export async function noticesText() {
  const require = createRequire(import.meta.url);
  const sections = [];
  for (const [name, directory] of await bundledPackages()) {
    const manifest = require(join(directory, "package.json"));
    const heading = isSuiteWorkspacePackage(directory) ? name : `${name} ${manifest.version}`;
    sections.push(
      `## ${heading} (${manifest.license})\n\n\`\`\`text\n${licenseText(directory)}\n\`\`\`\n`,
    );
  }
  return [
    "# Third-party notices",
    "",
    "The Context Maps Modeler extension bundles the following third-party software. Generated by",
    "`npm run notices -w apps/vscode`; do not edit by hand.",
    "",
    LUCIDE,
    MATERIAL,
    ...sections,
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await noticesText();
  if (process.argv.includes("--check")) {
    if (readFileSync(output, "utf8") !== text) {
      console.error("THIRD_PARTY_NOTICES.md is stale: run `npm run notices -w apps/vscode`.");
      process.exit(1);
    }
  } else {
    writeFileSync(output, text);
  }
}
