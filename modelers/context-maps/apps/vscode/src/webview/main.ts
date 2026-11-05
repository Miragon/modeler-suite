import "context-maps-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import type { CollaborativeContextMapsModeler } from "@miragon/context-maps-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import {
  vsCodeEditorHost,
  type TypedMessage,
  type VsCodeEditorApi,
} from "@miragon/modeler-shell/vscode/webview";
import type { WebviewToHost } from "../protocol.js";
import { createContextMapEditor, embeddedPng } from "context-maps-ide-editor";
import { blobToBase64 } from "context-maps-ide-editor/io";

declare const acquireVsCodeApi: () => VsCodeEditorApi;

const api = acquireVsCodeApi();
const post = (message: WebviewToHost): void => api.postMessage(message);

/** The PNG editor asks for the finished PNG once every import queued so far has settled. */
async function respondPng(id: number): Promise<void> {
  try {
    await (await editor.document).imported();
    const { data, fontFallback } = await embeddedPng(editor.modeler);
    post({ type: "pngResponse", id, data: await blobToBase64(data), fontFallback });
  } catch (error) {
    console.error("Context Maps PNG render failed", error);
    post({ type: "pngResponse", id, error: "Couldn't render the map as PNG. Try again." });
  }
}

function answerHost(message: TypedMessage): void {
  if (message.type === "requestPng" && typeof message.id === "number") void respondPng(message.id);
}

// The extension's messages arrive once the webview is ready, so the handler above never meets an
// editor that is not mounted yet.
const editor = mountIdeEditor(
  vsCodeEditorHost({ onMessage: answerHost }, api),
  createContextMapEditor(),
);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeContextMapsModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = editor;
