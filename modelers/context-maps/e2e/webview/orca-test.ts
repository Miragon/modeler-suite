import { installOrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { EMPTY_MAP, EXAMPLE_MAP } from "../../apps/ide-editor/src/examples.js";

const MAPS: Record<string, string> = { example: EXAMPLE_MAP, empty: EMPTY_MAP, blank: "" };
const search = new URLSearchParams(location.search);
const text = search.get("text") ?? MAPS[search.get("map") ?? "example"] ?? EXAMPLE_MAP;

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
