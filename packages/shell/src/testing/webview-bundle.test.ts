import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  WEBVIEW_BUNDLE_ORIGIN,
  distFile,
  openWebviewBundle,
  webviewBundleHtml,
  type WebviewBundleOptions,
  type WebviewBundlePage,
  type WebviewBundleRoute,
} from "./webview-bundle.js";

const sandbox = mkdtempSync(join(tmpdir(), "modeler-shell-webview-bundle-"));
const dist = join(sandbox, "dist");
mkdirSync(join(dist, "fonts"), { recursive: true });
writeFileSync(join(dist, "webview.js"), "void 0;");
writeFileSync(join(dist, "..notes.txt"), "a name that starts with two dots");
writeFileSync(join(dist, "fonts", "geist-latin-wght-normal.woff2"), "");
writeFileSync(join(sandbox, "secret.txt"), "outside dist");

interface HappyDomSettings {
  handleDisabledFileLoadingAsSuccess: boolean;
}
const happyDomSettings = (window as unknown as { happyDOM?: { settings: HappyDomSettings } })
  .happyDOM?.settings;
const loadingWasSuccess = happyDomSettings?.handleDisabledFileLoadingAsSuccess;

// The parsed documents link their stylesheets, which happy-dom would try to load.
beforeAll(() => {
  if (happyDomSettings) happyDomSettings.handleDisabledFileLoadingAsSuccess = true;
});

afterAll(() => {
  if (happyDomSettings)
    happyDomSettings.handleDisabledFileLoadingAsSuccess = loadingWasSuccess ?? false;
  rmSync(sandbox, { recursive: true, force: true });
});

const OPTIONS: WebviewBundleOptions = {
  dist,
  title: "Event Storming Board",
  requested: { theme: "light" },
  themes: ["light"],
};

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("webviewBundleHtml", () => {
  it("is renderWebviewHtml's document, VS Code's default styles ahead of its policy", () => {
    const html = webviewBundleHtml(OPTIONS, "bm9uY2U");
    const defaults = html.indexOf('<style id="_defaultStyles">@layer vscode-default {');
    expect(defaults).toBeGreaterThan(html.indexOf("<head>"));
    expect(defaults).toBeLessThan(html.indexOf('http-equiv="Content-Security-Policy"'));
    const page = parse(html);
    expect(
      page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
    ).toBe(
      "default-src 'none'; img-src https://webview.test data: blob:; style-src https://webview.test 'unsafe-inline'; font-src https://webview.test data:; script-src 'nonce-bm9uY2U'",
    );
    expect(page.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(
      "https://webview.test/webview.css",
    );
    expect(page.title).toBe("Event Storming Board");
    expect(page.documentElement.getAttribute("lang")).toBe("en");
    expect(page.documentElement.getAttribute("data-cd-theme")).toBe("light");
  });

  it("runs the stub, carrying its options, ahead of the policy and the stylesheets, and the bundle last", () => {
    const page = parse(
      webviewBundleHtml(
        { ...OPTIONS, themes: ["light", "dark"], colorTheme: "dark", reduceMotion: true },
        "bm9uY2U",
      ),
    );
    expect(
      [...page.head.children].map(
        (element) => element.id || element.getAttribute("http-equiv") || element.localName,
      ),
    ).toEqual([
      "_defaultStyles",
      "script",
      "meta",
      "Content-Security-Policy",
      "meta",
      "link",
      "title",
    ]);
    const stub = page.head.querySelector("script")!;
    expect(stub.getAttribute("src")).toBe("https://webview.test/__modeler-shell/vscode-stub.js");
    expect(stub.hasAttribute("nonce")).toBe(false);
    expect(JSON.parse(stub.getAttribute("data-options")!)).toEqual({
      requested: { theme: "light" },
      themes: ["light", "dark"],
      colorTheme: "dark",
      reduceMotion: true,
    });
    expect(
      [...page.body.querySelectorAll("script")].map((script) => [
        script.getAttribute("nonce"),
        script.getAttribute("src"),
      ]),
    ).toEqual([["bm9uY2U", "https://webview.test/webview.js"]]);
    expect(page.body.querySelector("#app")).not.toBeNull();
    expect(page.documentElement.getAttribute("data-cd-theme")).toBe("dark");
  });

  it("takes the extension's script, stylesheets, body, language and inline-style policy", () => {
    const page = parse(
      webviewBundleHtml(
        {
          ...OPTIONS,
          requested: { theme: "dark", kontrast: "hoch" },
          lang: "de",
          script: "out/board.js",
          styles: ["tokens.css", "out/board.css"],
          body: '<main id="board"></main>',
          inlineStyles: false,
        },
        "bm9uY2U",
      ),
    );
    expect(page.documentElement.getAttribute("lang")).toBe("de");
    expect(page.documentElement.getAttribute("data-cd-theme")).toBe("light");
    expect(page.documentElement.getAttribute("data-cd-kontrast")).toBe("hoch");
    expect(
      [...page.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.getAttribute("href")),
    ).toEqual(["https://webview.test/tokens.css", "https://webview.test/out/board.css"]);
    expect([...page.body.querySelectorAll("script")].at(-1)?.getAttribute("src")).toBe(
      "https://webview.test/out/board.js",
    );
    expect(page.body.querySelector("#board")).not.toBeNull();
    expect(
      page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content"),
    ).toContain("style-src https://webview.test; ");
  });
});

describe("distFile", () => {
  it("names the files of dist and nothing outside it", () => {
    expect(distFile(dist, "/webview.js")).toBe(join(dist, "webview.js"));
    expect(distFile(dist, "/fonts/geist-latin-wght-normal.woff2")).toBe(
      join(dist, "fonts", "geist-latin-wght-normal.woff2"),
    );
    expect(distFile(dist, "/..notes.txt")).toBe(join(dist, "..notes.txt"));
    expect(distFile(dist, "/../secret.txt")).toBeUndefined();
    expect(distFile(dist, "/%2e%2e/secret.txt")).toBeUndefined();
    expect(distFile(dist, "/fonts")).toBeUndefined();
    expect(distFile(dist, "/")).toBeUndefined();
    expect(distFile(dist, "/webview.css")).toBeUndefined();
    expect(distFile(dist, "/%E0%A4%A")).toBeUndefined();
  });
});

interface Fulfilled {
  status?: number;
  contentType?: string;
  body?: string;
  path?: string;
}

function fakePage() {
  const calls: string[] = [];
  let handler: ((route: WebviewBundleRoute) => Promise<void>) | undefined;
  const page: WebviewBundlePage = {
    async route(url, routeHandler) {
      calls.push(`route ${url}`);
      handler = routeHandler;
    },
    async unroute(url) {
      calls.push(`unroute ${url}`);
    },
    async goto(url) {
      calls.push(`goto ${url}`);
    },
  };
  const request = async (path: string): Promise<Fulfilled> => {
    let fulfilled: Fulfilled = {};
    await handler!({
      request: () => ({ url: () => `${WEBVIEW_BUNDLE_ORIGIN}${path}` }),
      async fulfill(response) {
        fulfilled = response;
      },
    });
    return fulfilled;
  };
  return { page, calls, request };
}

describe("openWebviewBundle", () => {
  it("routes the origin to the document, the stub and the files of dist, then opens it", async () => {
    const { page, calls, request } = fakePage();
    await openWebviewBundle(page, { ...OPTIONS, stubScript: "/* the stub */" });
    expect(calls).toEqual([
      "unroute https://webview.test/**",
      "route https://webview.test/**",
      "goto https://webview.test/",
    ]);
    const document = await request("/");
    expect(document.contentType).toBe("text/html; charset=utf-8");
    expect(document.body).toContain('src="https://webview.test/__modeler-shell/vscode-stub.js"');
    expect(await request("/__modeler-shell/vscode-stub.js")).toEqual({
      contentType: "text/javascript",
      body: "/* the stub */",
    });
    expect(await request("/webview.js")).toEqual({ path: join(dist, "webview.js") });
    expect(await request("/webview.css?v=1")).toEqual({
      status: 404,
      contentType: "text/plain",
      body: "not in the bundle",
    });
  });

  it("explains a missing stub when the package is not built", async () => {
    const { page, calls } = fakePage();
    await expect(openWebviewBundle(page, OPTIONS)).rejects.toThrow(
      /openWebviewBundle finds no VS Code stub at \S*testing-vscode-stub-script\.global\.js; build the package or pass stubScript/,
    );
    expect(calls).toEqual([]);
  });
});
