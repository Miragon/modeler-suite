/**
 * A mounted editor on its way from one path of its node to the next. The board answers a
 * `relocate` by destroying the node's editor and opening one anew at the new path, both in one
 * commit: the editor that is destroyed leaves its modeler here, and the one that is opened takes
 * it. So a model whose file moved keeps its canvas, its view, its history and what is selected.
 */
import type { TextBinding } from "../binding/text-session.js";
import type { EditorNotice, EditorState } from "../binding/types.js";
import type { EmbeddedModeler } from "../embed/embed-modeler.js";

/** what a mounted editor says, and to whom: the facade that has it at the moment */
export interface EditorVoice {
  /** the state the binding reported last */
  state: EditorState;
  onState: ((state: EditorState) => void) | undefined;
  onNotice: ((notice: EditorNotice) => void) | undefined;
}

/** a mounted editor with what goes on with it */
export interface MountedEditor {
  readonly notation: string;
  readonly inner: EmbeddedModeler;
  readonly binding: TextBinding;
  readonly voice: EditorVoice;
}

export interface EditorHandover {
  /** by the editor that is destroyed after its node was sent to the path `to` */
  leave(nodeId: string, to: string, editor: MountedEditor): void;
  /** by the editor that is opened: this node's modeler, where it was sent here and is of this notation */
  take(nodeId: string, path: string, notation: string): MountedEditor | undefined;
}

/**
 * One for every editor of a board: `modelsFrom` makes it, and a host that calls `openEditor`
 * itself passes the same one to each call.
 */
export function createEditorHandover(): EditorHandover {
  const waiting = new Map<string, { to: string; editor: MountedEditor }>();
  return {
    leave(nodeId, to, editor) {
      const entry = { to, editor };
      // one that still waits under this node was taken by nobody
      waiting.get(nodeId)?.editor.inner.destroy();
      waiting.set(nodeId, entry);
      // The board opens the node's next editor in the commit that destroyed this one. What is
      // still here a microtask later has no editor to go to: the node went, or shows another
      // file by now.
      queueMicrotask(() => {
        if (waiting.get(nodeId) !== entry) return;
        waiting.delete(nodeId);
        editor.inner.destroy();
      });
    },
    take(nodeId, path, notation) {
      const entry = waiting.get(nodeId);
      if (entry?.to !== path || entry.editor.notation !== notation) return undefined;
      waiting.delete(nodeId);
      return entry.editor;
    },
  };
}
