import type { CollaborativeDiagram } from "@miragon/c4-renderer";
import type { ShellHandle } from "@miragon/modeler-shell";
import type { DiagramJsConnection } from "@miragon/modeler-shell/diagram-js";
import type {
  StubTextDocument,
  StubWebviewPanel,
  VsCodeHostStub,
  VsCodeWebviewStub,
} from "@miragon/modeler-shell/testing/vscode-stub";

/** What the test pages publish for the suite; the shipped bundles publish nothing. */
declare global {
  interface Window {
    /** The shell's VS Code stub, on the test page and around the production bundle alike. */
    __modelerShellVsCodeStub?: VsCodeWebviewStub;
    /**
     * With `?host`: the stand-in for VS Code, the diagram's document and the editor's panel. `save`
     * runs the extension's flush round trip, then saves, as VS Code's save participant does;
     * Cmd/Ctrl+S in the page runs it too. `saves` holds the document's text at each save.
     */
    vscodeHost?: {
      host: VsCodeHostStub;
      document: StubTextDocument;
      panel: StubWebviewPanel;
      save(): Promise<void>;
      saves: string[];
    };
    /** The VS Code webview test page: true once the first `init` import settled. */
    webviewReady?: boolean;
    shell?: ShellHandle;
    modeler?: CollaborativeDiagram;
    connection?: DiagramJsConnection;
    /** The web app (apps/webapp/src/main.ts). */
    app?: {
      ready: boolean;
      shell: ShellHandle;
      modeler: CollaborativeDiagram;
      connection: DiagramJsConnection;
      destroy(): void;
    };
  }
}
