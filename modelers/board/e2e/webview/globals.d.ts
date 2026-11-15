import type { MemoryBackend } from "@miragon/board-files";
import type {
  StubTextDocument,
  StubWebviewPanel,
  VsCodeHostStub,
  VsCodeWebviewStub,
} from "@miragon/modeler-shell/testing/vscode-stub";
import type { BoardEditor } from "board-ide-editor";
import type { BoardWebview } from "../../apps/vscode/src/webview/main.js";

/* What the webview test page publishes on window for the tests (never the shipped bundle). */
declare global {
  interface Window {
    __modelerShellVsCodeStub?: VsCodeWebviewStub | undefined;
    /**
     * With `?host`: the stand-in for VS Code, the board file's document, the editor's panel and
     * the repository in memory that the extension's plumbing serves the page. The repository
     * holds the board file as well, as `example.board`.
     */
    vscodeHost?:
      | {
          host: VsCodeHostStub;
          document: StubTextDocument;
          panel: StubWebviewPanel;
          backend: MemoryBackend;
          /**
           * What the extension posts to the webview, held on its way until it is released: a
           * message that is still under way while the person goes on.
           */
          deliveries: { hold(): void; release(): void };
        }
      | undefined;
    /** The webview's own parts, from the moment its entry ran. */
    webview?: BoardWebview | undefined;
    /** The editor, once the shell, the board and the document sync stand. */
    editor?: BoardEditor | undefined;
    /** True once the first `init` import has settled, valid or not. */
    webviewReady?: boolean | undefined;
  }
}
