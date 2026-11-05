import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { WEBVIEW_THEMES } from "../../../apps/vscode/src/themes.js";
import { contextNameEditor } from "../support/label-editor.js";
import { contextMapShortcutsDialog } from "../support/shortcuts-dialog.js";
import { INVALID_MAP } from "../vscode/support/webview.js";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the Orca
 * stub), the cases of the VS Code webview's on the `ide` host, the legend included. Orca has no
 * diagnostics for a custom editor, so the problems pill is absent. The `csp` case stays off while
 * the plugin ships no web fonts (#558).
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

const SKIPPED_WHILE_THE_PLUGIN_SHIPS_NO_WEB_FONTS = "csp";

test.describe("Orca editor: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      ideHost: "orca",
      themes: WEBVIEW_THEMES,
      async open(page, { size, requested, document: documentKey }) {
        // Orca has no high-contrast theme: the editor follows the system's prefers-contrast.
        await page.emulateMedia({ contrast: requested.kontrast ? "more" : "no-preference" });
        await openOrcaEditor(page, {
          size,
          theme: requested.theme,
          ...(documentKey ? { map: documentKey } : {}),
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
      absent: ["problems", "inspector", "canvasMenuAction"],
      show: {
        async legend(page) {
          await page.evaluate(() => window.shell?.legend?.setOpen(true));
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
        async invalid(page) {
          await page.evaluate((text) => window.__modelerShellOrcaStub!.replace(text), INVALID_MAP);
        },
      },
      labelEditor: contextNameEditor(async (page) => String((await orcaTab(page)).edits)),
      shortcutsDialog: contextMapShortcutsDialog("webview"),
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
