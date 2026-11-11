import { test, type Page } from "@playwright/test";
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from "@miragon/modeler-shell/testing";
import { THEMES } from "../../../packages/renderer/src/themes.js";
import { labelEditorHooks } from "../support/label-editor.js";
import { openNotesPanel } from "../support/notes-panel.js";
import { diagramShortcutsDialog } from "../support/shortcuts-dialog.js";
import { countOf, openShippedWebview, postedMessages } from "./support/webview.js";

/**
 * The shell's conformance kit against the real VS Code webview (main.ts inside the VS Code stub):
 * geometry at three sizes, ARIA and keyboard models, chrome keys and select all that never reach
 * VS Code while undo and redo do, keyboard creation from the palette, a label being typed across
 * the shell's zoom, fit and refit, the read-only lock of an invalid file, the appearance VS Code
 * requests (a light-only canvas stays light, high contrast passes) and a clean teardown. The canvas
 * has a legend (the folded corner of a sticky with notes) and the notes panel in the inspector. The
 * menu has no canvas action (`canvasMenuAction`): VS Code owns the file commands, and the Model
 * group holds the title dialog and the notes checkbox. Any other skip fails. `documents` adds the
 * canvas "New Empty Business Model Canvas" writes and a file of zero bytes, both without an
 * empty-file hint, since every empty block explains itself; the appearance case runs on them too.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

/** What a half-typed edit in the text editor beside the canvas can leave: an id taken twice. */
const INVALID_DOCUMENT = JSON.stringify({
  channels: {
    items: [
      { id: "shop", text: "Shop" },
      { id: "shop", text: "Fair" },
    ],
  },
});

test.describe("VS Code webview: shell conformance", () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      themes: THEMES,
      csp: { open: openShippedWebview },
      async open(page, { size, requested, document: documentKey }) {
        await page.setViewportSize(size);
        const search = new URLSearchParams(vsCodeStubSearch(requested));
        if (documentKey) search.set("diagram", documentKey);
        await page.goto(`/webview-test.html?${search.toString()}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      documents: ["empty", "blank"],
      // A sticky flows into its block, so Enter puts the first one into its slot, not the middle.
      firstElement: "slot",
      // Every empty block explains itself, so the canvas has no empty-file hint.
      emptyHint: "none",
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ["canvasMenuAction"],
      // A commit shows as an edit message to the extension host, which writes the document.
      labelEditor: labelEditorHooks(
        async (page) => `${countOf(await postedMessages(page), "edit")} edits`,
      ),
      show: {
        inspector: openNotesPanel,
        async legend(page) {
          await page.evaluate(() => window.shell?.legend?.setOpen(true));
        },
        // The way the extension host reports diagnostics: a `problems` message.
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
              text: shell.messages.invalidFile("business model canvas"),
            });
          });
        },
        // The invalid-file state the way the extension host causes it: an update that does not parse.
        async invalid(page) {
          await page.evaluate(
            (text) => window.postMessage({ type: "update", text }, "*"),
            INVALID_DOCUMENT,
          );
        },
      },
      shortcutsDialog: diagramShortcutsDialog("webview"),
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
