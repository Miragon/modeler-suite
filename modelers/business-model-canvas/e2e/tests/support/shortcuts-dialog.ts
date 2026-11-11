import type { Page } from "@playwright/test";
import { defaultMessages } from "@miragon/modeler-shell/core";
import type { ShortcutsDialogHooks } from "@miragon/modeler-shell/testing";
import { SHORTCUTS_KEY } from "../../../packages/renderer/src/menu/menu.js";
import { diagramShortcuts } from "../../../packages/renderer/src/menu/shortcuts.js";
import type {} from "./webapp.js";

/** Where the page keeps its shell: the web app's handle, or the webview test page's `window.shell`. */
export type ShellPage = "webapp" | "webview";

/**
 * The kit's `shortcutsDialog` hook: `shell.showShortcutsDialog` with the canvas's own groups,
 * which the renderer's pure shortcut table builds for the page's platform and language, as the
 * Help entry lists them. The renderer's View rows repeat the chrome's keys; the shell shows its
 * own rows for them. Only the web app binds the key; the webview passes it on to the workbench.
 */
export function diagramShortcutsDialog(shellPage: ShellPage): ShortcutsDialogHooks<Page> {
  return {
    async show(page) {
      const chrome = await page.evaluate((where) => {
        const shell = where === "webapp" ? window.__businessModelCanvasApp?.shell : window.shell;
        if (!shell) throw new Error("the page has no shell handle");
        return { platform: shell.platform, lang: shell.lang };
      }, shellPage);
      const groups = diagramShortcuts(
        { ...chrome, messages: defaultMessages },
        shellPage === "webapp" ? { shortcutsKey: SHORTCUTS_KEY, fileKeys: true } : {},
      );
      await page.evaluate(
        ({ where, groups }) => {
          const shell = where === "webapp" ? window.__businessModelCanvasApp?.shell : window.shell;
          shell?.showShortcutsDialog(groups);
        },
        { where: shellPage, groups },
      );
    },
  };
}
