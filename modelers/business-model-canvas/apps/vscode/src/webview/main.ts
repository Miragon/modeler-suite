import "business-model-canvas-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import type { CollaborativeDiagram } from "@miragon/business-model-canvas-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { vsCodeEditorHost } from "@miragon/modeler-shell/vscode/webview";
import { canvasEditor } from "business-model-canvas-ide-editor";

const editor = mountIdeEditor(vsCodeEditorHost(), canvasEditor);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeDiagram;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = editor;
