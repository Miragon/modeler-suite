/** The writer bpmn-js's `saveXML` serialises with; moddle-xml ships no types of its own. */
declare module "moddle-xml" {
  export class Writer {
    constructor(options?: { format?: boolean; preamble?: boolean });
    toXML(element: unknown): string;
  }
}
