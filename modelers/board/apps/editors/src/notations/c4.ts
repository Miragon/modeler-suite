import type { EditorModule, TextRules } from "@miragon/board-host";
import { createCollaborativeModeler, type CollaborativeDiagram } from "@miragon/c4-renderer";
import "@miragon/c4-renderer/assets/c4.css";

interface Breadcrumbs {
  relayout(): void;
}

interface Canvas {
  getContainer(): HTMLElement;
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

/**
 * The DSL is the document and the modeler hands it back byte for byte. A text that differs from
 * the canvas's only in formatting or comments is rebased: the modeler takes the new bytes without
 * a render, so its next edit builds on them.
 */
export const text: NonNullable<EditorModule["text"]> = (embedded): TextRules => {
  const modeler = embedded as CollaborativeDiagram;
  return {
    exported: () => modeler.exportText(),
    same: (candidate) => modeler.rebaseText(candidate),
  };
};

// The breadcrumb bar measures its room with client rects when a view is drawn. Drawn in a preview
// the board scales, it keeps that width once the node is armed, and nothing tells it to measure
// again: no resize fires, the layout size is the same.
export const relayout: NonNullable<EditorModule["relayout"]> = (embedded) => {
  const { diagram } = embedded as CollaborativeDiagram;
  const breadcrumbs = diagram.get<Breadcrumbs>("c4Breadcrumbs");
  const container = diagram.get<Canvas>("canvas").getContainer();
  // The board calls an editor's focus() after it moved the element into its layer and before it
  // gives the element its box there: for the rest of that call the element fills the whole board.
  // A microtask later the box is written. The modeler may be gone by then.
  queueMicrotask(() => {
    if (container.isConnected) breadcrumbs.relayout();
  });
};
