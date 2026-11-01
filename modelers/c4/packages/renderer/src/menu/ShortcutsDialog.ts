import {
  diagramShortcuts,
  type ShortcutGroup,
  type ShortcutHost,
  type ShortcutsChrome,
} from "./shortcuts.js";

// The rule of the shell's isTextField, which a renderer does not import.
const TEXT_FIELD =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), .monaco-editor";
const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]';

/** What the shell's `showShortcutsDialog` hands back: the dialog it opened. */
export interface ShownShortcutsDialog {
  isOpen(): boolean;
  close(): void;
}

/** What the controller needs of the chrome; a `@miragon/modeler-shell` handle fits. */
export interface ShortcutsDialogChrome extends ShortcutsChrome {
  /** The shell root, for the document whose keys and dialogs the controller looks at. */
  readonly root: HTMLElement;
  /** The shell's dialog (guide §8); it puts the chrome's zoom keys at the top of the View group. */
  showShortcutsDialog(groups: readonly ShortcutGroup[]): ShownShortcutsDialog;
  /** The web app's start screen shows: no diagram, so its key opens nothing. */
  isEmptyStateShown?(): boolean;
}

export interface ShortcutsDialogOptions {
  /**
   * The key that opens the dialog (`SHORTCUTS_KEY`), also listed in it. Left out, nothing listens:
   * the VS Code webview passes every key it does not need on to VS Code (guide §13.5), and a page
   * the modeler is embedded in keeps its keys.
   */
  readonly shortcutsKey?: string | undefined;
  /** "ide": VS Code owns undo and redo, so the dialog lists no rows for them. Default "web". */
  readonly host?: ShortcutHost | undefined;
}

export interface ShortcutsDialog {
  open(): void;
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    (target as HTMLElement).isContentEditable === true ||
    ((target as { editContext?: unknown }).editContext ?? null) !== null ||
    target.closest(TEXT_FIELD) !== null
  );
}

function isShown(dialog: Element): boolean {
  if (dialog instanceof HTMLDialogElement) return dialog.open;
  return (
    dialog.closest("[hidden]") === null && dialog.checkVisibility({ visibilityProperty: true })
  );
}

function opensDialog(event: KeyboardEvent, key: string): boolean {
  return (
    event.key === key &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing &&
    !event.defaultPrevented &&
    !isTextField(event.target)
  );
}

/**
 * The Help group's "Keyboard shortcuts…" dialog (guide §5.4, §8): the shell draws it, from the
 * groups of `diagramShortcuts`. Usable on a read-only canvas. With `shortcutsKey` the key opens it
 * from anywhere but a text field, another dialog and the start screen. The modeler removes the key
 * listener in its own teardown (`diagram.destroy`); the shell removes the dialog with itself.
 */
export function createShortcutsDialog(
  chrome: ShortcutsDialogChrome,
  options: ShortcutsDialogOptions = {},
): ShortcutsDialog {
  const { shortcutsKey, host } = options;
  const page = chrome.root.ownerDocument;
  let shown: ShownShortcutsDialog | undefined;

  const open = () => {
    shown = chrome.showShortcutsDialog(diagramShortcuts(chrome, { shortcutsKey, host }));
  };

  const onKey = (event: KeyboardEvent) => {
    if (!shortcutsKey || !opensDialog(event, shortcutsKey)) return;
    if (chrome.isEmptyStateShown?.() || [...page.querySelectorAll(DIALOG)].some(isShown)) return;
    event.preventDefault();
    open();
  };
  // Capture: an open menu consumes printable keys for its type-ahead before they bubble.
  if (shortcutsKey) page.addEventListener("keydown", onKey, true);

  return {
    open,
    isOpen: () => shown?.isOpen() ?? false,
    close: () => shown?.close(),
    destroy: () => page.removeEventListener("keydown", onKey, true),
  };
}
