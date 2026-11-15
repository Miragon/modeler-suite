import type { EditorModule, TextRules } from "@miragon/board-host";
import { createCollaborativeModeler } from "@miragon/context-maps-renderer";
import "@miragon/context-maps-renderer/assets/context-maps.css";
import { parseDocumentText, serializeDocumentText } from "@miragon/context-maps-schema-model";

/** The canonical form of a document text, or undefined when it is no map right now. */
function canonical(text: string): string | undefined {
  const parsed = parseDocumentText(text);
  return parsed.ok ? serializeDocumentText(parsed.document) : undefined;
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = (modeler): TextRules => ({
  exported: () => modeler.exportText(),
  same: (candidate) => canonical(candidate) === modeler.exportText(),
});
