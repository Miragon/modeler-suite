/**
 * What a board asks of the place it runs in, and what an editor that shows a model in a node
 * offers the board. Types only: no React, no React Flow, no Yjs. A path is repository-relative
 * with forward slashes, exactly what a node stores.
 */
import type { Point } from "@miragon/board-schema-model";

/** Every part is optional and independent of the others. */
export interface BoardHost {
  /**
   * The model files a board can show and the editors that show them. Absent: the toolbar offers
   * no model, and a model node names its file and says that it cannot be shown here.
   */
  readonly models?: BoardModels | undefined;
  /**
   * The repository's images. Absent: an image node shows its path and the missing-file figure,
   * and the board offers no upload.
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
   * The paths the model picker offers, in the order it shows them. The SAME array until
   * `onChange` reported a change: the board reads it as an external store.
   */
  list(): readonly string[];
  /** After the list changed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /**
   * Title and kind of the file at `path`, listed or not. Absent, or undefined for a path: the
   * title is the file name up to its first dot, and there is no kind.
   */
  describe?: ((path: string) => ModelDescription | undefined) | undefined;
  /**
   * An editor for the model at `context.path`, mounted into `context.element`. Called once per
   * model node and path, synchronously while the node mounts and right after the element was
   * appended to the node, and again when the node's path changes. Returns the editor, a promise
   * of it (an editor that loads its code or waits for its document), or undefined when this host
   * cannot show the file: the node then says so. A rejected promise or a throw shows its message
   * in the node.
   */
  open(context: EmbeddedEditorContext): EmbeddedEditor | Promise<EmbeddedEditor> | undefined;
}

/** What the board tells the editor of ONE model node. */
export interface EmbeddedEditorContext {
  /** the board element this editor belongs to */
  readonly nodeId: string;
  /** the path the node stores */
  readonly path: string;
  /**
   * The element the board made for this editor (class `board-engine`, `data-armed`, and
   * `data-layout` "preview" or "overlay"). The editor fills it and may add classes and data
   * attributes of its own, never a position or a size. The board keeps it in the node while the
   * model is a preview (that subtree is `inert` and scaled with the board) and moves it into a
   * screen-space layer above the board while the node is armed, at board zoom exactly 1 with no
   * transformed ancestor, where the board also sizes it. The editor must survive that
   * re-parenting and follow the element's size. A host hides its editor's own chrome in a
   * preview with a rule on `.board-engine[data-armed="false"]`.
   */
  readonly element: HTMLElement;
  /** Whether the person edits this model right now. A preview takes no input. */
  armed(): boolean;
  /**
   * Called inside the commit that armed or disarmed the node: `armed()` already returns the new
   * value and `data-armed` is written, and the element is moved right after. Returns the
   * unsubscribe.
   */
  onArmedChange(listener: (armed: boolean) => void): () => void;
  /**
   * The model lives at another path now (it was renamed or moved): the board writes the path
   * into the node as one change and opens the editor anew there. Ignored once the node is gone.
   */
  relocate(path: string): void;
}

/** One model's editor, as the board drives it. */
export interface EmbeddedEditor {
  /**
   * Resolves once the model is drawn and fitted in the element (the first fit is the editor's
   * own, clear of its own chrome); rejects with what the node shows instead.
   */
  readonly ready: Promise<void>;
  /**
   * Called BEFORE an armed node becomes a preview, synchronously, while `armed()` still returns
   * true and the element is still in the layer: end a running gesture, close or commit label
   * editors and popups, drop the selection and the focus, inside the element only.
   */
  release(): void;
  /**
   * Take the keys. Called after the board moved the element into the layer (the move takes the
   * focus from whatever had it inside) and for a node that is armed from its first moment.
   */
  focus?: (() => void) | undefined;
  /**
   * The editor first, then whatever it was bound to. Called once, after which the board removes
   * the element. Also called for an editor whose promise resolves after its node is gone.
   */
  destroy(): void;
}

export interface BoardImages {
  /**
   * The bytes of the image at `path`, undefined while they are not there (yet): a host that
   * loads them answers undefined and reports `onChange` once it has them. Also asked whether a
   * path is taken before a new image is stored.
   */
  read(path: string): Blob | undefined;
  /** After an image was added, loaded, replaced or removed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /**
   * Stores a new image under `path` ("assets/<name>", a path `read` answered undefined for).
   * Absent: the board offers no image button and answers a pasted or dropped image with a notice.
   */
  store?: ((path: string, bytes: Blob) => void) | undefined;
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
   * node. The SAME array until `onChange` reported a change.
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
  /** Calls back at once with the current peers, then on every change. Returns the unsubscribe. */
  onRemote(listener: (peers: BoardPeer[]) => void): () => void;
}
