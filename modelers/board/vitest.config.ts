import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// Two projects so the default `npm test` stays fast and node-only, while the canvas runs in real
// Chromium via `npm run test:browser`: React Flow measures its nodes, which jsdom cannot.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/test/**/*.test.ts"],
          exclude: ["packages/renderer/test/browser/**", "**/node_modules/**"],
        },
      },
      {
        // Pre-bundled up front: discovered during the run, Vite would reload the page mid-suite.
        optimizeDeps: {
          include: [
            "@miragon/modeler-api",
            "@miragon/modeler-api/conformance",
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "@xyflow/react",
            "yjs",
            "lucide-react",
            "markdown-it",
            "dompurify",
          ],
        },
        test: {
          name: "browser",
          include: ["packages/renderer/test/browser/**/*.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // A desktop window: Vitest's own default is 414 x 896, where only the narrow branch
            // of the sheet's breakpoint (760 px) is laid out. styles.browser.test.ts narrows the
            // frame for that one
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
