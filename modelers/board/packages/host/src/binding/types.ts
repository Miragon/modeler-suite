/**
 * The seam between a mounted modeler and its document. This package binds a text session
 * (`bindTextSession`); a host with another kind of document passes a binding of its own to
 * `embedModeler`.
 */
import type { DropReason } from "@miragon/board-files";

import type { EmbeddableModeler } from "../registry.js";

/** What a model node shows of its file beside the canvas. */
export type EditorState =
  | { kind: "ok" }
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "gone" }
  | { kind: "failed"; message: string };

/**
 * What a binding says once and does not keep saying. `dropped`: a change the person made on the
 * canvas is not in the document and never will be, with the reason. `edited`: the person changed
 * the canvas again, so what was said of an earlier change is over.
 */
export type EditorNotice = { kind: "dropped"; reason: DropReason } | { kind: "edited" };

export interface ModelBinding {
  /** settles once the first text was imported or refused */
  readonly ready: Promise<void>;
  unbind(): void;
}

/**
 * Binds a mounted modeler to its document and reports what the node should say about it: a
 * state through `report`, and through `notice`, where the binding has one, what is said once.
 */
export type BindModel = (
  modeler: EmbeddableModeler,
  report: (state: EditorState) => void,
  notice?: ((notice: EditorNotice) => void) | undefined,
) => ModelBinding;
