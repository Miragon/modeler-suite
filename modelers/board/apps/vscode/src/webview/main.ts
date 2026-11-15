// Zod first: it probes for eval when it builds its first schema, and the webview's policy
// reports that probe as a violation.
import "board-suite-editors/zod-jitless";
// The sheets by name and in this order: the fonts, the shell, the board, the base the renderer
// sheets share (once, with the preview rule), then the three rules that make one picture of the
// shell and the board. A renderer's own sheet follows all of them in the bundle's one sheet.
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@miragon/modeler-shell/shell.css";
import "@miragon/board-renderer/assets/board.css";
import "board-suite-editors/base";
import "board-ide-editor/app.css";
import { createFilesClient, type BoardFiles } from "@miragon/board-files";
import { vsCodeEditorHost } from "@miragon/modeler-shell/vscode/webview";
import { mountBoardEditor, type BoardEditor } from "board-ide-editor";
import { SUITE_EDITORS } from "board-suite-editors";

import { filesChannel } from "./channel.js";
import { aimPastes } from "./paste.js";

export interface BoardWebview {
  /** The files of the board's repository, as the extension serves them over the webview's pipe. */
  readonly files: BoardFiles;
  /**
   * The editor, once the shell, the board and the document sync stand. No answer of the
   * extension is awaited for it; its own `ready` waits for the document's first text.
   */
  readonly mounted: Promise<BoardEditor>;
  /**
   * Ends the page's parts in the board's order: the board and its editors first, then the host
   * built from the files and the shell, and only then the files. An editor closes its file, and
   * may still write, while it goes. Rejects as `mounted` did where the editor never stood.
   */
  destroy(): Promise<void>;
}

// VS Code's own paste lands on the body: aimed at the focused element, as a browser's is.
const stopAimingPastes = aimPastes(document);
// One API for the page: the shell's editor host acquires it, and the files post through it.
const pipe = filesChannel();
const host = vsCodeEditorHost({ onMessage: pipe.receive });
// The client says hello at once. The extension answers in a later task, and by then the document
// sync, which hands the files their messages, listens: it is connected in this task, below.
const files = createFilesClient(pipe.over(host.api));
// VS Code's document owns the board file's history, so the undo keys of an armed editor stay
// with that editor.
const mounted = mountBoardEditor(host, {
  files,
  editors: SUITE_EDITORS,
  containHistoryKeys: true,
}).catch((error: unknown) => {
  // A page that could not mount its editor keeps no files open; why it could not stays the
  // page's error.
  files.dispose();
  throw error;
});

/** For test pages: the mounted parts. The shipped bundle publishes nothing on window. */
export const webview: BoardWebview = {
  files,
  mounted,
  async destroy() {
    await (await mounted).destroy();
    // What an editor posted while it went is on its way to the extension already: the files
    // only stop listening here.
    files.dispose();
    stopAimingPastes();
  },
};
