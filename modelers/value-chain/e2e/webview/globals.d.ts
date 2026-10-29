import type { CollaborativeValueChainModeler } from "@miragon/value-chain-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import type {
  StubTextDocument,
  StubWebviewPanel,
  VsCodeHostStub,
  VsCodeWebviewStub,
} from "@miragon/modeler-shell/testing/vscode-stub";

/* What the webview test page publishes on window for the tests (never the shipped bundle). */
declare global {
  interface Window {
    __modelerShellVsCodeStub?: VsCodeWebviewStub;
    /** With `?host`: the stand-in for VS Code, the diagram's document and the editor's panel. */
    vscodeHost?: { host: VsCodeHostStub; document: StubTextDocument; panel: StubWebviewPanel };
    /** True once the first `init` import has settled, valid or not. */
    webviewReady?: boolean;
    shell?: ShellHandle;
    modeler?: CollaborativeValueChainModeler;
    connection?: DiagramJsConnection;
  }
}
