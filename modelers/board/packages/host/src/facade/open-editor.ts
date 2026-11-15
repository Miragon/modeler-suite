/**
 * The facade: what a host's `open()` hands the board at once. The board has no loading look and
 * no retry, so the editor of a model node is there from the first moment: it loads the notation's
 * code and the file's text, says inside the element what it waits for or what went wrong, and
 * follows the file when it moves.
 */
import type { BoardFiles, TextSession } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

import { bindTextSession } from "../binding/text-session.js";
import type { EditorState } from "../binding/types.js";
import { embedModeler, type EmbeddedModeler } from "../embed/embed-modeler.js";
import { loadEditor, type EditorEntry } from "../registry.js";

const STATE_TEXT: Record<Exclude<EditorState["kind"], "ok">, string> = {
  loading: "Loading…",
  invalid: "This file cannot be shown as it is. Open it in its own editor to repair it.",
  gone: "This file is gone. The board keeps its place.",
  failed: "This file could not be opened.",
};

export interface OpenEditorOptions {
  entry: EditorEntry;
  files: BoardFiles;
  containHistoryKeys?: boolean | undefined;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function stateBadge(element: HTMLElement): { show(state: EditorState): void; remove(): void } {
  const badge = element.ownerDocument.createElement("div");
  badge.className = "board-host-state";
  element.append(badge);
  return {
    show(state) {
      element.dataset.embedState = state.kind === "ok" ? "ready" : state.kind;
      badge.hidden = state.kind === "ok";
      if (state.kind === "ok") badge.textContent = "";
      else if (state.kind === "failed") badge.textContent = `${STATE_TEXT.failed} ${state.message}`;
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
  const badge = stateBadge(element);
  badge.show({ kind: "loading" });

  let inner: EmbeddedModeler | undefined;
  let session: TextSession | undefined;
  let ended = false;
  let wantsFocus = false;
  const offMoved = options.files.onMoved((moves) => {
    const move = moves.find((one) => one.from === path);
    if (move && !ended) context.relocate(move.to);
  });
  // Kept apart from the code's load: a session that arrives after the load failed, or after the
  // node went, is still one this editor opened and has to close.
  const opening = options.files.openText(path).then((opened) => {
    if (ended) opened.close();
    else session = opened;
    return opened;
  });
  const mount = async (): Promise<void> => {
    const [module, opened] = await Promise.all([loadEditor(options.entry), opening]);
    if (ended) return;
    inner = embedModeler(context, {
      module,
      notation: options.entry.notation,
      bind: bindTextSession(opened, module.text),
      insets: options.entry.insets,
      containHistoryKeys: options.containHistoryKeys,
      onState: badge.show,
    });
    if (wantsFocus && context.armed()) inner.focus?.();
    return inner.ready;
  };
  const ready = mount().catch((error: unknown) => {
    if (!ended) badge.show({ kind: "failed", message: messageOf(error) });
    throw error;
  });
  // The board reads `ready` only of an editor whose node is still there: a failure that nobody
  // waits for is said in the element and is no unhandled rejection of the page.
  ready.catch(() => undefined);
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
      inner?.destroy();
      session?.close();
      badge.remove();
    },
  };
}
