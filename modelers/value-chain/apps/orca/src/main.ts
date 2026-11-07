import "value-chain-ide-editor/zod-jitless";
import "@miragon/modeler-shell/shell.css";
import { mergeValueChainText } from "@miragon/value-chain-renderer";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { diagramEditor } from "value-chain-ide-editor";

export const editor = mountIdeEditor(orcaEditorHost({ merge: mergeValueChainText }), diagramEditor);
