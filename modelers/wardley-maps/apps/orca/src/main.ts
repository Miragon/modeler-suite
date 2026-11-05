import "wardley-maps-ide-editor/zod-jitless";
import "@miragon/modeler-shell/shell.css";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import { openExternal, orcaEditorHost } from "@miragon/modeler-shell/orca/webview";
import { createMapEditor } from "wardley-maps-ide-editor";

// Orca gives a custom editor no way to open another file, so a link to a map stays where it is.
export const editor = mountIdeEditor(
  orcaEditorHost(),
  createMapEditor({
    openExternalLink: (address) => void openExternal(address),
    openRelativeLink: (address) =>
      console.warn(
        `Open ${address} from Orca's file tree: Orca does not let an editor open files.`,
      ),
  }),
);
