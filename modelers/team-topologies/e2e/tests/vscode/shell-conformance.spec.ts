import { test, type Page } from "@playwright/test";
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from "@miragon/modeler-shell/testing";
import { TEAM_TOPOLOGIES_THEMES } from "../../../packages/renderer/src/theme/themes.js";
import { typeIntoLabelEditor } from "../support/labelEditor.js";
import { diagramShortcutsDialog } from "../support/shortcuts-dialog.js";
import { openShippedWebview, postedMessages } from "./support/webview.js";

/**
 * The modeler shell's conformance kit against the real VS Code webview (main.ts inside the VS
 * Code stub): geometry at three sizes, the legend closed on a first visit at every size, ARIA and
 * keyboard models, chrome keys and select all that never reach VS Code, keyboard creation from the
 * palette, a label editor that the shell's zoom, fit and refit leave open, the read-only lock of an
 * invalid file, the appearance VS Code requests (a light-only diagram stays light, high contrast
 * passes) and a clean teardown. Team Topologies has every island of the IDE column (legend and
 * inspector included). Absent is only a File or Model action without a dialog: the IDE host has no
 * File group, and the webview's Model group holds only the shell's Legend checkbox. Any other skip
 * fails the suite.
 * `documents` adds the diagram "New Empty Diagram" writes and a file of zero bytes: each opens at
 * 100 % with the empty-file hint, which the first team takes away (the `emptyFile` case), and the
 * appearance case runs on them too.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

/** How many edits the webview had sent to the extension host when `labelEditor.open` last resolved. */
const editsAtOpen = new WeakMap<Page, number>();

async function sentEdits(page: Page): Promise<number> {
  return (await postedMessages(page)).filter((message) => message.type === "edit").length;
}

test.describe("VS Code webview: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      themes: TEAM_TOPOLOGIES_THEMES,
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
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ["canvasMenuAction"],
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
              text: shell.messages.invalidFile("Team Topologies diagram"),
            });
          });
        },
        // The inspector opens with a selection, the way a click on an element opens it.
        async inspector(page) {
          await page.evaluate(() => {
            const diagram = window.modeler!.diagram;
            const team = diagram
              .get<{ get(id: string): unknown }>("elementRegistry")
              .get("team_checkout");
            diagram.get<{ select(element: unknown): void }>("selection").select(team);
          });
          await page.waitForFunction(
            () =>
              document.querySelector<HTMLElement>('[data-chrome="inspector"]')?.hidden === false,
          );
        },
        // The invalid-file state the way the extension host causes it: an update the document
        // parser rejects (the text editor holds a half-typed value).
        async invalid(page) {
          await page.evaluate(() => {
            const text = window
              .modeler!.exportText()
              .replace('"type": "platform",', '"type": "plat');
            window.postMessage({ type: "update", text }, "*");
          });
        },
      },
      labelEditor: {
        async open(page) {
          const typed = await typeIntoLabelEditor(page);
          editsAtOpen.set(page, await sentEdits(page));
          return typed;
        },
        async documentChanged(page) {
          return (await sentEdits(page)) > (editsAtOpen.get(page) ?? 0);
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
