import "context-maps-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import { mergeContextMapText } from "@miragon/context-maps-renderer";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { createContextMapEditor } from "context-maps-ide-editor";

export const editor = mountIdeEditor(
  orcaEditorHost({ merge: mergeContextMapText }),
  createContextMapEditor(),
);
