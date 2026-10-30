import * as vscode from "vscode";
import {
  IMAGE_EXPORT_KINDS,
  exportToFile,
  registerModelerEditor,
  type ModelerEditorRegistration,
} from "@miragon/modeler-shell/vscode/extension";
import type { WardleyDiagnostics } from "./diagnostics.js";
import { MAP_EDITOR_OPTIONS } from "./mapEditorOptions.js";
import type { WebviewToHost } from "./protocol.js";

export { MAP_VIEW_TYPE } from "./mapEditorOptions.js";

/** The open map editors: the focused one, the one focused last, and their Command Palette commands. */
export type MapEditors = ModelerEditorRegistration<vscode.TextDocument>;

/**
 * The custom editor for `.wmap`/`.owm`, on the shell's document plumbing: the OWM text stays the
 * document, so VS Code keeps dirty state, saving, Git, diff and undo, and every change on the
 * canvas comes back as a minimal line edit that keeps the comments and statement order around it.
 * An export is a picture beside the map, saved through the shell's dialog; the map stays the
 * editable original.
 */
export function registerMapEditor(
  context: Pick<vscode.ExtensionContext, "extensionUri">,
  diagnostics?: WardleyDiagnostics,
): MapEditors {
  return registerModelerEditor<vscode.TextDocument, WebviewToHost>(vscode, context, {
    ...MAP_EDITOR_OPTIONS,
    diagnostics: diagnostics && {
      // The parser's findings are warnings: the map stays editable (guide §13.5), so no errors.
      refresh: (document) => ({ count: diagnostics.refresh(document), errors: 0 }),
    },
    onMessage: (message, editor) =>
      message.type === "export"
        ? exportToFile(vscode, {
            kind: IMAGE_EXPORT_KINDS[message.format],
            data: message.data,
            sourceUri: editor.document.uri,
            defaultName: "wardley-map",
            fontFallback: message.fontFallback === true,
            platform: process.platform,
          })
        : undefined,
  });
}
