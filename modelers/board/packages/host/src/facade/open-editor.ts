/**
 * The facade: what a host's `open()` hands the board at once. The board has no loading look and
 * no retry, so the editor of a model node is there from the first moment: it loads the notation's
 * code and the file's text, says inside the element what it waits for or what went wrong, follows
 * the file when it moves, and opens a file that was not there once the list of paths has it.
 */
import type { BoardFiles, TextSession } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

import { bindTextSession } from "../binding/text-session.js";
import type { EditorState } from "../binding/types.js";
import { embedModeler, type EmbeddedModeler } from "../embed/embed-modeler.js";
import { loadEditor, type EditorEntry } from "../registry.js";

/** the line of a file its modeler refuses, in a host that has an editor of its own for the file */
export const INVALID_TEXT =
  "This file cannot be shown as it is. Open it in its own editor to repair it.";

const STATE_TEXT: Record<Exclude<EditorState["kind"], "ok" | "invalid">, string> = {
  loading: "Loading…",
  gone: "This file is gone. The board keeps its place.",
  failed: "This file could not be opened.",
};

export interface OpenEditorOptions {
  entry: EditorEntry;
  files: BoardFiles;
  containHistoryKeys?: boolean | undefined;
  /**
   * The line of a file its modeler refuses: what the person can do about it in this host.
   * Absent: `INVALID_TEXT`, which is true only where the file has an editor of its own.
   */
  invalidText?: string | undefined;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function stateBadge(
  element: HTMLElement,
  invalidText: string,
): { show(state: EditorState): void; remove(): void } {
  const badge = element.ownerDocument.createElement("div");
  badge.className = "board-host-state";
  element.append(badge);
  return {
    show(state) {
      element.dataset.embedState = state.kind === "ok" ? "ready" : state.kind;
      badge.hidden = state.kind === "ok";
      if (state.kind === "ok") badge.textContent = "";
      else if (state.kind === "failed") badge.textContent = `${STATE_TEXT.failed} ${state.message}`;
      else if (state.kind === "invalid") badge.textContent = invalidText;
      else badge.textContent = STATE_TEXT[state.kind];
      // what the modeler said of the text, for whoever repairs it
      if (state.kind === "invalid") badge.title = state.message;
      else badge.removeAttribute("title");
    },
    remove() {
      badge.remove();
      delete element.dataset.embedState;
    },
  };
}

export function openEditor(
  context: EmbeddedEditorContext,
  options: OpenEditorOptions,
): EmbeddedEditor {
  const { element, path } = context;
  const { files, entry } = options;
  const badge = stateBadge(element, options.invalidText ?? INVALID_TEXT);
  badge.show({ kind: "loading" });

  let inner: EmbeddedModeler | undefined;
  let session: TextSession | undefined;
  let ended = false;
  let wantsFocus = false;
  /** the file could not be opened: it may come later, and the list of paths says when */
  let unopened = false;
  const offMoved = files.onMoved((moves) => {
    const move = moves.find((one) => one.from === path);
    if (move && !ended) context.relocate(move.to);
  });
  const mount = async (): Promise<void> => {
    // Kept apart from the code's load: a session that arrives after the load failed, or after the
    // node went, is still one this editor opened and has to close.
    const opening = files.openText(path).then(
      (opened) => {
        if (ended) opened.close();
        else session = opened;
        return opened;
      },
      (error: unknown) => {
        unopened = true;
        throw error;
      },
    );
    const [module, opened] = await Promise.all([loadEditor(entry), opening]);
    if (ended) return;
    inner = embedModeler(context, {
      module,
      notation: entry.notation,
      bind: bindTextSession(opened, module.text),
      insets: entry.insets,
      containHistoryKeys: options.containHistoryKeys,
      onState: badge.show,
    });
    if (wantsFocus && context.armed()) inner.focus?.();
    return inner.ready;
  };
  const failed = (error: unknown): void => {
    if (!ended) badge.show({ kind: "failed", message: messageOf(error) });
  };
  const ready = mount().catch((error: unknown) => {
    failed(error);
    throw error;
  });
  // The board reads `ready` only of an editor whose node is still there: a failure that nobody
  // waits for is said in the element and is no unhandled rejection of the page.
  ready.catch(() => undefined);
  // A file that comes later, by a checkout or made beside the board: the board mounts no node
  // anew for it, so the editor asks again whenever the list changes and has its path. `ready`
  // stays as the first try settled it, and the element says what the last try came to.
  const offPaths = files.onPaths(() => {
    if (ended || !unopened || !files.paths().includes(path)) return;
    unopened = false;
    mount().catch(failed);
  });
  return {
    ready,
    release: () => inner?.release(),
    focus() {
      wantsFocus = true;
      inner?.focus?.();
    },
    destroy() {
      ended = true;
      offMoved();
      offPaths();
      inner?.destroy();
      session?.close();
      badge.remove();
    },
  };
}
