import { parseText, serializeText } from "@miragon/business-model-canvas-dsl";
import { createEmptyDocument } from "@miragon/business-model-canvas-schema-model";
import { EXAMPLE_TEXT } from "./exampleText.js";

/** The Miragon example (identical to the web app's), canonical. */
export const EXAMPLE_DOCUMENT = serializeText(parseText(EXAMPLE_TEXT).document);

/** A new, empty canvas, canonical. */
export const EMPTY_DOCUMENT = serializeText(createEmptyDocument("New business model"));
