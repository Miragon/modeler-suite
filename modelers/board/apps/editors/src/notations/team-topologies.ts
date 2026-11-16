import type { EditorModule, TextRules } from "@miragon/board-host";
import { createCollaborativeModeler, parseDocumentText } from "@miragon/team-topologies-renderer";
import "@miragon/team-topologies-renderer/assets/team-topologies.css";
import { serializeDocument } from "@miragon/team-topologies-schema-model";

/** The canonical form of a document text, or undefined while it is invalid. */
function canonical(text: string): string | undefined {
  try {
    return serializeDocument(parseDocumentText(text));
  } catch {
    return undefined;
  }
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = (modeler): TextRules => ({
  exported: () => modeler.exportText(),
  same: (candidate) => canonical(candidate) === modeler.exportText(),
});
