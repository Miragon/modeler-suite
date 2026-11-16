/**
 * The host of the board's editor in a web app. `mountBoardEditor` asks it what it asks the VS
 * Code webview: whether the canvas keeps its own history (here it does), the shell, which here
 * is mounted with the web column (the File group, the legal line, the start screen), the
 * document, which here is the page's own: one text, handed over when the editor mounts, and
 * the place the board's view is kept in, which here is the browser's storage.
 */
import {
  mountShell,
  type EmptyStateOptions,
  type FileMenuOptions,
  type LegalLineOptions,
  type MenuEntry,
} from "@miragon/modeler-shell";
import type { BoardEditorHost, KeptState } from "board-ide-editor";

/** The one board text an editor is mounted for. Another document is another editor. */
export interface WebDocument {
  /** the text the editor opens with */
  readonly text: string;
  /**
   * The text shown where the board refuses `text`. Absent: the board stays on the refused text,
   * locked, and its status box says what is wrong with it, as for a broken file in an IDE.
   */
  readonly fallback?: string | undefined;
  /** the board refused `text` and shows `fallback` */
  refused?: (() => void) | undefined;
  /** every change a person made to the board, as the board's text after it */
  changed(text: string): void;
}

/** What the page puts into the shell's web column. */
export interface WebColumn {
  readonly file: FileMenuOptions;
  readonly legal: LegalLineOptions;
  readonly emptyState: EmptyStateOptions;
  /** the page's own entries of the Model and of the Export group */
  readonly model: readonly MenuEntry[];
  readonly export: readonly MenuEntry[];
  /** the empty-file hint where the editor's own names something this board cannot add */
  readonly emptyHint?: string | undefined;
  /** the page starts on the start screen, with this editor behind it */
  readonly startScreen: boolean;
}

export function webEditorHost(
  document: WebDocument,
  column: WebColumn,
  state?: KeptState,
): BoardEditorHost {
  return {
    canvasOwnsHistory: true,
    // The page keeps one place, for the document that is open: absent, the board is fitted.
    ...(state ? { state } : {}),
    mountShell(root, options) {
      const shell = mountShell(root, {
        ...options,
        host: "web",
        lang: "en",
        // An undefined entry would put the shell's own hint in the place of the editor's.
        messages: {
          ...options.messages,
          ...(column.emptyHint === undefined ? {} : { emptyHint: column.emptyHint }),
        },
        menu: { ...options.menu, model: column.model, export: column.export },
        file: column.file,
        legal: column.legal,
        emptyState: column.emptyState,
      });
      // In the task of the mount: the work chrome is never painted in front of the card.
      if (column.startScreen) shell.setEmptyState(true);
      return shell;
    },
    async connectDocument(_shell, sync) {
      let reconciled = "";
      let open = false;
      const { fallback } = document;
      const opened = (async (): Promise<void> => {
        if (await sync.importText(document.text, { first: true, reconciledText: "" })) {
          reconciled = document.text;
        } else if (fallback !== undefined) {
          // The example, kept in the browser: nobody can repair that text in this page, so a
          // board that stays locked on it is no use.
          await sync.importText(fallback, { first: false, reconciledText: "" });
          reconciled = fallback;
          document.refused?.();
        }
        open = true;
      })();
      return {
        pushEdit() {
          if (!open || !sync.canWrite()) return;
          const text = sync.exportText(reconciled);
          if (text === reconciled) return;
          reconciled = text;
          document.changed(text);
        },
        ready: opened,
        imported: () => opened,
        readOnly: false,
        insertExample: () => undefined,
        disconnect: () => void (open = false),
      };
    },
  };
}
