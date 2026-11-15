/**
 * The mechanism: any modeler of the contract as a board's embedded editor. It names no renderer:
 * the factory comes in with the module, and everything done to the editor goes through
 * `@miragon/modeler-api` plus the three things the contract has no call for (a fit in layout px,
 * the focus, the release).
 */
import type { EmbeddedEditor, EmbeddedEditorContext } from "@miragon/board-renderer";

import type { BindModel, EditorState } from "../binding/types.js";
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
}

export type EmbeddedModeler = EmbeddedEditor & { readonly modeler: EmbeddableModeler };

export function embedModeler(
  context: EmbeddedEditorContext,
  options: EmbedOptions,
): EmbeddedModeler {
  const { element } = context;
  const modeler = options.module.create({ fitOnImport: false });
  if (modeler.meta.notation !== options.notation) {
    modeler.destroy();
    throw new Error(`expected a '${options.notation}' modeler, got '${modeler.meta.notation}'`);
  }
  element.dataset.embed = "diagram-js";
  element.dataset.notation = modeler.meta.notation;
  const root = element.ownerDocument.createElement("div");
  root.className = "board-host-editor";
  element.append(root);
  modeler.attachTo(root);
  const canvas = modeler.diagram?.get<CanvasLike>("canvas", false);
  const fit = (): void => {
    const bounds = modeler.contentBounds?.();
    // layout px, never a client rect: the element is scaled while the model is a preview
    const box =
      bounds && canvas
        ? fitBox(bounds, canvas.getSize(), options.insets ?? EDITOR_INSETS)
        : undefined;
    if (box) canvas?.viewbox(box);
  };
  const releaseKeys = options.containHistoryKeys
    ? containHistoryKeys(element, () => context.armed())
    : undefined;
  // The first text the modeler accepted is the one that is fitted, also when a text before it
  // was refused: a file that is repaired later would otherwise stay in the view of an empty canvas.
  let fitted = false;
  const binding = options.bind(modeler, (state) => {
    if (state.kind === "ok" && !fitted) {
      fitted = true;
      fit();
    }
    // No change of such a canvas can be written, and the next text of the file replaces it: an
    // edit a person made there would be lost without a word.
    root.inert = state.kind === "invalid" || state.kind === "gone";
    options.onState?.(state);
  });
  return {
    modeler,
    ready: binding.ready,
    release: () => releaseDiagramJs(element),
    focus() {
      options.module.relayout?.(modeler);
      canvas?.focus?.();
    },
    destroy() {
      releaseKeys?.();
      binding.unbind();
      modeler.destroy();
      root.remove();
      delete element.dataset.embed;
      delete element.dataset.notation;
    },
  };
}
