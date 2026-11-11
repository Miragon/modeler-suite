import type { ModuleDeclaration } from "didi";
import InsertionFeedback from "./InsertionFeedback.js";

export const dropFeedbackModule: ModuleDeclaration = {
  __init__: ["insertionFeedback"],
  insertionFeedback: ["type", InsertionFeedback],
};
