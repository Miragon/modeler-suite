/**
 * A text session as a binding: imports one after the other, the view kept across a re-import, no
 * echo, and the notation's own rules for the text that is written. A write says which text it
 * was made from, so that one made while a newer text of the file waits to be imported is dropped
 * by the session and never replaces that text. A file that moves keeps its binding: the session
 * of the new path takes the place of the old one, and the canvas is left as it is. A write that
 * was on its way to the old path when the file left it is answered by nobody: the text of the new
 * path says whether it landed, and where it did not, the binding says that it was dropped.
 */
import type { TextSession } from "@miragon/board-files";

import type { EmbeddableModeler, TextRules } from "../registry.js";
import type { EditorNotice, EditorState, ModelBinding } from "./types.js";

/** A binding to a text session that can go on with another one. */
export interface TextBinding extends ModelBinding {
  /**
   * The file has another path. With undefined the binding lets go of its session: it hears
   * nothing of it and writes nothing, and the canvas and the state stay as they are. With the
   * session of the new path it goes on: a text that draws what the canvas shows is not
   * imported, so the editor keeps its history, its view and what is selected; any other text
   * is imported as a change from outside is. The binding closes no session.
   */
  follow(next: TextSession | undefined): void;
}

const plainRules = (modeler: EmbeddableModeler): TextRules => ({
  exported: () => modeler.exportText(),
  same: (text, reconciled) => text === reconciled,
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function bindTextSession(
  first: TextSession,
  rules?: ((modeler: EmbeddableModeler) => TextRules) | undefined,
): (
  modeler: EmbeddableModeler,
  report: (state: EditorState) => void,
  notice?: ((notice: EditorNotice) => void) | undefined,
) => TextBinding {
  return (modeler, report, notice) => {
    const text = (rules ?? plainRules)(modeler);
    /** undefined between two paths of a file that moves */
    let session: TextSession | undefined = first;
    /** the text the file has, as far as the canvas shows it: imported last or written last */
    let reconciled: string | undefined;
    /** why the file's text was refused; the canvas then shows `reconciled` */
    let problem: string | undefined;
    let gone = false;
    let bound = true;
    /** the canvas was changed while its file was between two paths, and nothing was written */
    let unwritten = false;
    /** a write went to the session, and the file has told no text since: nothing says it landed */
    let unconfirmed = false;
    /** such a write was on its way when the file left its path, and the old path answers no more */
    let leftBehind = false;
    let imports: Promise<void> = Promise.resolve();
    const tell = (): void => {
      if (gone) report({ kind: "gone" });
      else if (problem !== undefined) report({ kind: "invalid", message: problem });
      else if (reconciled !== undefined) report({ kind: "ok" });
    };
    const drawsTheCanvas = (incoming: string, shown: string): boolean => {
      if (incoming === shown) return true;
      try {
        return text.same(incoming, shown);
      } catch {
        // rules that cannot read a text do not call it the same: the import says what is wrong
        return false;
      }
    };
    /** the canvas as a text of the file, where it is another one than the file has */
    const write = (): void => {
      if (!bound || session === undefined || session.readOnly) return;
      if (reconciled === undefined || problem !== undefined) return;
      const base = reconciled;
      const written = text.exported(base);
      if (written === base) return;
      // before the write, which may be dropped at once and say so
      notice?.({ kind: "edited" });
      reconciled = written;
      unconfirmed = true;
      // Where the file has another text than `base` by now, the session drops this write. That
      // text was told here and its import waits, behind a gesture or behind another import: it
      // takes the canvas back to what the file has, and the person sees the change go.
      session.write(written, base);
    };
    const show = async (): Promise<void> => {
      if (!bound || session === undefined) return;
      // Read when the import starts, not when it was asked for: a text that waited behind a
      // gesture or behind another import lacks what this session has written since.
      const incoming = session.text();
      const waited = unwritten;
      const left = leftBehind;
      unwritten = false;
      leftBehind = false;
      // the canvas is held against the file's text here: a later drop is the session's to say
      unconfirmed = false;
      if (
        reconciled !== undefined &&
        problem === undefined &&
        drawsTheCanvas(incoming, reconciled)
      ) {
        reconciled = incoming;
        // what the person changed while the file had no path goes into the file now
        if (waited) write();
        return;
      }
      // The file's text takes the place of that change: it has no text to be written on. The same
      // for a write the old path never took: the file moved under it, and nobody else says so.
      if (waited || left) notice?.({ kind: "dropped", reason: "crossed" });
      // L5: a re-import keeps the view the person has
      const view = reconciled === undefined ? undefined : modeler.getViewState();
      try {
        await modeler.importText(incoming);
      } catch (error) {
        // L7: the last good canvas stays. It may not write: the text is being repaired elsewhere
        problem = messageOf(error);
        if (bound) tell();
        return;
      }
      if (!bound) return;
      reconciled = incoming;
      problem = undefined;
      text.imported?.();
      if (view !== undefined) modeler.setViewState(view);
      tell();
    };
    const enqueue = (): Promise<void> => {
      const step = imports.then(show);
      // a later import still runs after one whose report threw
      imports = step.catch(() => undefined);
      return step;
    };
    const later = (): void => {
      const { path } = session ?? first;
      enqueue().catch((error: unknown) => console.error("[board-host]", path, error));
    };
    const offChange = modeler.onContentChanged(() => {
      if (bound && session === undefined) unwritten = true;
      else write();
    });
    let waiting = false;
    const offGesture = modeler.interaction?.onChange((active) => {
      if (active || !waiting) return;
      waiting = false;
      // never from the listener itself (the contract): behind whatever import is pending
      queueMicrotask(later);
    });
    /** the file may have another text than the canvas shows */
    const arrived = (): void => {
      // a change from outside waits for the end of a gesture the person holds
      if (modeler.interaction?.active() === true) waiting = true;
      else later();
    };
    const listen = (to: TextSession): Array<() => void> => [
      to.onReplace(arrived),
      to.onAvailable((available) => {
        gone = !available;
        tell();
      }),
      to.onDropped?.((reason) => notice?.({ kind: "dropped", reason })) ?? (() => undefined),
    ];
    let offSession = listen(first);
    const leave = (): void => {
      for (const off of offSession.splice(0)) off();
    };
    return {
      ready: enqueue(),
      follow(next) {
        if (!bound) return;
        leave();
        // the session that is left tells nothing more, also not that it dropped a write
        leftBehind ||= unconfirmed;
        session = next;
        if (next === undefined) return;
        offSession = listen(next);
        // the file is there under its new path, whatever its old path said last
        if (gone) {
          gone = false;
          tell();
        }
        arrived();
      },
      unbind() {
        bound = false;
        offChange();
        offGesture?.();
        leave();
      },
    };
  };
}
