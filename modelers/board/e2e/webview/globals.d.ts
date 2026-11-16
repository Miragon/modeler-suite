import type { MemoryBackend } from "@miragon/board-files";
import type {
  StubbedVsCodeApi,
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
    /** The stub's `acquireVsCodeApi`, which the test page wraps to keep the state over a reload. */
    acquireVsCodeApi?: (() => StubbedVsCodeApi) | undefined;
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
           * Every file the page asked the extension to show in an editor of VS Code's own, in
           * order. The repository in memory has no editor: this stands in for VS Code's.
           */
          shown: readonly string[];
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
    /**
     * Every state this page handed to `setState`, in order. The page keeps the last one for its
     * tab, so that a reload finds it as a reloaded webview finds its state in VS Code.
     */
    webviewStateWrites?: unknown[] | undefined;
  }
}
