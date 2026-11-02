import type { MetadataSymbols, ModelElement, Terminology } from "./types.js";

const SYMBOLS: Readonly<Record<MetadataSymbols, readonly [string, string]>> = {
  square: ["[", "]"],
  round: ["(", ")"],
  curly: ["{", "}"],
  angle: ["<", ">"],
  "double-angle": ["<<", ">>"],
  none: ["", ""],
};

/** Structurizr's English type words and square brackets. */
export function defaultTerminology(): Terminology {
  return {
    person: "Person",
    softwareSystem: "Software System",
    container: "Container",
    component: "Component",
    deploymentNode: "Deployment Node",
    infrastructureNode: "Infrastructure Node",
    relationship: "Relationship",
    metadataSymbols: "square",
  };
}

/**
 * `[Person]`, `[Software System]`, `[Container: <technology>]`, custom `[<metadata>]` (SPEC 6.3),
 * as Structurizr's `getMetadataForElement`: a custom element without metadata has no type line.
 */
export function typeLine(element: ModelElement, terminology: Terminology): string {
  const [open, close] = SYMBOLS[terminology.metadataSymbols];
  switch (element.kind) {
    case "person":
      return `${open}${terminology.person}${close}`;
    case "softwareSystem":
      return `${open}${terminology.softwareSystem}${close}`;
    case "container":
      return withTechnology(open, terminology.container, element.technology, close);
    case "component":
      return withTechnology(open, terminology.component, element.technology, close);
    case "custom":
      return element.metadata.length > 0 ? `${open}${element.metadata}${close}` : "";
  }
}

function withTechnology(open: string, word: string, technology: string, close: string): string {
  return technology.length > 0 ? `${open}${word}: ${technology}${close}` : `${open}${word}${close}`;
}
