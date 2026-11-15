import type { EditorModule, TextRules } from "@miragon/board-host";
import { createCollaborativeModeler } from "@miragon/event-storming-renderer";
import "@miragon/event-storming-renderer/assets/event-storming.css";

/** Line endings and the whitespace around a board are what a save changes, not the canvas. */
function sameBoardText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();
}

export const create: EditorModule["create"] = (options) => createCollaborativeModeler(options);

export const text: NonNullable<EditorModule["text"]> = (modeler): TextRules => ({
  exported: () => modeler.exportText(),
  same: (candidate) => sameBoardText(candidate, modeler.exportText()),
});
