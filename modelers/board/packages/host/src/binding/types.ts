/**
 * The seam between a mounted modeler and its document. This package binds a text session
 * (`bindTextSession`); a host with another kind of document passes a binding of its own to
 * `embedModeler`.
 */
import type { EmbeddableModeler } from "../registry.js";

/** What a model node shows of its file beside the canvas. */
export type EditorState =
  | { kind: "ok" }
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "gone" }
  | { kind: "failed"; message: string };

export interface ModelBinding {
  /** settles once the first text was imported or refused */
  readonly ready: Promise<void>;
  unbind(): void;
}

/** Binds a mounted modeler to its document and reports what the node should say about it. */
export type BindModel = (
  modeler: EmbeddableModeler,
  report: (state: EditorState) => void,
) => ModelBinding;
