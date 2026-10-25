import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { requestedAppearance, resolveAppearance } from "../core/index.js";
import { createNonce, renderWebviewHtml } from "../vscode/extension/index.js";
import { VSCODE_DEFAULT_STYLES, VSCODE_DEFAULT_STYLES_ID } from "./vscode-default-styles.js";
import { colorThemeKindOf, type VsCodeWebviewStubOptions } from "./vscode-stub.js";
import { STUB_OPTIONS_ATTRIBUTE } from "./vscode-stub-script.js";

/*
 * Runs in Node, next to Playwright: serves a modeler's production webview bundle the way VS Code
 * loads it, so the kit's `csp` case walks the shipped bundle under the webview's CSP.
 */

/** The origin the page runs on, and with it the `cspSource` of its CSP. */
export const WEBVIEW_BUNDLE_ORIGIN = "https://webview.test";

/** Where the page loads the VS Code stub from; outside every `dist` a modeler ships. */
const STUB_PATH = "/__modeler-shell/vscode-stub.js";

/** The stub as tsup builds it (an IIFE) next to this entry in `dist`. */
const SHIPPED_STUB = new URL("./testing-vscode-stub-script.global.js", import.meta.url);

/** The part of Playwright's `Route` the page's requests are answered through. */
export interface WebviewBundleRoute {
  request(): { url(): string };
  fulfill(response: {
    status?: number;
    contentType?: string;
    body?: string;
    path?: string;
  }): Promise<void>;
}

/** The part of Playwright's `Page` `openWebviewBundle` drives, typed structurally. */
export interface WebviewBundlePage {
  route(url: string, handler: (route: WebviewBundleRoute) => Promise<void>): Promise<unknown>;
  unroute(url: string): Promise<unknown>;
  goto(url: string): Promise<unknown>;
}

/**
 * The bundle and how the extension renders its webview, plus the stub's options: what VS Code
 * requests (`requested`, `colorTheme`, `reduceMotion`) and what the extension hands its theme bridge
 * (`themes`, `settingKey`).
 */
export interface WebviewBundleOptions extends VsCodeWebviewStubOptions {
  /** The extension's production build (`apps/vscode/dist`): the bundle, its stylesheet and fonts. */
  dist: string;
  /** `<title>`, as the extension passes it to `renderWebviewHtml`. */
  title: string;
  /** The bundle, relative to `dist`; default `"webview.js"`. */
  script?: string | undefined;
  /** The stylesheets, relative to `dist`, in load order; default `["webview.css"]`. */
  styles?: readonly string[] | undefined;
  /** `renderWebviewHtml`'s `body`, as the extension passes it; default `<div id="app"></div>`. */
  body?: string | undefined;
  /** `renderWebviewHtml`'s `inlineStyles`, as the extension passes it; default `true`. */
  inlineStyles?: boolean | undefined;
  /**
   * The VS Code stub as the source of a classic script; default the one this package ships. Pass a
   * build of your own to run a stub from source, as the shell's own e2e suite does.
   */
  stubScript?: string | undefined;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The page's document: `renderWebviewHtml` with the extension's options on the origin, and
 * prepended to `<head>`, ahead of the page's own policy, VS Code's default styles and the stub (its
 * options in `data-options`). VS Code writes its default styles and its own API script there too,
 * so the policy never blocks them, and the stub records from the first resource the page loads.
 */
export function webviewBundleHtml(options: WebviewBundleOptions, nonce = createNonce()): string {
  const { title, script, styles, body, inlineStyles } = options;
  const stub: VsCodeWebviewStubOptions = {
    requested: options.requested,
    themes: options.themes,
    lang: options.lang,
    colorTheme: options.colorTheme,
    settingKey: options.settingKey,
    reduceMotion: options.reduceMotion,
    state: options.state,
  };
  const origin = WEBVIEW_BUNDLE_ORIGIN;
  const html = renderWebviewHtml({
    cspSource: origin,
    nonce,
    scriptUri: `${origin}/${script ?? "webview.js"}`,
    styleUris: (styles ?? ["webview.css"]).map((style) => `${origin}/${style}`),
    title,
    lang: stub.lang ?? "en",
    appearance: resolveAppearance(
      requestedAppearance(colorThemeKindOf(stub.requested), stub.colorTheme),
      stub.themes,
    ),
    body,
    inlineStyles,
  });
  return html.replace(
    "<head>",
    [
      "<head>",
      `<style id="${VSCODE_DEFAULT_STYLES_ID}">${VSCODE_DEFAULT_STYLES}</style>`,
      `<script src="${origin}${STUB_PATH}" ${STUB_OPTIONS_ATTRIBUTE}="${escapeAttribute(JSON.stringify(stub))}"></script>`,
    ].join("\n    "),
  );
}

/** The file of `dist` a request path names; `undefined` outside `dist` or when there is none. */
export function distFile(dist: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const root = resolve(dist);
  const file = resolve(root, `.${decoded}`);
  const inside = relative(root, file);
  if (inside === "" || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return undefined;
  }
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

async function shippedStub(): Promise<string> {
  try {
    return await readFile(SHIPPED_STUB, "utf8");
  } catch {
    const where =
      SHIPPED_STUB.protocol === "file:" ? fileURLToPath(SHIPPED_STUB) : SHIPPED_STUB.href;
    throw new Error(
      `@miragon/modeler-shell: openWebviewBundle finds no VS Code stub at ${where}; build the package or pass stubScript`,
    );
  }
}

/**
 * Opens the modeler's production webview bundle the way VS Code loads it: the document and CSP of
 * `renderWebviewHtml` on `WEBVIEW_BUNDLE_ORIGIN` (its `cspSource`), with VS Code's default styles
 * and the VS Code stub of `./testing/vscode-stub` ahead of the policy, where VS Code writes its own
 * API script; the stub records every CSP violation, error and failed load from the page's first
 * stylesheet on. Any other request to the origin is answered with the file of `dist` it names (a
 * 404 outside `dist`). Resolves once the page has loaded; hand the bundle its document the way the
 * extension does (its `init` message) next.
 */
export async function openWebviewBundle(
  page: WebviewBundlePage,
  options: WebviewBundleOptions,
): Promise<void> {
  const stub = options.stubScript ?? (await shippedStub());
  const html = webviewBundleHtml(options);
  const pattern = `${WEBVIEW_BUNDLE_ORIGIN}/**`;
  await page.unroute(pattern);
  await page.route(pattern, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/") {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    if (pathname === STUB_PATH)
      return route.fulfill({ contentType: "text/javascript", body: stub });
    const file = distFile(options.dist, pathname);
    if (!file) {
      return route.fulfill({ status: 404, contentType: "text/plain", body: "not in the bundle" });
    }
    return route.fulfill({ path: file });
  });
  await page.goto(`${WEBVIEW_BUNDLE_ORIGIN}/`);
}
