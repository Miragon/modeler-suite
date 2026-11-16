/**
 * The facade: what a host's `open()` hands the board at once. The board has no loading look and
 * no retry, so the editor of a model node is there from the first moment: it loads the notation's
 * code and the file's text, says inside the element what it waits for or what went wrong, follows
 * the file when it moves, and opens a file that was not there once the list of paths has it.
 */
import type { BoardFiles, DropReason, TextSession } from "@miragon/board-files";
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

import { bindTextSession, type TextBinding } from "../binding/text-session.js";
import type { EditorNotice, EditorState } from "../binding/types.js";
import { embedModeler } from "../embed/embed-modeler.js";
import { loadEditor, type EditorEntry } from "../registry.js";
import type { EditorHandover, EditorVoice, MountedEditor } from "./handover.js";

/** the line of a file its modeler refuses, in a host that has an editor of its own for the file */
export const INVALID_TEXT =
  "This file cannot be shown as it is. Open it in its own editor to repair it.";

const STATE_TEXT: Record<Exclude<EditorState["kind"], "ok" | "invalid">, string> = {
  loading: "Loading…",
  gone: "This file is gone. The board keeps its place.",
  failed: "This file could not be opened.",
};

/** what a node says of a change that is not in its file, by the reason the files port gives */
export const DROPPED_TEXT: Record<DropReason, string> = {
  crossed:
    "Your last change was dropped: this file changed elsewhere at the same time. Make it again on what you see now.",
  "too-large":
    "Your last change was dropped: it would make this file too large for a board. Remove something, then make it again.",
  refused: "Your last change was dropped: this file could not be written. Make it again.",
};

/** how long a node says that a change was dropped, unless the person changes the model first */
export const DROPPED_NOTICE_MS = 15_000;

export interface OpenEditorOptions {
  entry: EditorEntry;
  files: BoardFiles;
  containHistoryKeys?: boolean | undefined;
  /**
   * The line of a file its modeler refuses: what the person can do about it in this host.
   * Absent: `INVALID_TEXT`, which is true only where the file has an editor of its own.
   */
  invalidText?: string | undefined;
  /**
   * One object for every editor of a board (`createEditorHandover`). With it a model whose file
   * moves keeps its editor: the board destroys this editor and opens the next one at the new
   * path, and the next one takes the modeler over as it is. Absent: the editor of a moved file
   * is made anew.
   */
  handover?: EditorHandover | undefined;
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

/**
 * The line a node says once: a change of the person's that is not in the file. It goes with the
 * next change the person makes on the model, and by itself after `DROPPED_NOTICE_MS`.
 */
function noticeLine(element: HTMLElement): { say(notice: EditorNotice): void; remove(): void } {
  const line = element.ownerDocument.createElement("div");
  line.className = "board-host-notice";
  line.setAttribute("role", "status");
  line.hidden = true;
  element.append(line);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = (): void => {
    clearTimeout(timer);
    timer = undefined;
    line.hidden = true;
    line.textContent = "";
    delete line.dataset.reason;
  };
  return {
    say(notice) {
      hide();
      if (notice.kind !== "dropped") return;
      line.dataset.reason = notice.reason;
      line.textContent = DROPPED_TEXT[notice.reason];
      line.hidden = false;
      timer = setTimeout(hide, DROPPED_NOTICE_MS);
    },
    remove() {
      hide();
      line.remove();
    },
  };
}

export function openEditor(
  context: EmbeddedEditorContext,
  options: OpenEditorOptions,
): EmbeddedEditor {
  const { element, path, nodeId } = context;
  const { files, entry, handover } = options;
  const badge = stateBadge(element, options.invalidText ?? INVALID_TEXT);
  const words = noticeLine(element);
  badge.show({ kind: "loading" });

  let mounted: MountedEditor | undefined;
  let session: TextSession | undefined;
  let ended = false;
  let wantsFocus = false;
  /** the file could not be opened: it may come later, and the list of paths says when */
  let unopened = false;
  /** where the node was sent when its file moved; the board destroys this editor for it */
  let sentTo: string | undefined;
  const hear = (voice: EditorVoice): void => {
    voice.onState = badge.show;
    voice.onNotice = words.say;
  };
  const offMoved = files.onMoved((moves) => {
    const move = moves.find((one) => one.from === path);
    if (!move || ended) return;
    sentTo = move.to;
    context.relocate(move.to);
  });
  /** the session of this path, closed again where the node went before it arrived */
  const openSession = (): Promise<TextSession> =>
    files.openText(path).then(
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
  const mount = async (): Promise<void> => {
    // Kept apart from the code's load: a session that arrives after the load failed, or after the
    // node went, is still one this editor opened and has to close.
    const [module, opened] = await Promise.all([loadEditor(entry), openSession()]);
    if (ended) return;
    const voice: EditorVoice = {
      state: { kind: "loading" },
      onState: undefined,
      onNotice: undefined,
    };
    hear(voice);
    let binding: TextBinding | undefined;
    const inner = embedModeler(context, {
      module,
      notation: entry.notation,
      bind(modeler, report, notice) {
        binding = bindTextSession(opened, module.text)(modeler, report, notice);
        return binding;
      },
      insets: entry.insets,
      containHistoryKeys: options.containHistoryKeys,
      onState(state) {
        voice.state = state;
        voice.onState?.(state);
      },
      onNotice: (notice) => voice.onNotice?.(notice),
    });
    if (binding === undefined) throw new Error("the editor was not bound to its file");
    mounted = { notation: entry.notation, inner, binding, voice };
    if (wantsFocus && context.armed()) inner.focus?.();
    return inner.ready;
  };
  /**
   * The modeler this node had under the path its file left: it stands in this element now and
   * goes on with the text of this path. A file that cannot be opened here after all leaves the
   * node as one whose file could not be opened.
   */
  const takeOver = async (kept: MountedEditor): Promise<void> => {
    kept.inner.rehome(context);
    mounted = kept;
    hear(kept.voice);
    badge.show(kept.voice.state);
    const opened = await openSession().catch((error: unknown) => {
      if (ended) return undefined;
      mounted = undefined;
      kept.inner.destroy();
      failed(error);
      return undefined;
    });
    if (opened !== undefined && !ended) kept.binding.follow(opened);
  };
  const failed = (error: unknown): void => {
    if (!ended) badge.show({ kind: "failed", message: messageOf(error) });
  };
  const kept = handover?.take(nodeId, path, entry.notation);
  const ready = (kept ? takeOver(kept) : mount()).catch((error: unknown) => {
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
    release: () => mounted?.inner.release(),
    focus() {
      wantsFocus = true;
      mounted?.inner.focus?.();
    },
    destroy() {
      ended = true;
      offMoved();
      offPaths();
      words.remove();
      if (mounted && handover && sentTo !== undefined) {
        // The node goes on at the path its file has now. The session of the old path ends
        // here; the modeler waits for the editor the board opens next.
        mounted.binding.follow(undefined);
        handover.leave(nodeId, sentTo, mounted);
      } else {
        mounted?.inner.destroy();
      }
      session?.close();
      badge.remove();
    },
  };
}
