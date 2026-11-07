import "team-topologies-ide-editor/zod-jitless";
import "@miragon/modeler-shell/shell.css";
import { mergeTeamTopologiesText } from "@miragon/team-topologies-renderer";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { createDiagramEditor } from "team-topologies-ide-editor";

export const editor = mountIdeEditor(
  orcaEditorHost({ merge: mergeTeamTopologiesText }),
  createDiagramEditor(),
);
