/**
 * The extension's side of the webview's pipe, inside the page: what the extension answers a
 * board's page with, from a repository in memory. `installExtension` is an init script and
 * stands alone. Each answer is posted in a task of its own, as VS Code delivers a message; what
 * a real extension host costs is no part of this page's numbers and is measured in VS Code.
 */

export interface PageRepository {
  readonly board: string;
  /** every file the page may ask for, by its path; a picture is an SVG's text */
  readonly files: Readonly<Record<string, string>>;
}

interface Posted {
  readonly type?: unknown;
  readonly requestId?: unknown;
  readonly path?: unknown;
}

export function installExtension(repository: PageRepository): void {
  const deliver = (message: unknown): void => {
    setTimeout(() => window.postMessage(message, "*"), 0);
  };
  const paths = Object.keys(repository.files).sort();
  const base64 = (text: string): string =>
    btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
  const answer = ({ type, requestId, path }: Posted): void => {
    const text = typeof path === "string" ? repository.files[path] : undefined;
    if (type === "ready") deliver({ type: "init", text: repository.board });
    else if (type === "board.hello") {
      deliver({ type: "board.welcome", shows: true });
      deliver({ type: "board.paths", paths });
    } else if (type === "board.text.settle") deliver({ type: "board.done", requestId });
    else if (type !== "board.text.open" && type !== "board.bytes.read") return;
    else if (text === undefined) {
      deliver({ type: "board.failed", requestId, message: `${String(path)} does not exist` });
    } else if (type === "board.text.open") {
      deliver({ type: "board.text.opened", requestId, path, text, readOnly: false, version: 1 });
    } else {
      deliver({
        type: "board.bytes",
        requestId,
        path,
        base64: base64(text),
        mime: "image/svg+xml",
      });
    }
  };
  // The shell's stand-in for VS Code keeps what the page posts in a list and publishes itself
  // under this name, before the page's own script runs: the answers hang on that list.
  let stub: { posted: unknown[] } | undefined;
  Object.defineProperty(window, "__modelerShellVsCodeStub", {
    configurable: true,
    get: () => stub,
    set(value: { posted: unknown[] }) {
      stub = value;
      const push = value.posted.push.bind(value.posted);
      value.posted.push = (...messages: unknown[]): number => {
        for (const message of messages) answer((message ?? {}) as Posted);
        return push(...messages);
      };
    },
  });
}
