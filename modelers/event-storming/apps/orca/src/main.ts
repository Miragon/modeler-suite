import "event-storming-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import { mergeStormText } from "@miragon/event-storming-renderer";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { boardEditor } from "event-storming-ide-editor";

export const editor = mountIdeEditor(orcaEditorHost({ merge: mergeStormText }), boardEditor);
