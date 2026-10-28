import type { Page } from "@playwright/test";
import { defaultMessages } from "@miragon/modeler-shell/core";
import type { ShortcutsDialogHooks } from "@miragon/modeler-shell/testing";
import {
  boardShortcuts,
  type BoardShortcutOptions,
} from "../../../packages/renderer/src/board-menu/shortcuts.js";

/** Where the page keeps its shell: the web app's handle, or the webview test page's `window.shell`. */
export type ShellPage = "webapp" | "webview";

/**
 * The kit's `shortcutsDialog` hook: `shell.showShortcutsDialog` with the board's own groups, which
 * the renderer builds for the page's platform and language, as the Help entry lists them. The
 * renderer's View rows repeat the chrome's keys; the shell shows its own rows for them.
 */
export function boardShortcutsDialog(
  shellPage: ShellPage,
  options: BoardShortcutOptions = {},
): ShortcutsDialogHooks<Page> {
  return {
    async show(page) {
      const chrome = await page.evaluate((where) => {
        const shell = where === "webapp" ? window.__eventStormingApp?.shell : window.shell;
        if (!shell) throw new Error("the page has no shell handle");
        return { platform: shell.platform, lang: shell.lang };
      }, shellPage);
      const groups = boardShortcuts({ ...chrome, messages: defaultMessages }, options);
      await page.evaluate(
        ({ where, groups }) => {
          const shell = where === "webapp" ? window.__eventStormingApp?.shell : window.shell;
          shell?.showShortcutsDialog(groups);
        },
        { where: shellPage, groups },
      );
    },
  };
}
