import { test, type Page } from "@playwright/test";
import { registerShellConformance, type ShellSkip } from "@miragon/modeler-shell/testing";
import { TEAM_TOPOLOGIES_THEMES } from "../../../packages/renderer/src/theme/themes.js";
import { typeIntoLabelEditor } from "../support/labelEditor.js";
import { diagramShortcutsDialog } from "../support/shortcuts-dialog.js";
import { openOrcaEditor, orcaTab } from "./support/orca.js";

/**
 * The shell's conformance kit against the Orca editor (apps/orca/src/main.ts inside the Orca
 * stub), the cases of the VS Code webview's on the `ide` host, legend and inspector included.
 * Orca has no diagnostics for a custom editor, so the problems pill is absent. The `csp` case
 * stays off while the plugin ships no web fonts (#558).
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join("; ");

const SKIPPED_WHILE_THE_PLUGIN_SHIPS_NO_WEB_FONTS = "csp";

const editsAtOpen = new WeakMap<Page, number>();

test.describe("Orca editor: shell conformance", () => {
  test.describe.configure({ timeout: 90_000 });

  registerShellConformance<Page>(
    {
      host: "ide",
      ideHost: "orca",
      themes: TEAM_TOPOLOGIES_THEMES,
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
      labelEditor: {
        async open(page) {
          const typed = await typeIntoLabelEditor(page);
          editsAtOpen.set(page, (await orcaTab(page)).edits);
          return typed;
        },
        async documentChanged(page) {
          return (await orcaTab(page)).edits > (editsAtOpen.get(page) ?? 0);
        },
      },
      shortcutsDialog: diagramShortcutsDialog("webview"),
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
