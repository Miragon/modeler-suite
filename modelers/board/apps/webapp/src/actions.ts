/**
 * What a person asks of the page: a new board, a file from the disk, the example, the example
 * as it was, and the board as a download. Each ends in a toast where the shell's guide asks for
 * one. Nothing asks before it replaces a board: what is replaced is offered back instead.
 */
import {
  boardFileText,
  downloadName,
  downloadText,
  holdsNothing,
  namesFiles,
  unreadableFile,
} from "./board-file.js";
import { NO_MODELS_TO_ADD } from "./no-repository.js";
import { keepBoard, RESET_LABEL, type BoardDocument, type Session } from "./session.js";
import { resetRequested, type AppStorage, type OpenDocument, type OpenStorage } from "./storage.js";

const KEPT = `The example repository is kept in this browser. “${RESET_LABEL}” in the menu starts it over.`;
const LOST = "Couldn't restore the board of your last visit. Start a new board or open a file.";
const withoutRepository = (name: string): string =>
  `“${name}” was opened as a single file: the models and pictures of its repository are not shown.`;

/** A sentence takes longer to read than the shell gives a toast of a few words. */
const SENTENCE_MS = 6000;

/** The documents of the page, as the actions drive them. */
export interface Documents {
  current(): Session | undefined;
  /** ends the open document, with what its editors still write */
  close(): Promise<void>;
  /** closes the open document and mounts this one in its place */
  show(next: OpenDocument, startScreen?: boolean): Promise<Session>;
}

export interface ActionsPage {
  readonly page: Document;
  readonly kept: AppStorage;
  readonly opened: OpenStorage;
  saved(taken: boolean): void;
  /** one thing after another: an offer's Undo comes while nothing else runs */
  run(task: () => Promise<void>): Promise<void>;
}

export interface Actions {
  /** the document of the last visit, else the start screen over a new board */
  start(search: string): Promise<void>;
  newBoard(): Promise<void>;
  showExample(): Promise<void>;
  openFile(file: File): Promise<void>;
  resetExample(): Promise<void>;
  download(): void;
  modelPickerUsed(): void;
}

export function createActions(documents: Documents, on: ActionsPage): Actions {
  const { kept, opened, saved, run } = on;

  /**
   * A board that another document took the place of is offered back, until the first change of
   * what replaced it. A board without an element is nothing a person would miss.
   */
  function offerBack(session: Session, previous: BoardDocument): void {
    if (holdsNothing(previous.text)) return;
    const undo = async (): Promise<void> => {
      await documents.show({ kind: "board", ...previous });
      saved(keepBoard(opened, previous));
    };
    session.offer(
      session.editor.shell.toast({
        status: "info",
        text: "Board replaced",
        action: { label: "Undo", onSelect: () => void run(undo) },
      }),
    );
  }

  /** Another document in the place of the open one: an open board is kept as text for the offer. */
  async function replace(next: OpenDocument): Promise<Session> {
    const before = documents.current();
    const text = before?.kind === "board" ? before.editor.modeler.exportText() : undefined;
    const session = await documents.show(next);
    if (text !== undefined) offerBack(session, { name: before?.name, text });
    return session;
  }

  return {
    async start(search) {
      const last = opened.read();
      if (resetRequested(search)) {
        kept.reset();
        saved(opened.keep({ kind: "example" }));
        const session = await documents.show({ kind: "example" });
        // The address asked for the example where this visit would have opened a board of the
        // person's own. That board is replaced like any other, so it is offered back like one.
        if (last?.kind === "board" && boardFileText(last.text).ok) {
          offerBack(session, { name: last.name, text: last.text });
        }
        return;
      }
      if (last !== undefined && (last.kind === "example" || boardFileText(last.text).ok)) {
        await documents.show(last);
        return;
      }
      const session = await documents.show({ kind: "board", text: "" }, true);
      // The kept text stays as it is until the next board is kept, for a rescue by hand.
      if (last !== undefined) session.editor.shell.toast({ status: "danger", text: LOST });
    },

    async newBoard() {
      await replace({ kind: "board", text: "" });
      saved(opened.forget());
    },

    async showExample() {
      const open = documents.current();
      const session = open?.kind === "example" ? open : await replace({ kind: "example" });
      saved(opened.keep({ kind: "example" }));
      session.editor.shell.toast({ status: "info", text: KEPT, durationMs: SENTENCE_MS });
    },

    // The file is read before the open board is touched: one that is no board leaves it.
    async openFile(file) {
      const read = await file.text().then(boardFileText, (error: unknown) => {
        console.error("[board-app]", error);
        return { ok: false as const, reason: "the browser could not read it" };
      });
      if (!read.ok) {
        documents.current()?.editor.shell.toast({
          status: "danger",
          text: unreadableFile(file.name, read.reason),
          durationMs: SENTENCE_MS,
        });
        return;
      }
      const document: BoardDocument = { name: file.name, text: read.text };
      const session = await replace({ kind: "board", ...document });
      saved(keepBoard(opened, document));
      if (!namesFiles(read.text)) return;
      session.editor.shell.toast({
        status: "warning",
        text: withoutRepository(file.name),
        durationMs: SENTENCE_MS,
      });
    },

    // What was kept of the example is offered back like a replaced board.
    async resetExample() {
      // the open editors first: what one of them writes while it goes belongs to what is reset
      await documents.close();
      const before = kept.snapshot();
      kept.reset();
      const session = await documents.show({ kind: "example" });
      const { shell } = session.editor;
      if (Object.keys(before).length === 0) {
        shell.toast({ status: "info", text: "Example reset" });
        return;
      }
      const undo = async (): Promise<void> => {
        await documents.close();
        saved(kept.restore(before));
        await documents.show({ kind: "example" });
      };
      session.offer(
        shell.toast({
          status: "info",
          text: "Example reset",
          action: { label: "Undo", onSelect: () => void run(undo) },
        }),
      );
    },

    download() {
      const session = documents.current();
      if (!session) return;
      const fileName = downloadName(session.name);
      const { shell, modeler } = session.editor;
      try {
        downloadText(on.page, modeler.exportText(), fileName);
        shell.toast({ status: "success", text: `Exported ${fileName}.` });
      } catch (error) {
        console.error("[board-app]", error);
        shell.toast({ status: "danger", text: `Couldn't export ${fileName}. Try again.` });
      }
    },

    // The model picker of a board without a repository offers nothing, and it is the renderer's:
    // the page cannot write into it. So the page says why when a person goes to it.
    modelPickerUsed() {
      const session = documents.current();
      if (session?.kind !== "board") return;
      session.editor.shell.toast({
        status: "info",
        text: NO_MODELS_TO_ADD,
        durationMs: SENTENCE_MS,
      });
    },
  };
}
