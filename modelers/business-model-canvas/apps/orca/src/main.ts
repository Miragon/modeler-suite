import "business-model-canvas-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import { mergeCanvasText } from "@miragon/business-model-canvas-renderer";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { canvasEditor } from "business-model-canvas-ide-editor";

export const editor = mountIdeEditor(orcaEditorHost({ merge: mergeCanvasText }), canvasEditor);
