/**
 * The board inside the suite's shell: what the shell's `mountIdeEditor` is for a modeler on
 * diagram-js, without its diagram-js lines. The shell brings the menu, the zoom panel, the
 * status box and the empty-file hint; the board keeps its toolbar. The board file is the host's
 * document; the files its nodes show come through the files port, and the editors of its model
 * nodes are handed in, so this workspace names no other modeler. The host is an IDE's (the VS
 * Code webview) or a web app's, which mounts the shell's web column around the same board.
 */
import type { BoardFiles } from "@miragon/board-files";
import { createFilesHost, type EditorEntry } from "@miragon/board-host";
import { createCollaborativeModeler, type CollaborativeBoard } from "@miragon/board-renderer";
import { parseBoardText } from "@miragon/board-schema-model";
import type { Insets, ShellHandle, ShellMessageOverrides, Theme } from "@miragon/modeler-shell";
import type { IdeDocument, IdeEditorHost } from "@miragon/modeler-shell/ide";

import { createFirstFit } from "./first-fit.js";
import { createBoardLock } from "./invalid.js";
import { boardShortcuts } from "./shortcuts.js";
import { viewChanges } from "./view-events.js";
import { boardZoomTarget } from "./zoom-target.js";

/**
 * The place the editor is mounted in, as far as the editor asks it. The shell's `IdeEditorHost`
 * fits, as the VS Code webview hands it in. A web app is no IDE and brings the three members
 * itself: its `mountShell` adds the shell's web column, and its document is the page's own.
 */
export type BoardEditorHost = Pick<
  IdeEditorHost,
  "canvasOwnsHistory" | "mountShell" | "connectDocument"
>;

export interface BoardEditorOptions {
  /** Where the shell is mounted. Default: the element with the id `app`. */
  root?: HTMLElement | null | undefined;
  /** The files of the repository. Absent: a board of notes, groups and arrows. */
  files?: BoardFiles | undefined;
  /** The editors of the board's model nodes, each for the suffixes of its files. */
  editors: readonly EditorEntry[];
  /**
   * True where the host's document owns the history (VS Code): the undo keys of an editor that
   * is armed stay with that editor and never reach the host.
   */
  containHistoryKeys: boolean;
  /**
   * The line of a model its editor refuses: what a person can do about it in this host. Absent:
   * the host package's own, which sends them to the file's editor (true in an IDE).
   */
  invalidText?: string | undefined;
  /** True where the host binds the file keys itself (a web app): the shortcuts dialog lists them. */
  fileKeys?: boolean | undefined;
}

export interface BoardEditor {
  readonly shell: ShellHandle;
  readonly modeler: CollaborativeBoard;
  /** The document as the host connected it: `imported()` settles with the texts that came so far. */
  readonly document: IdeDocument;
  /** Resolves once the first text of the document was imported or refused. */
  readonly ready: Promise<void>;
  /**
   * Ends the board, then what it stood on: the board first, and only when its editors are gone
   * the host built from the files, then the shell. An editor may still write while it goes, so
   * the files port, which stays its owner's, is disposed once this promise resolved.
   */
  destroy(): Promise<void>;
}

// The canvas draws light; an appearance surface of the board is still to come.
const THEMES: readonly Theme[] = ["light"];

const MESSAGES: ShellMessageOverrides = {
  emptyHint: "Add a note, a group or a model from the toolbar to start.",
  invalidFile: (name) =>
    `This file isn't a valid ${name} right now. The board shows the last valid version and is read-only until you fix the text.`,
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Mounts the shell through the host, the board in the shell's canvas slot and the document
 * sync. The board exists before anything is awaited, so a page without a host that answers
 * still shows an empty board.
 */
export async function mountBoardEditor(
  host: BoardEditorHost,
  options: BoardEditorOptions,
): Promise<BoardEditor> {
  const root = options.root === undefined ? document.getElementById("app") : options.root;
  if (!root) throw new Error("board-ide-editor: the editor HTML has no #app root");

  const shell: ShellHandle = host.mountShell(root, {
    themes: THEMES,
    messages: MESSAGES,
    // no example to insert: an empty board has its toolbar
    emptyHint: {},
    menu: {
      help: [
        {
          kind: "dialog",
          id: "keyboard-shortcuts",
          label: "Keyboard shortcuts…",
          icon: "keyboard",
          onSelect: () =>
            void shell.showShortcutsDialog(
              boardShortcuts(shell, { fileKeys: options.fileKeys === true }),
            ),
        },
      ],
    },
  });
  const slot = shell.canvas;
  const insets = (): Insets => shell.fitInsets();

  const filesHost = options.files
    ? createFilesHost({
        files: options.files,
        editors: options.editors,
        containHistoryKeys: options.containHistoryKeys,
        invalidText: options.invalidText,
      })
    : undefined;
  const modeler = createCollaborativeModeler({
    host: filesHost,
    undoRedoKeys: host.canvasOwnsHistory,
    // The first view is the app's (first-fit.ts), and every later one the person's.
    fitOnImport: false,
    freeArea: { insets },
  });
  modeler.attachTo(slot);

  const lock = createBoardLock(shell);
  const firstFit = createFirstFit(modeler, slot, insets);
  const target = boardZoomTarget({
    modeler,
    slot,
    insets,
    onView: viewChanges(modeler),
    onContent: (listener) => modeler.board.store.subscribe(listener),
  });
  shell.setZoomTarget(target);

  let accepted = false;
  let destroyed = false;
  const showEmptyHint = (): void =>
    shell.setEmptyHint(accepted && !lock.locked() && modeler.contentBounds() === undefined);
  const stopHint = modeler.board.store.subscribe(showEmptyHint);

  async function importText(text: string): Promise<boolean> {
    // A text the board shows already is not imported: an import gives up a move by the arrow
    // keys that still rests, and the host's echo of an edit is such a text.
    if (!accepted || text !== modeler.exportText()) {
      try {
        await modeler.importText(text);
      } catch (error) {
        if (destroyed) return false;
        const parsed = parseBoardText(text);
        lock.refused(parsed.ok ? messageOf(error) : parsed.reason);
        showEmptyHint();
        return false;
      }
    }
    accepted = true;
    lock.accepted();
    showEmptyHint();
    firstFit.imported();
    return true;
  }

  /** everything but the document, in the order the board asks for */
  async function unmount(): Promise<void> {
    destroyed = true;
    stopHint();
    firstFit.stop();
    modeler.destroy();
    // The board unmounts its canvas, and with it every model's editor, in a microtask it queued
    // inside destroy(): this one runs behind it. An editor may write while it goes (a label
    // that commits on the blur), so what it writes through is still there until then.
    await Promise.resolve();
    filesHost?.dispose();
    shell.destroy();
  }

  let connected: IdeDocument;
  try {
    connected = await host.connectDocument(shell, {
      importText,
      exportText: () => modeler.exportText(),
      canWrite: () => !lock.locked(),
      commands: { fitView: () => target.fit() },
    });
  } catch (error) {
    await unmount();
    throw error;
  }
  const stopEdits = modeler.onContentChanged(connected.pushEdit);
  if (connected.readOnly) lock.readOnlyDocument();

  let ended: Promise<void> | undefined;
  return {
    shell,
    modeler,
    document: connected,
    ready: connected.ready,
    destroy() {
      ended ??= (() => {
        stopEdits();
        connected.disconnect();
        return unmount();
      })();
      return ended;
    },
  };
}
