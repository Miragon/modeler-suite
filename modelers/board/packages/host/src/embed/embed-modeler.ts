/**
 * The mechanism: any modeler of the contract as a board's embedded editor. It names no renderer:
 * the factory comes in with the module, and everything done to the editor goes through
 * `@miragon/modeler-api` plus the three things the contract has no call for (a fit in layout px,
 * the focus, the release).
 */
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

import type { BindModel, EditorNotice, EditorState } from "../binding/types.js";
import type { EditorModule, EmbeddableModeler, Insets } from "../registry.js";
import { EDITOR_INSETS, fitBox, type FitBox } from "./fit.js";
import { containHistoryKeys } from "./history-keys.js";
import { releaseDiagramJs } from "./release.js";

interface CanvasLike {
  getSize(): { width: number; height: number };
  viewbox(box?: FitBox): unknown;
  focus?(): void;
}

export interface EmbedOptions {
  module: EditorModule;
  notation: string;
  bind: BindModel;
  insets?: Insets | undefined;
  /** the editor keeps its own history and its undo keys never leave the element (VS Code) */
  containHistoryKeys?: boolean | undefined;
  onState?: ((state: EditorState) => void) | undefined;
  /** what the binding says once: an edit that is not in the document, and the next edit */
  onNotice?: ((notice: EditorNotice) => void) | undefined;
}

export type EmbeddedModeler = EmbeddedEditor & {
  readonly modeler: EmbeddableModeler;
  /**
   * Moves the editor into the element of another context: the board made a new element for the
   * node because its file has another path. The modeler, its view, its history and what is
   * selected stay; what the adapter wrote on the old element is taken back and written on the
   * new one.
   */
  rehome(context: EmbeddedEditorContext): void;
};

/** what the adapter writes on the element it stands in, and takes back when it leaves */
function settleIn(
  context: EmbeddedEditorContext,
  root: HTMLElement,
  notation: string,
  keys: boolean,
): () => void {
  const { element } = context;
  element.dataset.embed = "diagram-js";
  element.dataset.notation = notation;
  element.append(root);
  const releaseKeys = keys ? containHistoryKeys(element, () => context.armed()) : undefined;
  return () => {
    releaseKeys?.();
    delete element.dataset.embed;
    delete element.dataset.notation;
  };
}

export function embedModeler(
  context: EmbeddedEditorContext,
  options: EmbedOptions,
): EmbeddedModeler {
  const modeler = options.module.create({ fitOnImport: false });
  const { notation } = modeler.meta;
  if (notation !== options.notation) {
    modeler.destroy();
    throw new Error(`expected a '${options.notation}' modeler, got '${notation}'`);
  }
  const keys = options.containHistoryKeys === true;
  const root = context.element.ownerDocument.createElement("div");
  root.className = "board-host-editor";
  let home = context;
  let leave = settleIn(home, root, notation, keys);
  modeler.attachTo(root);
  // Asked when it is needed: an editor that makes its engine with its first text has none before.
  const canvasOf = (): CanvasLike | undefined =>
    modeler.diagram?.get<CanvasLike | null>("canvas", false) ?? undefined;
  const fit = (): void => {
    const canvas = canvasOf();
    const bounds = modeler.contentBounds?.();
    // layout px, never a client rect: the element is scaled while the model is a preview
    const box =
      bounds && canvas
        ? fitBox(bounds, canvas.getSize(), options.insets ?? EDITOR_INSETS)
        : undefined;
    if (box) canvas?.viewbox(box);
  };
  // The first text the modeler accepted is the one that is fitted, also when a text before it
  // was refused: a file that is repaired later would otherwise stay in the view of an empty canvas.
  let fitted = false;
  const binding = options.bind(
    modeler,
    (state) => {
      if (state.kind === "ok" && !fitted) {
        fitted = true;
        fit();
      }
      // No change of such a canvas can be written, and the next text of the file replaces it: an
      // edit a person made there would be lost without a word.
      root.inert = state.kind === "invalid" || state.kind === "gone";
      options.onState?.(state);
    },
    (notice) => options.onNotice?.(notice),
  );
  return {
    modeler,
    ready: binding.ready,
    release: () => releaseDiagramJs(home.element),
    focus() {
      options.module.relayout?.(modeler);
      canvasOf()?.focus?.();
    },
    rehome(next) {
      if (next === home) return;
      leave();
      home = next;
      leave = settleIn(home, root, notation, keys);
    },
    destroy() {
      binding.unbind();
      modeler.destroy();
      root.remove();
      leave();
    },
  };
}
