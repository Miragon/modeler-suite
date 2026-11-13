import { defineConfig } from 'vitest/config';

// The Orca plugin in a real Orca (`npm run test:orca`, on Linux under xvfb-run, or
// `test:orca:docker`): it needs a display and the extracted Orca in ORCA_APP.
export default defineConfig({
  test: {
    include: ['apps/orca/test-smoke/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
