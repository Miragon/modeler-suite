import {
  DOCUMENT_VERSION,
  SAMPLE_DOCUMENT,
  parseDocumentText,
  serializeDocumentText,
} from "@miragon/context-maps-schema-model";
import type { CmDocument } from "@miragon/context-maps-schema-model";

const EMPTY_DOCUMENT: CmDocument = {
  version: DOCUMENT_VERSION,
  title: "New context map",
  contexts: [],
  relationships: [],
};

/** The text of a new, empty map. */
export const EMPTY_MAP = serializeDocumentText(EMPTY_DOCUMENT);

/** The bundled example map (identical to the web app's), as a starting point. */
export const EXAMPLE_MAP = serializeDocumentText(SAMPLE_DOCUMENT);

/**
 * The document with the example's contexts and relationships added. What the file already holds
 * (its title, keys of other tools) stays, so "Insert example" needs no confirmation (guide
 * §13.5). Undefined when the text is no map or the map is not empty: the example only fills an
 * empty file, it never replaces content.
 */
export function withExampleInserted(documentText: string): string | undefined {
  const parsed = parseDocumentText(documentText);
  if (!parsed.ok) return undefined;
  const map = parsed.document;
  if (map.contexts.length > 0 || map.relationships.length > 0) return undefined;
  const text = serializeDocumentText({
    ...map,
    contexts: SAMPLE_DOCUMENT.contexts,
    relationships: SAMPLE_DOCUMENT.relationships,
  });
  return documentText.includes("\r\n") ? text.replace(/\n/g, "\r\n") : text;
}
