// The demo's debug handle, as far as the e2e specs read it.
import type Diagram from "diagram-js";

import type { DiagramJsConnection } from "../src/diagram-js.js";
import type { Bounds, ShellHandle, ToastStatus } from "../src/index.js";
import type { VsCodeWebviewStub } from "../src/testing-vscode-stub.js";

declare global {
  interface Window {
    __demo?: {
      ready: boolean;
      calls: string[];
      shell: ShellHandle;
      connection: DiagramJsConnection;
      /** The demo modeler, for saboteurs that add to the document or the context pad. */
      diagram: Diagram;
      /** The stubbed VS Code around the `ide` host. */
      vscode?: VsCodeWebviewStub;
      /**
       * One fault each for the saboteur specs (`DemoFlaws` in demo/demo-diagram.ts), read at the
       * moment it matters, so a spec may switch it on after the page opened.
       */
      flaws: {
        /** Enter or Space on a creating palette entry adds nothing (case `create`). */
        noKeyboardCreate: boolean;
        /** The read-only lock leaves context pad, move and delete working (case `readOnly`). */
        canvasUnlocked: boolean;
        /** Cmd/Ctrl+A on the canvas does nothing, so VS Code runs its Select All (case `keys`). */
        noSelectAll: boolean;
        /** The label editor commits on every view change, as before contract 1.2 (case `labelEditor`). */
        commitLabelOnViewChange: boolean;
        /** The label editor closes without a commit on every view change (case `labelEditor`). */
        closeLabelOnViewChange: boolean;
        /** The note prompt follows a pan or zoom instead of closing (case `overlayLayers`). */
        notePromptFollowsView: boolean;
        /** The note prompt hides while the view changes, back 300ms later (case `overlayLayers`). */
        notePromptHidesWhileViewChanges: boolean;
        /** "Export as PNG" probes for eval, which the webview CSP refuses (case `csp`). */
        evalUnderCsp: boolean;
        /** "Keyboard shortcuts…" throws an uncaught error after its click (case `csp`). */
        throwFromDialog: boolean;
      };
      /** Commands that changed the diagram so far, the demo's document changes (case `labelEditor`). */
      documentChanges(): number;
      /** The bounds the viewport fits to, in diagram coordinates; `undefined` while empty. */
      contentBounds(): Bounds | undefined;
      /**
       * The invalid-file state as a host shows it: `shell.setReadOnly(true)` and the status box,
       * both with `INVALID_STATUS_DELAY_MS`; `false` clears both at once. `?invalid` uses it.
       */
      setInvalid(invalid: boolean): void;
      destroy(): void;
    };
    /** The web demo's handle (`/web.html`, demo/web.ts). */
    __webDemo?: {
      ready: boolean;
      calls: string[];
      shell: ShellHandle;
      connection: DiagramJsConnection;
      flaws: NonNullable<Window["__demo"]>["flaws"];
      documentChanges(): number;
      /** The pill with two items: an error on the first box, a warning without an element. */
      showProblems(): void;
      /** A fresh visit without a document: an empty board behind the start screen. */
      startScreen(): void;
      setInvalid(invalid: boolean): void;
      toast(request: { status: ToastStatus; text: string; actionLabel?: string | undefined }): void;
      destroy(): void;
    };
  }
}
