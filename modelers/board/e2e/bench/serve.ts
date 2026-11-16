/**
 * The bench's two servers. A page is loaded over HTTP and never through a route of Playwright,
 * which turns the browser's cache off: a warm run would then be a cold one.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import {
  openWebviewBundle,
  WEBVIEW_BUNDLE_ORIGIN,
  type WebviewBundleRoute,
} from "@miragon/modeler-shell/testing/webview-bundle";
import { boardEditorOptions } from "../../apps/vscode/src/boardEditorOptions.js";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
};

export interface Served {
  readonly origin: string;
  close(): Promise<void>;
}

interface Answer {
  readonly type: string;
  readonly body: string | Buffer;
  /** the page's document is asked for anew by every load; what it names is kept by the browser */
  readonly keep: boolean;
}

function serve(
  port: number,
  answer: (pathname: string) => Promise<Answer | undefined> | Answer | undefined,
): Promise<Served> {
  const server: Server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://bench.invalid");
    void Promise.resolve(answer(pathname)).then(
      (found) => {
        if (!found) {
          response.writeHead(404, { "content-type": "text/plain" }).end("not in the build");
          return;
        }
        response
          .writeHead(200, {
            "content-type": found.type,
            "cache-control": found.keep ? "max-age=3600" : "no-store",
          })
          .end(found.body);
      },
      (error: unknown) => response.writeHead(500).end(String(error)),
    );
  });
  return new Promise((done, fail) => {
    server.once("error", (error: NodeJS.ErrnoException) =>
      fail(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is taken: another run of the bench is on. Wait for it, or give this run another port (settings.ts names the variable).`,
            )
          : error,
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((closed) => {
            server.closeAllConnections();
            server.close(() => closed());
          }),
      }),
    );
  });
}

const fileAnswer = (file: string): Answer => ({
  type: TYPES[extname(file)] ?? "application/octet-stream",
  body: readFileSync(file),
  keep: true,
});

function fileOf(folder: string, pathname: string): string | undefined {
  const root = resolve(folder);
  const file = resolve(root, `.${decodeURIComponent(pathname)}`);
  const inside = relative(root, file);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`)) return undefined;
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

/** The web app's production build as a static site. */
export function serveWebapp(build: string, port: number): Promise<Served> {
  return serve(port, (pathname) => {
    if (pathname === "/") return { ...fileAnswer(join(build, "index.html")), keep: false };
    const file = fileOf(build, pathname);
    return file ? fileAnswer(file) : undefined;
  });
}

type Fulfilled = Parameters<WebviewBundleRoute["fulfill"]>[0];

/**
 * The extension's webview as VS Code loads it: the document and the policy the extension writes
 * (`renderWebviewHtml` with the editor's own options), the bundle, its sheet and its fonts
 * beside it, and the shell's stand-in for VS Code's own script. All of it is what the shell's
 * `openWebviewBundle` answers a page with; here it answers a server, so that the browser's
 * cache works, and the policy names this server as its source.
 */
export async function serveWebview(build: string, port: number): Promise<Served> {
  const options = boardEditorOptions(() => undefined);
  const origin = `http://127.0.0.1:${port}`;
  let answerRoute: ((route: WebviewBundleRoute) => Promise<void>) | undefined;
  await openWebviewBundle(
    {
      route: (_pattern, handler) => Promise.resolve(void (answerRoute = handler)),
      unroute: () => Promise.resolve(),
      goto: () => Promise.resolve(),
    },
    {
      dist: build,
      title: options.title,
      requested: { theme: "light" },
      themes: options.themes,
      script: options.script,
      styles: options.styles,
      inlineStyles: options.inlineStyles,
    },
  );
  const routed = answerRoute;
  if (!routed) throw new Error("the shell's openWebviewBundle registered no route");
  return serve(port, async (pathname) => {
    let fulfilled: Fulfilled | undefined;
    await routed({
      request: () => ({ url: () => `${WEBVIEW_BUNDLE_ORIGIN}${pathname}` }),
      fulfill: (response) => Promise.resolve(void (fulfilled = response)),
    });
    if (!fulfilled || (fulfilled.status ?? 200) !== 200) return undefined;
    if (fulfilled.path !== undefined) return fileAnswer(fulfilled.path);
    const body = fulfilled.body ?? "";
    const document = pathname === "/";
    return {
      type: fulfilled.contentType ?? "application/octet-stream",
      body: document ? body.replaceAll(WEBVIEW_BUNDLE_ORIGIN, origin) : body,
      keep: !document,
    };
  });
}
