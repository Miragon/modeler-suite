import { test, type Page } from "@playwright/test";
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from "@miragon/modeler-shell/testing";
import { WEBVIEW_THEMES } from "../../../apps/vscode/src/themes.js";
import { contextNameEditor } from "../support/label-editor.js";
import { INVALID_MAP, openShippedWebview } from "./support/webview.js";

/**
 * The shell's conformance kit against the real VS Code webview (main.ts inside the VS Code stub):
 * geometry at three sizes, ARIA and keyboard models, chrome keys and select all that never reach
 * VS Code, keyboard creation from the palette, a context's name editor that the shell's zoom, fit
 * and refit leave open and unsent, the read-only lock of an invalid file, the appearance VS Code
 * requests (a light-only map stays light, high contrast passes), the legend and its start state,
 * and a clean teardown. Context Maps has no inspector, so the harness declares it absent and the
 * kit asserts it never shows. The webview's menu has no File group (VS Code's own File menu opens
 * and saves) and its Model group holds only "Map title…", a dialog, and the Legend checkbox, so
 * no menu entry acts on the canvas: the harness declares that absent too. Any skip fails the
 * suite. Every case opens the example.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

test.describe("VS Code webview: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      themes: WEBVIEW_THEMES,
      csp: { open: openShippedWebview },
      async open(page, { size, requested }) {
        await page.setViewportSize(size);
        await page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ["inspector", "canvasMenuAction"],
      show: {
        async legend(page) {
          await page.evaluate(() => window.shell?.legend?.setOpen(true));
        },
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: "problems", count: 2, errors: 1 }, "*"),
          );
          await page.waitForFunction(
            () => document.querySelector<HTMLElement>('[data-chrome="problems"]')?.hidden === false,
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({
              severity: "danger",
              text: shell.messages.invalidFile("context map"),
            });
          });
        },
        // The invalid-file state the way the extension host causes it: an update the parser
        // rejects (a peer's half-typed text).
        async invalid(page) {
          await page.evaluate(
            (text) => window.postMessage({ type: "update", text }, "*"),
            INVALID_MAP,
          );
        },
      },
      // A commit shows as an edit the webview posts to the extension host, which writes the file.
      labelEditor: contextNameEditor((page) =>
        page.evaluate(() =>
          String(
            (window.__modelerShellVsCodeStub?.posted ?? []).filter(
              (message) => (message as { type?: unknown }).type === "edit",
            ).length,
          ),
        ),
      ),
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
