import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// diagram-js and its tree stay external (peers), so a consumer bundles exactly one copy.
const EXTERNAL = [
  'diagram-js',
  /^diagram-js\//,
  'tiny-svg',
  'min-dom',
  'min-dash',
  'didi',
  'zod',
  '@miragon/__NOTATION__-schema-model',
  '@miragon/__NOTATION__-dsl',
  '@miragon/modeler-api',
  /^@miragon\/modeler-api\//,
];

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: '__NOTATION__',
    },
    rollupOptions: {
      external: EXTERNAL,
      // The Lucide notice of the inlined icon geometry ships with the bundle.
      output: { comments: { legal: true } },
    },
  },
  plugins: [dts({ entryRoot: 'src', include: ['src/**/*.ts'], rollupTypes: true })],
});
