import { installOrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { EMPTY_BOARD, EXAMPLE_BOARD } from "../../apps/ide-editor/src/examples.js";

const search = new URLSearchParams(location.search);
const BOARDS: Record<string, string> = { empty: EMPTY_BOARD, blank: "", example: EXAMPLE_BOARD };
const text = search.get("text") ?? BOARDS[search.get("board") ?? "example"] ?? EXAMPLE_BOARD;

// The stub stands in for Orca's editor tab and frame, and must be in place before the editor runs.
installOrcaEditorStub({
  text,
  colorScheme: search.get("theme") === "dark" ? "dark" : "light",
  readOnly: search.has("readOnly"),
});
const { editor } = await import("../../apps/orca/src/main.js");

window.shell = editor.shell;
window.modeler = editor.modeler;
window.connection = editor.connection;
void editor.ready.then(() => {
  window.editorReady = true;
});
