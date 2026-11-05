import type { IdeEditorHost, IdeExportFile } from "../../ide/index.js";
import type { DocumentWebviewMessage, TypedMessage } from "../protocol.js";
import { connectDocumentSync, type DocumentSyncApi } from "./document-sync.js";
import { mountVsCodeShell } from "./mount.js";
import { persistView, readShellState, writeShellState, type WebviewStateApi } from "./state.js";

/** `acquireVsCodeApi()` as far as the editor host uses it. */
export type VsCodeEditorApi = DocumentSyncApi & WebviewStateApi;

export interface VsCodeEditorHostOptions {
  /** The extension's messages the document sync does not handle (a save flush, a PNG request). */
  onMessage?: ((message: TypedMessage) => void) | undefined;
}

declare const acquireVsCodeApi: (() => VsCodeEditorApi) | undefined;

function stateRecord(api: WebviewStateApi): Record<string, unknown> {
  const state = api.getState();
  return state !== null && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

/**
 * The VS Code webview as an `IdeEditorHost`: `mountVsCodeShell` with the problems pill,
 * `connectDocumentSync` with the Command Palette commands, the view and the legend in the webview
 * state, and the extension's save dialog for exports (`{ type: "export", format, data }`, a
 * picture in Base64). Acquires the VS Code API, so call it once.
 */
export function vsCodeEditorHost(
  options: VsCodeEditorHostOptions = {},
  api: VsCodeEditorApi = acquireVsCodeApi!(),
): IdeEditorHost & { readonly api: VsCodeEditorApi } {
  const stored = readShellState(api);
  const post = (message: DocumentWebviewMessage | TypedMessage): void => api.postMessage(message);
  return {
    kind: "vscode",
    api,
    canvasOwnsHistory: false,
    state: {
      view: stored.view,
      legendOpen: stored.legendOpen,
      writeLegendOpen: (legendOpen) => writeShellState(api, { legendOpen }),
      read: (key) => stateRecord(api)[key],
      write: (key, value) => api.setState({ ...stateRecord(api), [key]: value }),
      persistView: (viewport) => persistView(api, viewport),
    },
    mountShell: (root, shellOptions) =>
      mountVsCodeShell(root, {
        ...shellOptions,
        problems: { onActivate: () => post({ type: "showProblems" }) },
      }),
    async connectDocument(shell, documentOptions) {
      const sync = connectDocumentSync({
        api,
        importText: documentOptions.importText,
        exportText: documentOptions.exportText,
        canWrite: documentOptions.canWrite,
        onProblems: (counts) => shell.setProblems(counts),
        commands: documentOptions.commands,
        onMessage: options.onMessage,
      });
      return {
        pushEdit: sync.pushEdit,
        ready: sync.ready,
        imported: sync.imported,
        readOnly: false,
        insertExample: sync.insertExample,
        disconnect: sync.disconnect,
      };
    },
    async saveExport(file: IdeExportFile) {
      const data = typeof file.data === "string" ? file.data : await base64Of(file.data);
      post({
        type: "export",
        format: file.format,
        data,
        ...(file.fontFallback ? { fontFallback: true } : {}),
      });
    },
    notify: (severity, message) => post({ type: severity, message }),
  };
}
