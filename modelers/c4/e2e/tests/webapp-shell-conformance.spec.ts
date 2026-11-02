import { expect, test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { THEMES } from "@miragon/c4-renderer/themes";
import { EXAMPLE, EXAMPLE_DEFAULT_VIEW, EXAMPLE_WITH_PROBLEMS } from "./support/documents.js";
import { labelEditorHooks } from "./support/label-editor.js";
import { shortcutsDialogHooks } from "./support/shortcuts-dialog.js";
import {
  activeView,
  appReady,
  exportText,
  forgetStorageOnEveryVisit,
  openNewDiagram,
  openWorkspace,
  workspaceLink,
} from "./support/webapp.js";

/**
 * The shell's conformance kit against the real web app (the `web` host): geometry at three
 * sizes with the primary action, the legal line, the legend, the inspector and the raised zoom
 * row, the legend closed on a first visit at every size, ARIA and keys, the focus after a File
 * action, keyboard creation from the palette, the label editor across the shell's zoom, fit and
 * refit, the light-only mode under any system setting, reduced motion, forced colours, the
 * canvas's overlay layers, the shortcuts dialog with the renderer's groups, the start screen,
 * toasts, the problems list with a row that reveals its element, the drop zone and a clean
 * teardown. `documents` adds the empty diagram after "New diagram" on the start screen: at 100 %
 * with the empty-file hint in the middle, gone with the first element (the `emptyFile` case), and
 * the appearance case runs on it too. A file the app cannot read is refused with a toast and
 * leaves the diagram as it was, so the web app has no invalid-file state; any skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

test.describe("web app: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the example opens on its landscape, whose first shape is an element the label editor opens", async ({
    page,
  }) => {
    await openWorkspace(page);
    expect(await activeView(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    // The landscape draws no boundary, so the kit's double-click lands on an element.
    const first = page.locator(".djs-shape[data-element-id]").first();
    await expect(first).not.toHaveAttribute("data-element-id", /^boundary:/);
    const before = await exportText(page);
    await first.dblclick();
    const editor = page.locator("textarea.diagram-label-editor");
    await expect(editor).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    expect(await exportText(page)).toBe(before);
  });

  registerShellConformance<Page>(
    {
      host: "web",
      themes: THEMES,
      async open(page, { size, document: documentKey }) {
        await forgetStorageOnEveryVisit(page);
        await page.setViewportSize(size);
        if (documentKey === "empty") {
          await openNewDiagram(page);
          return;
        }
        await openWorkspace(page);
      },
      documents: ["empty"],
      async destroy(page) {
        await page.evaluate(() => window.app?.destroy());
      },
      absent: ["invalid"],
      show: {
        // A link to the example with findings that import all the same; the duplicate name names
        // its element, which the landscape shows, so that row reveals it. Only the fragment
        // changes, so the page and the islands shown before stay; the app opens the link.
        async problems(page) {
          await page.goto(await workspaceLink(EXAMPLE_WITH_PROBLEMS));
          await page.waitForFunction(
            (text) => window.app?.modeler.exportText() === text,
            EXAMPLE_WITH_PROBLEMS,
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.app!.shell;
            shell.setStatus({ severity: "danger", text: shell.messages.invalidFile("C4 diagram") });
          });
        },
        async legend(page) {
          await page.evaluate(() => window.app!.shell.legend?.setOpen(true));
        },
        // The inspector opens with a selection, the way a click on an element opens it.
        async inspector(page) {
          await page.evaluate(() => {
            const { modeler } = window.app!;
            const registry = modeler.diagram.get<{ get(id: string): unknown }>("elementRegistry");
            modeler.diagram
              .get<{ select(element: unknown): void }>("selection")
              .select(registry.get("customer"));
          });
          await page.waitForFunction(
            () =>
              document.querySelector<HTMLElement>('[data-chrome="inspector"]')?.hidden === false,
          );
        },
        // A fresh visit: no workspace in the link or in the browser's copy.
        async emptyState(page) {
          await page.goto("/");
          await page.waitForFunction(() => window.app?.shell.isEmptyStateShown() === true);
        },
        async toast(page, { status, text, actionLabel }) {
          await page.evaluate(
            ({ status, text, actionLabel }) => {
              window.app!.shell.toast({
                status,
                text,
                ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
              });
            },
            { status, text, actionLabel },
          );
        },
      },
      labelEditor: labelEditorHooks(exportText),
      shortcutsDialog: shortcutsDialogHooks("webapp"),
      drop: {
        // The native .c4 file has no MIME type the browser knows; a picture is refused while dragged.
        accepted: { name: "bookshop.c4", type: "", text: EXAMPLE },
        rejected: { name: "picture.png", type: "image/png", text: "x" },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});

test("web app: a file that is no workspace is refused with a toast and leaves the diagram", async ({
  page,
}) => {
  await openWorkspace(page);
  const before = await exportText(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.dsl",
    mimeType: "text/plain",
    buffer: Buffer.from('workspace {\n    model {\n        a = person "A"\n'),
  });
  await expect(
    page.locator('[data-chrome="toasts"] .cd-shell-toast[data-status="danger"]'),
  ).toContainText("Couldn't open “broken.dsl”.");
  expect(await exportText(page)).toBe(before);
  await appReady(page);
  await expect(page.locator('[data-chrome="status"]')).toBeHidden();
  expect(await page.evaluate(() => window.app!.shell.isReadOnly())).toBe(false);
});
