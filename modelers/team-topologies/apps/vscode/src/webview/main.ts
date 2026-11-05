import "team-topologies-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import type { CollaborativeTeamTopologiesModeler } from "@miragon/team-topologies-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import {
  readShellState,
  vsCodeEditorHost,
  writeShellState,
  type TypedMessage,
  type VsCodeEditorApi,
} from "@miragon/modeler-shell/vscode/webview";
import type { WebviewToHost } from "../protocol.js";
import { createDiagramEditor, embeddedPng } from "team-topologies-ide-editor";
import { blobToBase64 } from "team-topologies-ide-editor/io";
import { takeLegacyLegendOpen } from "./state.js";

declare const acquireVsCodeApi: () => VsCodeEditorApi;

const api = acquireVsCodeApi();
const legacyLegendOpen = takeLegacyLegendOpen(api);
if (readShellState(api).legendOpen === undefined && legacyLegendOpen !== undefined) {
  writeShellState(api, { legendOpen: legacyLegendOpen });
}
const post = (message: WebviewToHost): void => api.postMessage(message);

const definition = createDiagramEditor();

/** The text editor is about to save: commit a draft (its `edit` goes out first), then answer. */
async function respondFlush(id: number): Promise<void> {
  await (await editor.document).imported();
  definition.commitPanelDraft(editor.shell);
  post({ type: "flushed", id });
}

/**
 * The PNG editor asks for the finished, embedded PNG (save, backup): rasterized once every import
 * queued so far has settled, so no half-imported state lands in the file; a failure is answered
 * as `error`, so the host aborts the save instead of writing a corrupt file.
 */
async function respondPng(id: number, includeDraft: boolean): Promise<void> {
  try {
    await (await editor.document).imported();
    if (includeDraft) definition.commitPanelDraft(editor.shell);
    const { data, fontFallback } = await embeddedPng(editor.modeler);
    post({
      type: "pngResponse",
      id,
      data: await blobToBase64(data),
      ...(includeDraft && fontFallback ? { fontFallback: true as const } : {}),
    });
  } catch (error) {
    console.error("Team Topologies PNG render failed", error);
    post({ type: "pngResponse", id, error: "Couldn't render the PNG. Try saving again." });
  }
}

/** The text editor's flush before a save, and the PNG editor's request for its file. */
function answerHost(message: TypedMessage): void {
  if (typeof message.id !== "number") return;
  if (message.type === "flush") void respondFlush(message.id);
  else if (message.type === "requestPng")
    void respondPng(message.id, message.includeDraft === true);
}

// The extension's messages arrive once the webview is ready, so the handlers above never meet an
// editor that is not mounted yet.
const editor = mountIdeEditor(vsCodeEditorHost({ onMessage: answerHost }, api), definition);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeTeamTopologiesModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = editor;
