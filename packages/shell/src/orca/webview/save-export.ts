import { orcaEditorApi, type OrcaSaveAsResult } from "./api.js";

export interface OrcaExportFile {
  suggestedName: string;
  mimeType: string;
  data: string | ArrayBuffer | Blob;
}

/**
 * Offers an export in Orca's save dialog (`orca.files.saveAs`); the plugin never learns the path.
 * Call it from a click or key press: Orca refuses it a few seconds after the last one. Rejects
 * outside the desktop app, which has no `orca.files`.
 */
export async function saveExport(file: OrcaExportFile): Promise<OrcaSaveAsResult> {
  const { files } = orcaEditorApi();
  if (!files) throw new Error("@miragon/modeler-shell: exports need the Orca desktop app");
  const data = file.data instanceof Blob ? await file.data.arrayBuffer() : file.data;
  return files.saveAs({ suggestedName: file.suggestedName, mimeType: file.mimeType, data });
}

/**
 * Opens an http(s) or mailto URL in the system browser (`orca.shell.openExternal`), from a click
 * or key press; resolves `false` when the person cancels Orca's question or outside the desktop app.
 */
export async function openExternal(url: string): Promise<boolean> {
  const { shell } = orcaEditorApi();
  if (!shell) return false;
  return (await shell.openExternal(url)).opened;
}
