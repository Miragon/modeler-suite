/**
 * What a registry of editors hands this package: one entry per notation, and what its `load()`
 * yields. Types and the one load per entry; no renderer of the suite is named here, a modeler
 * comes in through an entry.
 */
import type { CollaborativeModeler, CollaborativeModelerOptions } from "@miragon/modeler-api";

/** A modeler of the contract; `diagram` where it is one on diagram-js. */
export type EmbeddableModeler = CollaborativeModeler & {
  readonly diagram?: { get<T>(name: string, strict?: boolean): T } | undefined;
};

/**
 * How one mounted modeler's text meets the file's, one object per mounted modeler. `reconciled`
 * is the text the file has: what was imported last or written last.
 */
export interface TextRules {
  /** the text to write for the canvas as it is, given the text the file has */
  exported(reconciled: string): string;
  /** `text` draws what the canvas shows: no import, and the editor keeps its history */
  same(text: string, reconciled: string): boolean;
  /** after an accepted import */
  imported?: (() => void) | undefined;
}

/** What an entry's `load()` yields: the factory, and what is special to the notation. */
export interface EditorModule {
  create(options: CollaborativeModelerOptions): EmbeddableModeler;
  /** absent: `modeler.exportText()` as it is, and two texts are the same when their bytes are */
  text?: ((modeler: EmbeddableModeler) => TextRules) | undefined;
  /**
   * Lays out again what the renderer measured from the screen as a preview; called in focus().
   * The board calls focus() before it gives the element its box in the layer, so the element
   * fills the whole board for the length of the call: a hook that measures does so a microtask
   * later.
   */
  relayout?: ((modeler: EmbeddableModeler) => void) | undefined;
}

/** px an editor's own chrome covers along the edges of its element */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface EditorEntry {
  /** the contract's `meta.notation`, checked when the editor is made */
  notation: string;
  /** beside a node's title: "Wardley Map" */
  kind: string;
  /** with the dot, lower case; the longest one that fits a path wins */
  suffixes: readonly string[];
  /** room for the notation's own palette in its first fit; absent: `EDITOR_INSETS` */
  insets?: Insets | undefined;
  load(): Promise<EditorModule>;
}

const modules = new WeakMap<EditorEntry, Promise<EditorModule>>();

/** A notation's code is loaded once, however many nodes show it; a failed load is tried again. */
export function loadEditor(entry: EditorEntry): Promise<EditorModule> {
  let module = modules.get(entry);
  if (!module) {
    const loading = entry.load();
    module = loading;
    modules.set(entry, loading);
    loading.catch(() => {
      if (modules.get(entry) === loading) modules.delete(entry);
    });
  }
  return module;
}
