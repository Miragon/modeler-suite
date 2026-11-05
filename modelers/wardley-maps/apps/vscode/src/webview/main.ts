import "wardley-maps-ide-editor/zod-jitless";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist/wght-italic.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import type { CollaborativeWardleyModeler } from "@miragon/wardley-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import { mountIdeEditor } from "@miragon/modeler-shell/ide";
import {
  vsCodeEditorHost,
  type TypedMessage,
  type VsCodeEditorApi,
} from "@miragon/modeler-shell/vscode/webview";
import type { WebviewToHost } from "../protocol.js";
import { createMapEditor } from "wardley-maps-ide-editor";

declare const acquireVsCodeApi: () => VsCodeEditorApi;

const api = acquireVsCodeApi();
const post = (message: WebviewToHost): void => api.postMessage(message);

const pendingLinkTargets = new Map<number, (address: string | undefined) => void>();
let lastLinkTargetRequest = 0;

/** The extension's quick pick of a map or a page to link to; undefined when the user cancels. */
function chooseLinkTarget(): Promise<string | undefined> {
  const requestId = ++lastLinkTargetRequest;
  return new Promise((resolve) => {
    pendingLinkTargets.set(requestId, resolve);
    post({ type: "chooseLinkTarget", requestId });
  });
}

function answerHost(message: TypedMessage): void {
  if (message.type !== "linkTargetChosen" || typeof message.requestId !== "number") return;
  const resolve = pendingLinkTargets.get(message.requestId);
  pendingLinkTargets.delete(message.requestId);
  resolve?.(typeof message.address === "string" ? message.address : undefined);
}

const editor = mountIdeEditor(
  vsCodeEditorHost({ onMessage: answerHost }, api),
  createMapEditor({
    openRelativeLink: (address) => post({ type: "openLink", address }),
    openExternalLink: (address) => post({ type: "openLink", address }),
    chooseLinkTarget,
  }),
);

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeWardleyModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = editor;
