// The browser bundle options of the editor, shared by the VS Code webview and the Orca plugin: the
// modeler's packages from source, font files next to the bundle, and the `?dataurl` imports the
// PNG export needs.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const r = (path) => resolve(root, path);
const require = createRequire(import.meta.url);
const packageDirectory = (name) => dirname(require.resolve(`${name}/package.json`));

/** Package aliases pointing at the TS source (mirrors apps/webapp/vite.config.ts). */
export const alias = {
  "@miragon/team-topologies-renderer": r("packages/renderer/src/index.ts"),
  "@miragon/team-topologies-schema-model": r("packages/schema-model/src/index.ts"),
};

/**
 * `import url from "file?dataurl"` inlines that one file as a data: URL, while every other import of
 * the same file type keeps its loader. The PNG export needs Geist inline: an SVG drawn as an image
 * can't load the frame's font files.
 * @type {import('esbuild').Plugin}
 */
const dataUrlImports = {
  name: "dataurl-imports",
  setup(build) {
    build.onResolve({ filter: /\?dataurl$/ }, async (args) => {
      const resolved = await build.resolve(args.path.slice(0, -"?dataurl".length), {
        kind: args.kind,
        resolveDir: args.resolveDir,
      });
      if (resolved.errors.length > 0) return { errors: resolved.errors };
      return { path: resolved.path, namespace: "dataurl" };
    });
    build.onLoad({ filter: /.*/, namespace: "dataurl" }, async (args) => ({
      contents: await readFile(args.path),
      loader: "dataurl",
    }));
  },
};

/**
 * Two copies of React in one bundle break every hook ("Invalid hook call"). The ui package is
 * bundled from its source folder, so a nested copy there would win over the one resolved here
 * (the webapp's Vite config dedupes the same way).
 */
const webAlias = {
  ...alias,
  react: packageDirectory("react"),
  "react-dom": packageDirectory("react-dom"),
};

/**
 * The bundle options without the build mode: each app adds `process.env.NODE_ENV` for React.
 * @type {import('esbuild').BuildOptions}
 */
export const editorBundle = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  alias: webAlias,
  // The shared ui package is React source compiled here, so JSX needs the automatic runtime.
  jsx: "automatic",
  // Font files next to the bundle, not inlined: as separate files the browser fetches only the
  // subsets a page's unicode-range needs.
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  assetNames: "fonts/[name]-[hash]",
  plugins: [dataUrlImports],
};
