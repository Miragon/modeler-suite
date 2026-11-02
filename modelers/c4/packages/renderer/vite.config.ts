import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// diagram-js and its tree stay external (peers), so a consumer bundles exactly one copy.
const EXTERNAL = [
  "diagram-js",
  /^diagram-js\//,
  "tiny-svg",
  "min-dom",
  "min-dash",
  "didi",
  "@miragon/c4-schema-model",
  "@miragon/c4-dsl",
  // A runtime dependency of the published renderer: dagre stays out of its bundle, and an app
  // bundles one copy.
  "@miragon/c4-layout",
  "@miragon/modeler-api",
  /^@miragon\/modeler-api\//,
];

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      // `themes` stays an entry of its own without the diagram, for Node code (`./themes`).
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        themes: resolve(import.meta.dirname, "src/themes.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: "c4",
    },
    rollupOptions: {
      external: EXTERNAL,
      // The Lucide notice of the inlined icon geometry ships with the bundle.
      output: { comments: { legal: true } },
    },
  },
  plugins: [dts({ entryRoot: "src", include: ["src/**/*.ts"], rollupTypes: true })],
});
