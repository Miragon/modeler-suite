import type { ModuleDeclaration } from "didi";
import DocumentStore from "./DocumentStore.js";

export const documentModule: ModuleDeclaration = {
  c4Document: ["type", DocumentStore],
};

export { default as DocumentStore, INITIAL_VIEW, type DocumentState } from "./DocumentStore.js";
export { hashText } from "./hash.js";
