import {
  isChromeShortcutRow,
  resolveMessages,
  type ShellMessageOverrides,
  type ShellMessages,
  type ShortcutGroup,
  type ShownShortcutGroup,
} from "../core/index.js";
import {
  openOwnedShellDialog,
  uniqueDialogId,
  type OwnedShellDialog,
  type ShellDialog,
} from "./dialog.js";
import { createElement } from "./element.js";

export interface ShortcutsDialogOptions {
  /** Where the dialog lives (see `ShellDialogOptions.container`). */
  container: HTMLElement;
  /** Title and Close come from `shortcutsTitle` and `close`; default English. */
  messages?: ShellMessageOverrides | undefined;
  /** `lang` on the `<dialog>`, for a container whose language is not the tool's. */
  lang?: string | undefined;
  /** See `ShellDialogOptions.focusFallback`. */
  focusFallback?: (() => void) | undefined;
}

function shortcutTable(
  ownerDocument: Document,
  group: ShownShortcutGroup,
  headingId: string,
): HTMLElement {
  const table = createElement(ownerDocument, "table", {
    class: "cd-shell-shortcuts-table",
    "aria-labelledby": headingId,
  });
  const rows = table.createTBody();
  for (const row of group.rows) {
    const line = rows.insertRow();
    if (isChromeShortcutRow(row)) line.setAttribute("data-chrome-key", row.chromeKey);
    const keys = createElement(ownerDocument, "td", { class: "cd-shell-shortcuts-keys" });
    for (const key of row.keys) {
      keys.append(createElement(ownerDocument, "kbd", { class: "cd-shell-kbd" }, key));
    }
    line.append(
      createElement(
        ownerDocument,
        "th",
        { class: "cd-shell-shortcuts-action", scope: "row" },
        row.action,
      ),
      keys,
    );
  }
  return createElement(
    ownerDocument,
    "section",
    { class: "cd-shell-shortcuts-group" },
    createElement(
      ownerDocument,
      "h3",
      { class: "cd-shell-shortcuts-title", id: headingId },
      group.title,
    ),
    table,
  );
}

/** The shortcuts dialog with `groups` as they are; the shell's handle adds the chrome's keys first. */
export function openShortcutsDialog(
  groups: readonly ShownShortcutGroup[],
  messages: Pick<ShellMessages, "shortcutsTitle" | "close">,
  options: Omit<ShortcutsDialogOptions, "messages">,
): OwnedShellDialog {
  return openOwnedShellDialog({
    container: options.container,
    title: messages.shortcutsTitle,
    closeLabel: messages.close,
    className: "cd-shell-shortcuts",
    lang: options.lang,
    focusFallback: options.focusFallback,
    render(body) {
      const ownerDocument = body.ownerDocument;
      body.append(
        ...groups
          .filter((group) => group.rows.length > 0)
          .map((group) => shortcutTable(ownerDocument, group, uniqueDialogId("shortcuts-group"))),
      );
    },
  });
}

/**
 * The "Keyboard shortcuts…" dialog of the Help group (guide §5.4, §8) without a mounted shell, for
 * an embedding host such as designIQ: one table per group in the given order (empty ones left
 * out), the action on the left and its keys as the chips of the chrome tooltip on the right. The
 * groups show as they are; a mounted shell's `showShortcutsDialog` puts the chrome's zoom and fit
 * keys at the top of the View group, and `withChromeShortcuts` of `./core` does the same for a host
 * that binds those keys itself.
 */
export function showShortcutsDialog(
  groups: readonly ShortcutGroup[],
  options: ShortcutsDialogOptions,
): ShellDialog {
  const { isOpen, close } = openShortcutsDialog(groups, resolveMessages(options.messages), options);
  return { isOpen, close };
}
