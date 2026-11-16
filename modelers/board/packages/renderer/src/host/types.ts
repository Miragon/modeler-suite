/**
 * What a board asks of the place it runs in, and what an editor that shows a model in a node
 * offers the board. Types only: no React, no React Flow, no Yjs. A path is repository-relative
 * with forward slashes, exactly what a node stores.
 *
 * Everything the board calls here is host code. Where the board catches a throw, the call says
 * what happens then; a call that says nothing of a throw must not throw. `list()`, `describe()`
 * and `read()` are asked while the board renders: they answer at once, from memory.
 */
import type { Point } from "@miragon/board-schema-model";

/**
 * Every part is optional and independent of the others. The board keeps what it knows of a part
 * by the part's object, so `models`, `images` and `references` stay the same objects for the
 * life of a board.
 */
export interface BoardHost {
  /**
   * The model files a board can show and the editors that show them. Absent: the model picker
   * offers no file, and a model node names its file and says that it cannot be shown here.
   */
  readonly models?: BoardModels | undefined;
  /**
   * The repository's images. Absent: an image node shows its path and the missing-file figure,
   * the toolbar has no Image button, and a pasted or dropped image is answered with a notice.
   */
  readonly images?: BoardImages | undefined;
  /**
   * What the models say about each other, drawn as arrows that are never stored. Absent: none.
   * The board parses no model.
   */
  readonly references?: BoardReferences | undefined;
  /** The people who have THIS board open. Absent: no cursors and no outlines. */
  readonly presence?: BoardPresence | undefined;
}

/** What a node header, the Done control and the model picker call a file. */
export interface ModelDescription {
  title: string;
  /** a word or two beside the title: "BPMN", "Wardley Map" */
  kind?: string | undefined;
}

export interface BoardModels {
  /**
   * The paths the model picker offers, in the order it shows them. Read as an external store
   * whenever the toolbar renders, best as the same array until `onChange` reported a change. A
   * new array with the same paths in the same order is taken for the one before, so a list that
   * is built per call costs a comparison and no render. A throw, or an answer that is no array,
   * is reported once through `console.error` (prefix "[board]") and answered with the list that
   * came back last, or with the empty one.
   */
  list(): readonly string[];
  /** After the list changed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /**
   * Title and kind of the file at `path`, listed or not; never asked for an empty path. Called
   * whenever a node's header, the model picker or the Done control renders. The board has no
   * signal for a description that changes: it shows the new one when it next draws that header
   * or control for another reason. Absent, or undefined for a path: the title is the file name
   * up to its first dot, and there is no kind. A throw is reported once through `console.error`
   * (prefix "[board]") and answered the same way.
   */
  describe?: ((path: string) => ModelDescription | undefined) | undefined;
  /**
   * An editor for the model at `context.path`, mounted into `context.element`. Called for every
   * model node whose path is not empty, whatever kind of file that is: once when the node
   * mounts, synchronously and right after the element was appended to the node, and again when
   * the node's path changes, after the editor of the old path was destroyed. A node that is
   * moved, resized, put into a group or reordered keeps its editor. The element is in the node
   * at that moment and may be scaled: see `EmbeddedEditorContext.element`.
   *
   * Returns the editor, a promise of it (an editor that loads its code or waits for its
   * document), or undefined when this host cannot show the file, at once or as what the promise
   * resolves to: the node then reads "<path> cannot be shown here". A board in a node of a board
   * is not supported, so a host answers undefined for a board file. While a promise is pending
   * the node shows the empty element: there is no loading look, and the node can be armed all
   * the same.
   *
   * A throw or a rejected promise shows its message in the node. A value that is no editor (no
   * `ready` promise, no `release` or `destroy` function) shows "<path>: the host returned no
   * editor". In none of these cases has the board an editor to destroy: what the host opened
   * before it failed, the host closes. There is no retry: the board asks again when the node
   * mounts anew or its path changes.
   */
  open(
    context: EmbeddedEditorContext,
  ): EmbeddedEditor | undefined | Promise<EmbeddedEditor | undefined>;
}

/** What the board tells the editor of ONE model node. */
export interface EmbeddedEditorContext {
  /** the board element this editor belongs to */
  readonly nodeId: string;
  /** the path the node stores */
  readonly path: string;
  /**
   * The element the board made for this editor: class `board-engine`, `data-strategy="overlay"`,
   * `data-armed`, and `data-layout` "preview" or "overlay". The editor fills it and may add
   * classes and data attributes of its own, never a position or a size. A host hides its
   * editor's own chrome in a preview with a rule on `.board-engine[data-armed="false"]`.
   *
   * While the model is a preview the element is in the node, in a subtree that is `inert` and
   * that the board scales with a CSS transform. Its layout size stays the node body's whatever
   * the board's zoom is; its rectangle on screen does not. So an editor reads layout px
   * (`clientWidth`, `offsetWidth`) for its first fit and for the place of its own chrome, never
   * client rects (`getBoundingClientRect`): `open()` is always called with the element in the
   * node, and the node is armed at the same layout size, so no resize says that the scale went.
   *
   * While the node is armed the element is in a screen-space layer above the board, at board
   * zoom exactly 1, where the board sets its place and its size. The editor must survive that
   * re-parenting and follow the element's size. `EmbeddedEditor.focus()` is the one call that
   * comes after the move: an editor that measured the screen as a preview lays out again there.
   * The board puts no transformed ancestor above the layer. The element a board is attached to
   * and its ancestors must carry none either: no `transform`, and nothing else that makes an
   * element the containing block of its fixed descendants (`filter`, `perspective`, `contain`,
   * `will-change`), or a `position: fixed` popup of the editor is placed against that ancestor.
   *
   * The element inherits the board's type, not the page's (the board's font stack, 16 px, a line
   * height of 1.5, its text colour, `tab-size: 4`), and in a preview also `cursor: grab` and
   * `user-select: none`: an editor sets what it needs on its own root. The board resets nothing
   * below the element. In the layer nothing clips it either: an editor whose content is larger
   * than the element clips itself, or it paints over the board and takes the pointer there.
   *
   * A paste and a dropped file inside the armed element are the editor's: the board takes
   * neither. Of a dropped file it only cancels the browser's default, which would leave the page
   * for the file.
   */
  readonly element: HTMLElement;
  /**
   * Whether the person edits this model right now. A preview takes no pointer and no focus (its
   * subtree is `inert`), but a listener the editor keeps on `document` or `window` still runs:
   * such a listener asks `armed()` first, so that of all the editors on a board only the armed
   * one acts. The answer means nothing once `destroy()` was called.
   */
  armed(): boolean;
  /**
   * Called inside the commit that armed or disarmed the node: `armed()` already returns the new
   * value and `data-armed` is written, and the element is moved right after. Before a disarm the
   * editor's `release()` has run. Not called when the node or the board goes while the node is
   * armed: `release()` and `destroy()` are what the editor hears then. A listener that throws is
   * caught and logged like a throw of the editor, and the board goes on. Returns the unsubscribe.
   */
  onArmedChange(listener: (armed: boolean) => void): () => void;
  /**
   * The model lives at another path now (it was renamed or moved): the board writes the path
   * into the node, destroys this editor and opens one anew at the new path. An armed node stays
   * armed: its old editor is destroyed with no `release()` before, and the new one is opened
   * with `armed()` true. The write is nobody's gesture: `onContentChanged` reports it as it
   * reports a gesture, and it is never on the board's history, so no undo takes it back. A
   * context speaks for one node on one path: the call is ignored once the node is gone, its path
   * has changed or the board was destroyed.
   */
  relocate(path: string): void;
}

/**
 * One model's editor, as the board drives it. Its callbacks are host code: a throw from one of
 * them is caught and written to the board's log (a `console.debug` line that starts with
 * "[board]"), and the board goes on.
 */
export interface EmbeddedEditor {
  /**
   * Settles once the model is drawn and fitted in the element, or could not be. The first fit
   * is the editor's own, clear of its own chrome and in layout px (see
   * `EmbeddedEditorContext.element`). Nothing a person sees waits for it: only the board's own
   * registry reads it, for this package's tests and its bench, and an editor whose `ready` never
   * settles is placed, armed and focused like any other. A rejection shows nothing in the node,
   * which keeps what the editor drew; its message goes to the board's log. It has to be a
   * promise: what `open()` hands over without one is no editor.
   */
  readonly ready: Promise<void>;
  /**
   * Called BEFORE an armed node becomes a preview, synchronously, while `armed()` still returns
   * true and the element is still in the layer: end a running gesture, close or commit label
   * editors and popups, drop the selection and the focus, inside the element only. Called the
   * same way before `destroy()` when the node or the whole board goes while the node is armed,
   * so what is open can still be committed. A throw is caught and logged, and what follows the
   * call follows all the same.
   */
  release(): void;
  /**
   * Take the keys. Called after the board moved the element into the layer (the move takes the
   * focus from whatever had it inside) and for a node that is armed from its first moment; it
   * can come twice in a row. Optional in the type and needed in practice: without it the focus
   * is on the page's body after the arming, and neither the editor nor the board gets the keys.
   * It is also where an editor lays out again what it measured as a preview (see
   * `EmbeddedEditorContext.element`). A throw is caught and logged, and the node stays armed.
   */
  focus?: (() => void) | undefined;
  /**
   * The editor first, then whatever it was bound to: an editor ends its own session here. Called
   * once, after which the board removes the element: when the node goes, when its path changes,
   * when the board is destroyed, and as the only call for an editor whose promise resolves after
   * one of these. It can come while `armed()` is true: after a `release()` when the node or the
   * board goes, and with none before it when only the path changed (see
   * `EmbeddedEditorContext.relocate`). A throw is caught and logged, and the element is removed
   * all the same.
   *
   * The board's own `destroy()` returns BEFORE the editors are destroyed: the canvas is
   * unmounted a microtask later, and nothing tells the host when. A host that ends the sessions
   * itself, right after it destroyed the board, ends them under editors that are still bound.
   */
  destroy(): void;
}

export interface BoardImages {
  /**
   * The bytes of the image at `path`, or undefined. Read as an external store whenever an image
   * node renders: the SAME Blob for a path until `onChange` reported a change. A new Blob per
   * call ends the node that asked in React's "Maximum update depth exceeded", and a throw ends
   * it too: the error stands in that node's place.
   *
   * There is no answer for an image that is still loading: undefined draws the missing-file
   * figure, and a host that loads its images reports `onChange` once it has the bytes.
   *
   * Without `taken`, also asked whether a path is in use before a new image is stored. A host
   * that offers `store` and no `taken` therefore has the bytes of every image of the repository
   * at hand, loaded by a node or not, or a new image replaces a file it has not loaded.
   */
  read(path: string): Blob | undefined;
  /** After an image was added, loaded, replaced or removed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /**
   * Whether `path` is in use in the repository, loaded or not. Present: asked in place of `read`
   * before a new image is stored, for "assets/<name>" and then for the numbered names
   * ("assets/<name>-2", "-3" and so on) until one is free. The board asks on until then, with
   * `taken` as with `read`: a host that calls every path in use is asked without end. A throw
   * refuses the image as a throw from `store` does.
   */
  taken?: ((path: string) => boolean) | undefined;
  /**
   * Stores a new image under `path`: "assets/<name>", a path that `taken` (without it `read`)
   * has just answered free. May return a promise. The board writes the image node once `store`
   * returned or its promise resolved, and the node shows the missing-file figure unless `read`
   * has the bytes by then. The files of one paste, drop or pick are stored one after the other.
   * A throw or a rejection refuses the image: the person gets a notice with the error's message,
   * and no node is written. A board that is destroyed while it still reads a picture's size does
   * not call `store` for it, and one that is destroyed while a promise is pending writes no node
   * when it settles.
   * Absent: the toolbar has no Image button, and a pasted or dropped image is answered with a
   * notice.
   */
  store?: ((path: string, bytes: Blob) => void | Promise<void>) | undefined;
}

/** One file says something about another: drawn as an arrow between their nodes, never stored. */
export interface BoardReference {
  /** path of the model that refers */
  from: string;
  /** path of the model it refers to */
  to: string;
  /** what the arrow is tagged with: "calls", "decides" */
  relation: string;
}

export interface BoardReferences {
  /**
   * Every reference the host knows right now. The board draws those whose two files both have a
   * node. Read as an external store whenever the canvas renders, best as the same array until
   * `onChange` reported a change. A new array with the same references in the same order
   * (`from`, `to` and `relation` each) is taken for the one before. A throw, or an answer that
   * is no array, is reported once through `console.error` (prefix "[board]") and answered with
   * the list that came back last, or with none.
   */
  list(): readonly BoardReference[];
  /** After a reference may have changed; the host rests its own parsing. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

/** Where a person is on the board, in board coordinates. */
export interface BoardCanvasPresence {
  cursor: Point | null;
  selection: string[];
}

/** Who a peer is. Untrusted input: the board sanitises the name and takes hex colours only. */
export interface BoardPresenceUser {
  name: string;
  color: string;
  /** "agent" draws the outline of an agent's selection differently */
  kind?: string | undefined;
}

/** A remote peer who announced themselves; `canvas` is absent until they move or select. */
export interface BoardPeer {
  clientId: number;
  user: BoardPresenceUser;
  canvas?: BoardCanvasPresence | undefined;
}

export interface BoardPresence {
  /**
   * This person's cursor and selection on the board; null takes both back. Inside an armed
   * editor the board publishes no cursor: that one is the editor's, in the model's own room.
   */
  setLocal(presence: BoardCanvasPresence | null): void;
  /**
   * Calls back at once with the current peers, then on every change. Returns the unsubscribe.
   * What the listener is given is untrusted too: a list that is no array counts as nobody, and
   * an entry that names no `user` is not drawn.
   */
  onRemote(listener: (peers: BoardPeer[]) => void): () => void;
}
