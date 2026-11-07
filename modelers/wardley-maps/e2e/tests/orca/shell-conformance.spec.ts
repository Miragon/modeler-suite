import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { WARDLEY_THEMES } from "../../../packages/renderer/src/appearance/index.js";
import { kettleLabelEditor } from "../support/label-editor.js";
import { mapShortcutsDialog } from "../support/shortcuts-dialog.js";
import { openOrcaEditor, openShippedOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the Orca
 * stub), the cases of the VS Code webview's on the `ide` host. Orca has no diagnostics for a custom
 * editor, so the problems pill is absent next to the legend, the inspector and a canvas action in
 * the menu; the `csp` case runs the built plugin under Orca's frame policy.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

test.describe("Orca editor: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      ideHost: "orca",
      themes: WARDLEY_THEMES,
      csp: { open: openShippedOrcaEditor },
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
      absent: ["problems", "legend", "inspector", "canvasMenuAction"],
      show: {
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({
              severity: "danger",
              text: shell.messages.invalidFile("Wardley map"),
            });
          });
        },
        // OWM reads every text, so the hook makes the import of an outside write fail.
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
      labelEditor: kettleLabelEditor(async (page) => String((await orcaTab(page)).edits)),
      shortcutsDialog: mapShortcutsDialog("webview"),
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
