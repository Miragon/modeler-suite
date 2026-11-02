import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import {
  registerShellConformance,
  vsCodeStubSearch,
  type OpenContext,
  type ShellSkip,
} from "@miragon/modeler-shell/testing";
import { openWebviewBundle } from "@miragon/modeler-shell/testing/webview-bundle";
import { THEMES } from "@miragon/c4-renderer/themes";
import {
  DUPLICATE_IDENTIFIER,
  EXAMPLE,
  EXAMPLE_DEFAULT_VIEW,
  EXAMPLE_UNPINNED_LANDSCAPE,
} from "../support/documents.js";
import { labelEditorHooks } from "../support/label-editor.js";
import { shortcutsDialogHooks } from "../support/shortcuts-dialog.js";

/**
 * The shell's conformance kit against the real VS Code webview inside the shell's VS Code stub
 * (the `ide` host): geometry with the legend and the inspector, ARIA and keys that never reach
 * VS Code, the focus hand-back after "Lay out automatically" (the first Model action at the
 * landscape, where "Parent view" is disabled, and a second run changes nothing), keyboard
 * creation, the label editor across the shell's zoom, fit and refit, the read-only lock of an
 * invalid file, the appearance VS Code requests (a light-only modeler stays light, high contrast
 * passes), reduced motion, forced colours, the canvas's overlay layers, the shell's shortcuts
 * dialog with the renderer's groups and a clean teardown. `documents` adds the file the "New Empty
 * C4 Diagram" command writes (EMPTY_DIAGRAM) and a file of zero bytes: each opens at 100 % with
 * the empty-file hint, which the first element takes away (the `emptyFile` case), and the
 * appearance case runs on them too. `csp` opens the production bundle under the webview's CSP.
 * Any skip fails.
 */
const describeSkips = (skips: readonly ShellSkip[]) =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

const appsVscode = fileURLToPath(new URL("../../../apps/vscode", import.meta.url));
let productionBuild: Promise<unknown> | undefined;

/**
 * The shipped webview as VS Code loads it, for the kit's `csp` case: apps/vscode built for
 * production once per worker, its bundle behind renderWebviewHtml's document and CSP with the
 * shell's VS Code stub, and the example handed over through `init` once the webview is ready, as
 * the extension does.
 */
async function openShippedWebview(page: Page, { size, requested }: OpenContext): Promise<void> {
  productionBuild ??= promisify(execFile)(
    process.execPath,
    ["esbuild.config.mjs", "--production"],
    { cwd: appsVscode },
  );
  await productionBuild;
  await page.setViewportSize(size);
  await openWebviewBundle(page, {
    dist: join(appsVscode, "dist"),
    title: "C4",
    requested,
    themes: THEMES,
  });
  await page.waitForFunction(() =>
    (window.__modelerShellVsCodeStub?.posted ?? []).some(
      (message) => (message as { type?: unknown }).type === "ready",
    ),
  );
  await page.evaluate((text) => window.postMessage({ type: "init", text }, "*"), EXAMPLE);
  await page.locator(".djs-shape[data-element-id]").first().waitFor();
}

test.describe("VS Code webview: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the example opens on its landscape, whose first shape is an element", async ({ page }) => {
    await page.goto(`/webview-test.html?${vsCodeStubSearch({ theme: "light" })}`);
    await page.waitForFunction(() => window.webviewReady === true);
    expect(await page.evaluate(() => window.modeler!.getViewState()?.view)).toBe(
      EXAMPLE_DEFAULT_VIEW,
    );
    const first = page.locator(".djs-shape[data-element-id]").first();
    await expect(first).not.toHaveAttribute("data-element-id", /^boundary:/);
  });

  // The kit's focus hand-back runs the first Model action without a dialog twice, by pointer and
  // by Enter (SPEC 7.1): at the landscape "Parent view" is disabled, so that is "Lay out
  // automatically", whose second run finds nothing to remove.
  test("the first Model action at the landscape is Lay out automatically, idle on a second run", async ({
    page,
  }) => {
    await page.goto(`/webview-test.html?${vsCodeStubSearch({ theme: "light" })}`);
    await page.waitForFunction(() => window.webviewReady === true);
    const edits = () =>
      page.evaluate(
        () =>
          (window.__modelerShellVsCodeStub?.posted ?? []).filter(
            (message) => (message as { type?: unknown }).type === "edit",
          ).length,
      );
    // The entry the kit picks (its `isCanvasMenuAction`): the first enabled, non-destructive
    // `menuitem` of the File or Model group that opens no dialog.
    const firstCanvasMenuAction = () =>
      page.evaluate(() => {
        const entries = document.querySelectorAll('.cd-shell-menu[role="menu"] [role="menuitem"]');
        const action = [...entries].find((entry) => {
          const group = entry.closest("[data-menu-group]")?.getAttribute("data-menu-group");
          return (
            (group === "file" || group === "model") &&
            entry.closest("[data-menu-id]") !== null &&
            entry.getAttribute("aria-haspopup") !== "dialog" &&
            entry.getAttribute("aria-disabled") !== "true" &&
            !entry.hasAttribute("data-danger")
          );
        });
        return action?.closest("[data-menu-id]")?.getAttribute("data-menu-id") ?? null;
      });
    const layOut = async () => {
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.locator('[data-menu-id="parent-view"]')).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(await firstCanvasMenuAction()).toBe("lay-out-automatically");
      const entry = page.getByRole("menuitem", { name: "Lay out automatically", exact: true });
      await entry.click();
    };

    await layOut();
    await expect.poll(edits).toBe(1);
    // The landscape's layout block goes, and nothing else.
    expect(await page.evaluate(() => window.modeler!.exportText())).toBe(
      EXAMPLE_UNPINNED_LANDSCAPE,
    );
    await layOut();
    await page.waitForTimeout(200);
    expect(await edits()).toBe(1);
    expect(await page.evaluate(() => window.modeler!.exportText())).toBe(
      EXAMPLE_UNPINNED_LANDSCAPE,
    );
    expect(await page.evaluate(() => window.modeler!.getViewState()?.view)).toBe(
      EXAMPLE_DEFAULT_VIEW,
    );
  });

  registerShellConformance<Page>(
    {
      host: "ide",
      themes: THEMES,
      csp: { open: openShippedWebview },
      async open(page, { size, requested, document: documentKey }) {
        await page.setViewportSize(size);
        const search = new URLSearchParams(vsCodeStubSearch(requested));
        if (documentKey) search.set("doc", documentKey);
        await page.goto(`/webview-test.html?${search.toString()}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      documents: ["empty", "blank"],
      async destroy(page) {
        // the webview's own teardown path: connection, diagram (with its dialog), shell
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: [],
      labelEditor: labelEditorHooks((page) => page.evaluate(() => window.modeler!.exportText())),
      shortcutsDialog: shortcutsDialogHooks("webview"),
      show: {
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: "problems", count: 2, errors: 1 }, "*"),
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({ severity: "danger", text: shell.messages.invalidFile("C4 diagram") });
          });
        },
        async legend(page) {
          await page.evaluate(() => window.shell!.legend?.setOpen(true));
        },
        // The inspector opens with a selection, the way a click on an element opens it.
        async inspector(page) {
          await page.evaluate(() => {
            const diagram = window.modeler!.diagram;
            const registry = diagram.get<{ get(id: string): unknown }>("elementRegistry");
            diagram
              .get<{ select(element: unknown): void }>("selection")
              .select(registry.get("customer"));
          });
          await page.waitForFunction(
            () =>
              document.querySelector<HTMLElement>('[data-chrome="inspector"]')?.hidden === false,
          );
        },
        // The way the extension host makes the file invalid: an update the canvas refuses, here
        // one identifier defined twice (SPEC 3.8).
        async invalid(page) {
          await page.evaluate(
            (text) => window.postMessage({ type: "update", text }, "*"),
            DUPLICATE_IDENTIFIER,
          );
        },
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
