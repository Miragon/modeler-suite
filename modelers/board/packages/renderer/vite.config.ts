import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};

// The peers are one copy with the host's (the store tells its elements by `instanceof Y.Map`, a
// second React has hooks of its own), and a host installs the package's own dependencies beside
// it: the scripts carry nothing but this package's sources.
const EXTERNAL = [
  ...Object.keys(manifest.peerDependencies),
  "react/jsx-runtime",
  "react-dom/client",
  ...Object.keys(manifest.dependencies),
];

const NOTICES = new URL("./THIRD_PARTY_NOTICES.md", import.meta.url);
const SHEET = "board.css";
const LEGAL_COMMENT = /\/\*![\s\S]*?\*\//g;
const SHEET_IMPORT = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

/** the npm package a file lies in, by the last node_modules segment of its path */
function packageOf(file: string): string | undefined {
  const parts = file.split("/");
  const at = parts.lastIndexOf("node_modules");
  if (at === -1) return undefined;
  const name = parts[at + 1] ?? "";
  return name.startsWith("@") ? `${name}/${parts[at + 2] ?? ""}` : name;
}

/**
 * THIRD_PARTY_NOTICES.md into the build, for what the sheet carries. A build fails when a script
 * would carry a third-party module or the sheet a package the file does not name. The minifier
 * keeps a legal comment only at the top of a sheet, so the legal comments of the inlined sheets
 * (the preflight of Tailwind CSS in board-base.css) open the built sheet.
 */
const notices = (): Plugin => {
  // Vite inlines what a sheet imports into the sheet: those files are no modules of a chunk.
  const sheets = new Set<string>();
  return {
    name: "board-renderer-notices",
    apply: "build",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".css")) return null;
      const follow = async (sheet: string, css: string): Promise<void> => {
        sheets.add(sheet);
        for (const [, specifier = ""] of css.matchAll(SHEET_IMPORT)) {
          const file =
            (await this.resolve(specifier, sheet))?.id ?? resolve(dirname(sheet), specifier);
          if (!sheets.has(file)) await follow(file, readFileSync(file, "utf8"));
        }
      };
      await follow(id, code);
      return null;
    },
    generateBundle: {
      // after Vite's own handler, which emits the sheet
      order: "post",
      handler(_options, bundle) {
        const text = readFileSync(NOTICES, "utf8");
        const carried = Object.values(bundle).flatMap((item) =>
          item.type === "chunk"
            ? Object.keys(item.modules).filter((id) => packageOf(id) !== undefined)
            : [],
        );
        if (carried.length > 0) {
          this.error(`the scripts carry third-party modules:\n- ${carried.join("\n- ")}`);
        }
        const unnamed = [...new Set([...sheets].map(packageOf))].filter(
          (name) => name !== undefined && !text.includes(`(\`${name}\`)`),
        );
        if (unnamed.length > 0) {
          this.error(
            `THIRD_PARTY_NOTICES.md does not name what the sheet carries: ${unnamed.join(", ")}`,
          );
        }
        const sheet = bundle[SHEET];
        if (sheet?.type !== "asset") this.error(`the build wrote no ${SHEET}`);
        const legal = [
          ...new Set(
            [...sheets].flatMap((file) => readFileSync(file, "utf8").match(LEGAL_COMMENT) ?? []),
          ),
        ];
        sheet.source = [...legal, String(sheet.source)].join("\n");
        this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES.md", source: text });
      },
    },
  };
};

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: "index",
      // One sheet with every @import inlined (the tokens, React Flow's sheet, the base): a host
      // imports @miragon/board-renderer/assets/board.css and nothing else.
      cssFileName: "board",
    },
    rolldownOptions: {
      external: EXTERNAL,
      output: { comments: { legal: true } },
    },
  },
  plugins: [
    dts({
      entryRoot: "src",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      // The base config maps the board's packages to their sources for the checks; the
      // declarations import @miragon/board-schema-model by its name, as a host resolves it, so
      // its dist is built first (the workspace's `build`).
      compilerOptions: { paths: {}, declarationMap: false },
      pathsToAliases: false,
      afterDiagnostic(diagnostics) {
        if (diagnostics.length > 0) {
          throw new Error(`the declarations do not type-check: ${diagnostics.length} errors above`);
        }
      },
    }),
    notices(),
  ],
});
