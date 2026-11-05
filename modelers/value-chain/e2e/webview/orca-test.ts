import { installOrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { EMPTY_DOCUMENT, EXAMPLE_DOCUMENT } from "../../apps/ide-editor/src/examples.js";

const DOCUMENTS: Record<string, string> = {
  example: EXAMPLE_DOCUMENT,
  empty: EMPTY_DOCUMENT,
  blank: "",
};
const search = new URLSearchParams(location.search);
const text =
  search.get("text") ?? DOCUMENTS[search.get("diagram") ?? "example"] ?? EXAMPLE_DOCUMENT;

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
