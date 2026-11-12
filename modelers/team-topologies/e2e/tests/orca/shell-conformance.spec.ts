import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { TEAM_TOPOLOGIES_THEMES } from "../../../packages/renderer/src/theme/themes.js";
import { typeIntoLabelEditor } from "../support/labelEditor.js";
import { diagramShortcutsDialog } from "../support/shortcuts-dialog.js";
import { openOrcaEditor, openShippedOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the Orca
 * stub), the cases of the VS Code webview's on the `ide` host, legend and inspector included.
 * Orca has no diagnostics for a custom editor, so the problems pill is absent; the `csp` case runs
 * the built plugin under Orca's frame policy.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

test.describe("Orca editor: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      ideHost: "orca",
      themes: TEAM_TOPOLOGIES_THEMES,
      csp: { open: openShippedOrcaEditor },
      async open(page, { size, requested, document: documentKey }) {
        // Orca has no high-contrast theme: the editor follows the system's prefers-contrast.
        await page.emulateMedia({ contrast: requested.kontrast ? "more" : "no-preference" });
        await openOrcaEditor(page, {
          size,
          theme: requested.theme,
          ...(documentKey ? { doc: documentKey } : {}),
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
      absent: ["problems", "canvasMenuAction"],
      show: {
        async legend(page) {
          await page.evaluate(() => window.shell?.legend?.setOpen(true));
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
        async invalid(page) {
          await page.evaluate(() => {
            const text = window
              .modeler!.exportText()
              .replace('"type": "platform",', '"type": "plat');
            window.__modelerShellOrcaStub!.replace(text);
          });
        },
      },
      documentState: async (page) => String((await orcaTab(page)).edits),
      labelEditor: { open: typeIntoLabelEditor },
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
