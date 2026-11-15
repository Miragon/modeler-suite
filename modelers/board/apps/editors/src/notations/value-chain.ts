import type { EditorModule, TextRules } from "@miragon/board-host";
import { BLANK_DOCUMENT_NAME, createCollaborativeModeler } from "@miragon/value-chain-renderer";
import "@miragon/value-chain-renderer/assets/value-chain.css";
import {
  createEmptyDocument,
  parseDocumentJSON,
  serializeDocument,
} from "@miragon/value-chain-schema-model";

/** The canonical form of a document text, or undefined while it is invalid. */
function canonical(text: string): string | undefined {
  try {
    return serializeDocument(
      text.trim() === "" ? createEmptyDocument(BLANK_DOCUMENT_NAME) : parseDocumentJSON(text),
    );
  } catch {
    return undefined;
  }
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = (modeler): TextRules => ({
  // The file's own text while the canvas shows the same diagram, so its formatting stays.
  exported(reconciled) {
    const exported = modeler.exportText();
    return canonical(reconciled) === exported ? reconciled : exported;
  },
  same: (candidate) => canonical(candidate) === modeler.exportText(),
});
