import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Dependencies, not bundled: an app that bundles the layout takes one copy of dagre.
  external: ["@miragon/c4-schema-model", "@dagrejs/dagre"],
});
