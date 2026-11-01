import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

// `npm test` stays fast and node-only; the renderer's integration layer, the modeler-api
// conformance kit included, runs in real Chromium (`npm run test:browser`): jsdom has no
// SVGElement.getBBox(), which diagram-js needs for every viewbox.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
          exclude: ["packages/renderer/test/browser/**", "**/node_modules/**", "**/dist/**"],
        },
      },
      {
        // Every third-party module the browser tests load (`optimize-deps.sync.test.ts`): one Vite
        // finds only while the tests run makes it re-optimize and reload a running test file.
        optimizeDeps: {
          include: [
            "@dagrejs/dagre",
            "diagram-js/lib/Diagram",
            "diagram-js/lib/command",
            "diagram-js/lib/draw/BaseRenderer",
            "diagram-js/lib/features/auto-scroll",
            "diagram-js/lib/features/auto-scroll/AutoScroll",
            "diagram-js/lib/features/bendpoints",
            "diagram-js/lib/features/change-support",
            "diagram-js/lib/features/connect",
            "diagram-js/lib/features/connection-preview",
            "diagram-js/lib/features/context-pad",
            "diagram-js/lib/features/context-pad/ContextPad",
            "diagram-js/lib/features/create",
            "diagram-js/lib/features/dragging",
            "diagram-js/lib/features/editor-actions",
            "diagram-js/lib/features/global-connect",
            "diagram-js/lib/features/hand-tool",
            "diagram-js/lib/features/hover-tooltip",
            "diagram-js/lib/features/interaction-events",
            "diagram-js/lib/features/keyboard",
            "diagram-js/lib/features/keyboard-move-selection",
            "diagram-js/lib/features/keyboard/KeyboardBindings",
            "diagram-js/lib/features/keyboard/KeyboardUtil",
            "diagram-js/lib/features/lasso-tool",
            "diagram-js/lib/features/modeling/Modeling",
            "diagram-js/lib/features/move",
            "diagram-js/lib/features/outline",
            "diagram-js/lib/features/overlays",
            "diagram-js/lib/features/palette",
            "diagram-js/lib/features/resize",
            "diagram-js/lib/features/rules",
            "diagram-js/lib/features/rules/RuleProvider",
            "diagram-js/lib/features/selection",
            "diagram-js/lib/features/snapping",
            "diagram-js/lib/features/snapping/CreateMoveSnapping",
            "diagram-js/lib/features/snapping/ResizeSnapping",
            "diagram-js/lib/layout/CroppingConnectionDocking",
            "diagram-js/lib/layout/LayoutUtil",
            "diagram-js/lib/navigation/keyboard-move",
            "diagram-js/lib/navigation/movecanvas",
            "diagram-js/lib/navigation/zoomscroll",
            "diagram-js/lib/util/Event",
          ],
        },
        test: {
          name: "browser",
          include: ["packages/renderer/test/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
