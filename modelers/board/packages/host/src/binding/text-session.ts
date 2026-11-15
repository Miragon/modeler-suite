/**
 * A text session as a binding: imports one after the other, the view kept across a re-import, no
 * echo, and the notation's own rules for the text that is written.
 */
import type { TextSession } from "@miragon/board-files";

import type { EmbeddableModeler, TextRules } from "../registry.js";
import type { BindModel } from "./types.js";

const plainRules = (modeler: EmbeddableModeler): TextRules => ({
  exported: () => modeler.exportText(),
  same: (text, reconciled) => text === reconciled,
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function bindTextSession(
  session: TextSession,
  rules?: ((modeler: EmbeddableModeler) => TextRules) | undefined,
): BindModel {
  return (modeler, report) => {
    const text = (rules ?? plainRules)(modeler);
    /** the text the file has, as far as the canvas shows it: imported last or written last */
    let reconciled: string | undefined;
    /** why the file's text was refused; the canvas then shows `reconciled` */
    let problem: string | undefined;
    let gone = false;
    let bound = true;
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
    const show = async (): Promise<void> => {
      if (!bound) return;
      // Read when the import starts, not when it was asked for: a text that waited behind a
      // gesture or behind another import lacks what this session has written since.
      const incoming = session.text();
      if (
        reconciled !== undefined &&
        problem === undefined &&
        drawsTheCanvas(incoming, reconciled)
      ) {
        reconciled = incoming;
        return;
      }
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
      enqueue().catch((error: unknown) => console.error("[board-host]", session.path, error));
    };
    const offChange = modeler.onContentChanged(() => {
      if (!bound || reconciled === undefined || problem !== undefined || session.readOnly) return;
      const written = text.exported(reconciled);
      if (written === reconciled) return;
      reconciled = written;
      session.write(written);
    });
    let waiting = false;
    const offGesture = modeler.interaction?.onChange((active) => {
      if (active || !waiting) return;
      waiting = false;
      // never from the listener itself (the contract): behind whatever import is pending
      queueMicrotask(later);
    });
    const offReplace = session.onReplace(() => {
      // a change from outside waits for the end of a gesture the person holds
      if (modeler.interaction?.active() === true) waiting = true;
      else later();
    });
    const offAvailable = session.onAvailable((available) => {
      gone = !available;
      tell();
    });
    return {
      ready: enqueue(),
      unbind() {
        bound = false;
        offChange();
        offGesture?.();
        offReplace();
        offAvailable();
      },
    };
  };
}
