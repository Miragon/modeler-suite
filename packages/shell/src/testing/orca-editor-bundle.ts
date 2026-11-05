import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ORCA_FRAME_POLICY } from "./orca-frame.js";
import type { OrcaEditorStubOptions } from "./orca-stub.js";
import { distFile } from "./webview-bundle.js";
import { STUB_OPTIONS_ATTRIBUTE } from "./vscode-stub-script.js";

/*
 * Runs in Node, next to Playwright: serves a modeler's built Orca plugin the way Orca's isolated
 * frame loads its editor, so the kit's `csp` case walks the shipped editor under the frame's CSP.
 */

/** The origin the editor runs on, as Orca's `orca-plugin-frame://<key>` origin. */
export const ORCA_EDITOR_BUNDLE_ORIGIN = "https://orca-plugin-frame.test";

const STUB_PATH = "/__modeler-shell/orca-stub.js";

const SHIPPED_STUB = new URL("./testing-orca-stub-script.global.js", import.meta.url);

export interface OrcaEditorBundleRoute {
  request(): { url(): string };
  fulfill(response: {
    status?: number;
    contentType?: string;
    headers?: Record<string, string>;
    body?: string;
    path?: string;
  }): Promise<void>;
}

export interface OrcaEditorBundlePage {
  route(url: string, handler: (route: OrcaEditorBundleRoute) => Promise<void>): Promise<unknown>;
  unroute(url: string): Promise<unknown>;
  goto(url: string): Promise<unknown>;
}

export interface OrcaEditorBundleOptions extends OrcaEditorStubOptions {
  /** The built plugin folder (`apps/orca/plugin`), which holds `orca-plugin.json`. */
  plugin: string;
  /** The editor's `entry`, relative to `plugin`; default `"editor/index.html"`. */
  entry?: string | undefined;
  /** The Orca stub as the source of a classic script; default the one this package ships. */
  stubScript?: string | undefined;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Adds `colorScheme` to the class of the `<html>` tag, found without a backtracking pattern. */
function withModeClass(html: string, colorScheme: string): string {
  const start = html.search(/<html[\s>]/i);
  const end = start === -1 ? -1 : html.indexOf(">", start);
  if (end === -1) return html;
  const attributes = html.slice(start + "<html".length, end);
  const tag = /\sclass="/i.test(attributes)
    ? `<html${attributes.replace(/\sclass="/i, ` class="${colorScheme} `)}>`
    : `<html${attributes} class="${colorScheme}">`;
  return html.slice(0, start) + tag + html.slice(end + 1);
}

/**
 * The entry's document as Orca serves it: its mode class on `<html>`, and ahead of everything in
 * `<head>` the frame's policy and the stub, where Orca puts its frame API script.
 */
export function orcaEditorHtml(entryHtml: string, stub: OrcaEditorStubOptions): string {
  const options = escapeAttribute(JSON.stringify(stub));
  const withMode = withModeClass(entryHtml, stub.colorScheme ?? "light");
  return withMode.replace(
    /<head>/i,
    [
      "<head>",
      `<meta http-equiv="Content-Security-Policy" content="${ORCA_FRAME_POLICY}">`,
      `<script src="${STUB_PATH}" ${STUB_OPTIONS_ATTRIBUTE}="${options}"></script>`,
    ].join("\n    "),
  );
}

async function shippedStub(): Promise<string> {
  try {
    return await readFile(SHIPPED_STUB, "utf8");
  } catch {
    const where =
      SHIPPED_STUB.protocol === "file:" ? fileURLToPath(SHIPPED_STUB) : SHIPPED_STUB.href;
    throw new Error(
      `@miragon/modeler-shell: openOrcaEditorBundle finds no Orca stub at ${where}; build the package or pass stubScript`,
    );
  }
}

/**
 * Opens the editor of a built Orca plugin the way Orca's isolated frame loads it: the entry with
 * Orca's frame CSP (as a header and a `<meta>`), the Orca stub ahead of every other script with the
 * document `text`, and every other request answered with the plugin's file it names (a 404
 * outside the plugin folder, as the frame has no network). Resolves once the page has loaded.
 */
export async function openOrcaEditorBundle(
  page: OrcaEditorBundlePage,
  options: OrcaEditorBundleOptions,
): Promise<void> {
  const stubScript = options.stubScript ?? (await shippedStub());
  const entry = options.entry ?? "editor/index.html";
  const stub: OrcaEditorStubOptions = {
    text: options.text,
    colorScheme: options.colorScheme,
    readOnly: options.readOnly,
    files: options.files,
  };
  const html = orcaEditorHtml(await readFile(join(options.plugin, entry), "utf8"), stub);
  const pattern = `${ORCA_EDITOR_BUNDLE_ORIGIN}/**`;
  const headers = { "Content-Security-Policy": ORCA_FRAME_POLICY };
  await page.unroute(pattern);
  await page.route(pattern, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === `/${entry}`) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", headers, body: html });
    }
    if (pathname === STUB_PATH) {
      return route.fulfill({ contentType: "text/javascript", body: stubScript });
    }
    const file = distFile(options.plugin, pathname);
    if (!file) {
      return route.fulfill({ status: 404, contentType: "text/plain", body: "not in the plugin" });
    }
    return route.fulfill({ path: file });
  });
  await page.goto(`${ORCA_EDITOR_BUNDLE_ORIGIN}/${entry}`);
}
