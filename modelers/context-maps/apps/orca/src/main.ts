import "context-maps-ide-editor/zod-jitless";
import "@miragon/modeler-shell/shell.css";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { createContextMapEditor } from "context-maps-ide-editor";

export const editor = mountIdeEditor(orcaEditorHost(), createContextMapEditor());
