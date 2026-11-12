import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { EXAMPLE_DOCUMENT } from "../../apps/webapp/src/example.js";
import { THEMES } from "../../packages/renderer/src/themes.js";
import { labelEditorHooks } from "./support/label-editor.js";
import { openNotesPanel } from "./support/notes-panel.js";
import { diagramShortcutsDialog } from "./support/shortcuts-dialog.js";
import { exportText, linkTo, waitForApp } from "./support/webapp.js";

/**
 * The shell's conformance kit against the real web app (the web host of guide §5.2): geometry at
 * three sizes with the primary action, the legal line and the raised zoom row, ARIA and keyboard
 * models, keyboard creation from the palette, a label being typed across the shell's zoom, fit and
 * refit, the focus after a File action, the light-only mode under any system setting, the start
 * screen, toasts, the drop zone, the legend, the notes panel in the inspector and a clean teardown.
 * The web app has no invalid-file state (a file that is no canvas is refused before the import and
 * leaves the canvas as it was) and no problems list, so the harness declares them absent; any skip
 * fails the suite. `documents` adds the empty canvas after "New diagram" on the start screen,
 * without an empty-file hint, since every empty block explains itself; the appearance case runs on
 * it too.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

/** Pages that start every visit without the autosaved diagram of an earlier one. */
const freshPages = new WeakSet<Page>();

/** The web host's empty document: the start screen of a fresh visit, then its "New diagram". */
async function openNewDiagram(page: Page): Promise<void> {
  await page.goto("about:blank");
  await page.goto("/");
  await waitForApp(page);
  await page.getByRole("button", { name: "New diagram" }).click();
  await page.locator('[data-chrome="empty-state"]').waitFor({ state: "hidden" });
}

test.describe("web app: shell conformance", () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: "web",
      themes: THEMES,
      // The kit emulates the system's colour scheme and contrast before every open.
      async open(page, { size, document: documentKey }) {
        if (!freshPages.has(page)) {
          freshPages.add(page);
          await page.addInitScript(() => {
            try {
              localStorage.clear();
            } catch {
              // A blocked storage holds no diagram either.
            }
          });
        }
        await page.setViewportSize(size);
        if (documentKey === "empty") {
          await openNewDiagram(page);
          return;
        }
        // A link changes only the fragment: a fresh document mounts the shell again.
        await page.goto("about:blank");
        await page.goto(await linkTo(EXAMPLE_DOCUMENT));
        await waitForApp(page);
      },
      documents: ["empty"],
      // A sticky flows into its block, so Enter puts the first one into its slot, not the middle.
      firstElement: "slot",
      // Every empty block explains itself, so the canvas has no empty-file hint.
      emptyHint: "none",
      async destroy(page) {
        await page.evaluate(() => window.__businessModelCanvasApp?.destroy());
      },
      absent: ["invalid", "problems"],
      show: {
        inspector: openNotesPanel,
        async legend(page) {
          await page.evaluate(() => window.__businessModelCanvasApp?.shell.legend?.setOpen(true));
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.__businessModelCanvasApp!.shell;
            shell.setStatus({
              severity: "danger",
              text: shell.messages.invalidFile("business model canvas"),
            });
          });
        },
        // A fresh visit: the page without a diagram in its link or in the storage.
        async emptyState(page) {
          await page.goto("/");
          await waitForApp(page);
        },
        async toast(page, { status, text, actionLabel }) {
          await page.evaluate(
            ({ status, text, actionLabel }) => {
              window.__businessModelCanvasApp?.shell.toast({
                status,
                text,
                ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
              });
            },
            { status, text, actionLabel },
          );
        },
      },
      // A commit shows in what the app autosaves: the canonical text of the canvas.
      documentState: exportText,
      labelEditor: labelEditorHooks(),
      drop: {
        accepted: {
          name: "miragon.bmc",
          type: "text/plain",
          text: EXAMPLE_DOCUMENT,
        },
        // A picture is refused already while it is dragged and, dropped all the same, opens nothing.
        rejected: { name: "map.png", type: "image/png", text: "x" },
      },
      // The groups of the web app's Help entry, with its File keys (apps/webapp/src/main.ts).
      shortcutsDialog: diagramShortcutsDialog("webapp"),
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
