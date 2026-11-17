import type { EmbeddableModeler, TextRules } from "@miragon/board-host";

/** Line endings and the whitespace around the XML are no change of the canvas. */
function sameXml(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

/**
 * The modeler hands back the file's own text until the first edit, and bpmn-js's formatted XML
 * from then on: opening a file never rewrites it, and a text from outside that differs only in its
 * line endings is not imported again. Kept apart from the notation module, which loads the
 * modeler, so that a test in Node reads the rules alone.
 */
export const bpmnTextRules = (embedded: EmbeddableModeler): TextRules => ({
  exported: () => embedded.exportText(),
  same: (candidate, reconciled) =>
    sameXml(candidate, reconciled) || sameXml(candidate, embedded.exportText()),
});
