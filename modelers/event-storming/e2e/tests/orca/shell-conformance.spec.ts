import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { EVENT_STORMING_THEMES } from "../../../packages/renderer/src/theme/themes.js";
import { typeIntoStickyLabel } from "../support/shell-kit.js";
import { boardShortcutsDialog } from "../support/shortcuts-dialog.js";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the Orca
 * stub), the same cases as the VS Code webview's on the `ide` host. Orca has no diagnostics for a
 * custom editor, so the problems pill is absent next to the legend, the inspector and a canvas
 * action in the menu. The `csp` case stays off while the plugin ships no web fonts (#558).
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

const SKIPPED_WHILE_THE_PLUGIN_SHIPS_NO_WEB_FONTS = "csp";

const editsAtLabelEditorOpen = new WeakMap<Page, number>();

test.describe("Orca editor: shell conformance", () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      ideHost: "orca",
      themes: EVENT_STORMING_THEMES,
      async open(page, { size, requested, document: documentKey }) {
        // Orca has no high-contrast theme: the editor follows the system's prefers-contrast.
        await page.emulateMedia({ contrast: requested.kontrast ? "more" : "no-preference" });
        await openOrcaEditor(page, {
          size,
          theme: requested.theme,
          ...(documentKey ? { board: documentKey } : {}),
        });
      },
      documents: ["empty", "blank"],
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      absent: ["problems", "legend", "inspector", "canvasMenuAction"],
      labelEditor: {
        async open(page) {
          const typed = await typeIntoStickyLabel(page);
          editsAtLabelEditorOpen.set(page, (await orcaTab(page)).edits);
          return typed;
        },
        async documentChanged(page) {
          return (await orcaTab(page)).edits !== editsAtLabelEditorOpen.get(page);
        },
      },
      show: {
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({
              severity: "danger",
              text: shell.messages.invalidFile("Event Storming board"),
            });
          });
        },
        // The DSL reads every text, so the hook makes the import of an outside write fail.
        async invalid(page) {
          await page.evaluate(() => {
            const modeler = window.modeler!;
            const importText = modeler.importText.bind(modeler);
            modeler.importText = () => {
              modeler.importText = importText;
              return Promise.reject(new Error("not importable"));
            };
            window.__modelerShellOrcaStub!.replace("title Broken\n");
          });
        },
      },
      shortcutsDialog: boardShortcutsDialog("webview"),
    },
    test,
    {
      onSkip(caseName, skips) {
        if (caseName === SKIPPED_WHILE_THE_PLUGIN_SHIPS_NO_WEB_FONTS) return;
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
