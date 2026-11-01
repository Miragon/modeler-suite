import type { Page } from "@playwright/test";
import { defaultMessages } from "@miragon/modeler-shell/core";
import type { ShortcutsDialogHooks } from "@miragon/modeler-shell/testing";
import { SHORTCUTS_KEY } from "../../../packages/renderer/src/menu/menu.js";
import { diagramShortcuts } from "../../../packages/renderer/src/menu/shortcuts.js";

/** Where the page keeps its shell: the web app's `app`, or the webview test page's `window`. */
export type ShellPage = "webapp" | "webview";

/**
 * The kit's `shortcutsDialog` hook: `shell.showShortcutsDialog` with the diagram's own groups,
 * which the renderer's pure shortcut table builds for the page's platform and language, as the
 * Help entry lists them. The two modules imported from the renderer import nothing at runtime but
 * each other, so the suite stays free of the renderer's dependencies. The renderer's View rows repeat the chrome's
 * keys; the shell shows its own rows for them.
 */
export function shortcutsDialogHooks(shellPage: ShellPage): ShortcutsDialogHooks<Page> {
  return {
    async show(page) {
      const chrome = await page.evaluate((where) => {
        const shell = where === "webapp" ? window.app?.shell : window.shell;
        if (!shell) throw new Error("the page has no shell handle");
        return { platform: shell.platform, lang: shell.lang };
      }, shellPage);
      // Only the web app binds the key; in VS Code the webview passes it on to the workbench,
      // which also owns undo and redo there.
      const webapp = shellPage === "webapp";
      const groups = diagramShortcuts(
        { ...chrome, messages: defaultMessages },
        { shortcutsKey: webapp ? SHORTCUTS_KEY : undefined, host: webapp ? "web" : "ide" },
      );
      await page.evaluate(
        ({ where, groups }) => {
          const shell = where === "webapp" ? window.app?.shell : window.shell;
          shell?.showShortcutsDialog(groups);
        },
        { where: shellPage, groups },
      );
    },
  };
}
