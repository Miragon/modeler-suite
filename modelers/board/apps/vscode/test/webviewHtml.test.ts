import { beforeEach, describe, expect, it } from "vitest";

import { ColorThemeKind, vscodeMock } from "./__mocks__/vscode.js";
import { openBoard } from "./support/panel.js";

const BOARD = "/work/repo/boards/a.board";

beforeEach(() => void vscodeMock.reset({ [BOARD]: "", "/work/repo/.git/HEAD": "" }));

function htmlTag(html: string): string {
  return /<html[^>]*>/.exec(html)?.[0] ?? "";
}

describe("the board editor: webview HTML", () => {
  it("writes the CSP with a nonce, and the same nonce on the one script", async () => {
    const { webview } = await openBoard(BOARD);
    const { html } = webview;

    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(csp)?.[1];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("font-src vscode-webview://unit data:");
    expect(csp).toContain("style-src vscode-webview://unit 'unsafe-inline'");
    expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(html.match(/<script /g)).toHaveLength(1);
    expect(html).toContain(`<script nonce="${nonce}" src="file:///ext/dist/webview.js">`);
    expect(html).toContain('href="file:///ext/dist/webview.css"');
  });

  it("gives the page no way to fetch: no connect-src, so a picture travels as a message", async () => {
    const { webview } = await openBoard(BOARD);
    const csp =
      /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(webview.html)?.[1] ?? "";
    expect(csp).not.toContain("connect-src");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("keeps the webview scripts and the dist folder as the only local resource", async () => {
    const { webview } = await openBoard(BOARD);

    expect(webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [expect.objectContaining({ path: "/ext/dist" })],
    });
  });

  it('puts lang, the document class and data-cd-theme="light" on <html> before the first paint', async () => {
    const { webview } = await openBoard(BOARD);

    expect(htmlTag(webview.html)).toBe(
      '<html lang="en" class="cd-shell-document" data-cd-theme="light">',
    );
    expect(webview.html).toContain("<title>Board</title>");
  });

  it("renders the shell root as the only element of <body>", async () => {
    const { webview } = await openBoard(BOARD);

    expect(/<body>\s*<div id="app"><\/div>\s*<script /.test(webview.html)).toBe(true);
  });

  it("stays light in a dark VS Code theme and passes high contrast", async () => {
    vscodeMock.setColorThemeKind(ColorThemeKind.Dark);
    const dark = await openBoard(BOARD);
    vscodeMock.setColorThemeKind(ColorThemeKind.HighContrast);
    const highContrast = await openBoard(BOARD);

    expect(htmlTag(dark.webview.html)).toContain('data-cd-theme="light"');
    expect(htmlTag(dark.webview.html)).not.toContain("data-cd-kontrast");
    expect(htmlTag(highContrast.webview.html)).toContain(
      'data-cd-theme="light" data-cd-kontrast="hoch"',
    );
  });
});
