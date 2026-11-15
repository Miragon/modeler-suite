import type { EditorModule, TextRules } from "@miragon/board-host";
import { readText, serializeText } from "@miragon/business-model-canvas-dsl";
import { createCollaborativeModeler } from "@miragon/business-model-canvas-renderer";
import "@miragon/business-model-canvas-renderer/assets/business-model-canvas.css";

/** Line endings and trailing whitespace are no change of the canvas. */
function normalised(text: string): string {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

/** The canonical form of a document text, or undefined while it is invalid. */
function canonical(text: string): string | undefined {
  try {
    return serializeText(readText(text).document);
  } catch {
    return undefined;
  }
}

function sameCanvas(text: string, exported: string): boolean {
  return normalised(text) === normalised(exported) || canonical(text) === exported;
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = (modeler): TextRules => ({
  // The file's own text while the canvas shows the same canvas, so its formatting stays.
  exported(reconciled) {
    const exported = modeler.exportText();
    return sameCanvas(reconciled, exported) ? reconciled : exported;
  },
  same: (candidate) => sameCanvas(candidate, modeler.exportText()),
});
