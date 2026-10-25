import { afterEach, describe, expect, it, vi } from "vitest";

import { vsCodeStubSearch } from "./harness.js";
import {
  STUB_SETTING_KEY,
  colorThemeKindOf,
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
  type StubWindow,
} from "./vscode-stub.js";

afterEach(() => {
  vi.restoreAllMocks();
  const html = document.documentElement;
  for (const name of [...html.getAttributeNames()]) html.removeAttribute(name);
  document.body.className = "";
  document.head.querySelector("#_defaultStyles")?.remove();
  delete (window as StubWindow).acquireVsCodeApi;
  delete (window as StubWindow).__modelerShellVsCodeStub;
});

const nextMessage = () =>
  new Promise<unknown>((resolve) =>
    window.addEventListener("message", (event) => resolve(event.data), { once: true }),
  );

describe("installVsCodeWebviewStub", () => {
  it("renders <html> as renderWebviewHtml does, with the host page's body classes and default styles", () => {
    installVsCodeWebviewStub({
      requested: { theme: "dark", kontrast: "hoch" },
      themes: ["light"],
      reduceMotion: true,
    });
    const html = document.documentElement;
    expect(html.getAttribute("lang")).toBe("en");
    expect(html.classList).toContain("cd-shell-document");
    expect(html.getAttribute("data-cd-theme")).toBe("light");
    expect(html.getAttribute("data-cd-kontrast")).toBe("hoch");
    expect([...document.body.classList]).toEqual(["vscode-high-contrast", "vscode-reduce-motion"]);
    expect(document.head.querySelector("#_defaultStyles")?.textContent).toContain(
      "@layer vscode-default",
    );
    expect((window as StubWindow).__modelerShellVsCodeStub?.kind).toBe(3);
  });

  it("installed from <head>, sets the body classes once the parser inserted <body>", async () => {
    const body = document.body;
    body.remove();
    try {
      installVsCodeWebviewStub({
        requested: { theme: "dark" },
        themes: ["light"],
        reduceMotion: true,
      });
      expect(document.body).toBeNull();
      document.documentElement.append(body);
      await Promise.resolve();
      expect([...document.body.classList]).toEqual(["vscode-dark", "vscode-reduce-motion"]);
    } finally {
      if (!body.isConnected) document.documentElement.append(body);
    }
  });

  it("switches the color theme as VS Code does: body classes, then the bridge's message", async () => {
    const stub = installVsCodeWebviewStub({
      requested: { theme: "light" },
      themes: ["light", "dark"],
    });
    const message = nextMessage();
    stub.setColorThemeKind(2);
    expect(document.body.className).toBe("vscode-dark");
    expect(await message).toEqual({
      type: "modelerShell.appearance",
      appearance: { theme: "dark" },
    });
  });

  it("answers the colorTheme setting and posts on a setting change", async () => {
    const stub = installVsCodeWebviewStub({
      requested: { theme: "light" },
      themes: ["light", "dark"],
      colorTheme: "dark",
    });
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("dark");
    const message = nextMessage();
    stub.setColorTheme("light");
    expect(await message).toEqual({
      type: "modelerShell.appearance",
      appearance: { theme: "light" },
    });
    expect(STUB_SETTING_KEY).toBe("miragon.modeler.colorTheme");
  });

  it("provides acquireVsCodeApi once, with state and the webview's posted messages", () => {
    const stub = installVsCodeWebviewStub({
      requested: { theme: "light" },
      themes: ["light"],
      state: { a: 1 },
    });
    const acquire = (window as StubWindow).acquireVsCodeApi;
    const api = acquire?.();
    expect(() => acquire?.()).toThrow(/already been acquired/);
    expect(api?.getState()).toEqual({ a: 1 });
    api?.setState({ b: 2 });
    api?.postMessage({ type: "showProblems" });
    expect(stub.state()).toEqual({ b: 2 });
    expect(stub.posted).toEqual([{ type: "showProblems" }]);
  });

  it("keeps the default styles a page under the webview CSP carries ahead of its policy", () => {
    const carried = document.createElement("style");
    carried.id = "_defaultStyles";
    carried.textContent = "@layer vscode-default {}";
    document.head.append(carried);
    installVsCodeWebviewStub({ requested: { theme: "light" }, themes: ["light"] });
    expect(document.head.querySelectorAll("#_defaultStyles")).toHaveLength(1);
    expect(document.head.querySelector("#_defaultStyles")).toBe(carried);
  });

  it("records CSP violations, errors, rejections, failed loads and console.error from its install on", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    window.dispatchEvent(new ErrorEvent("error", { message: "before the stub" }));
    const stub = installVsCodeWebviewStub({ requested: { theme: "light" }, themes: ["light"] });

    document.dispatchEvent(
      Object.assign(new Event("securitypolicyviolation"), {
        effectiveDirective: "script-src",
        violatedDirective: "script-src",
        blockedURI: "eval",
        sourceFile: "https://webview.test/webview.js",
        lineNumber: 2,
        columnNumber: 31,
        sample: "",
      }),
    );
    document.dispatchEvent(
      Object.assign(new Event("securitypolicyviolation"), {
        effectiveDirective: "",
        violatedDirective: "style-src-attr",
        blockedURI: "inline",
        sourceFile: "",
        lineNumber: 0,
        columnNumber: 0,
        sample: "fill: red",
      }),
    );
    window.dispatchEvent(
      new ErrorEvent("error", { message: "boom", filename: "webview.js", lineno: 1, colno: 2 }),
    );
    const thrown = new Error("thrown");
    window.dispatchEvent(new ErrorEvent("error", { message: "thrown", error: thrown }));
    const image = document.createElement("img");
    image.setAttribute("src", "https://webview.test/missing.png");
    document.body.append(image);
    image.dispatchEvent(new Event("error"));
    image.remove();
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: "no fixture yet" }),
    );
    console.error("palette:", { entries: 0 });

    expect(stub.cspViolations()).toEqual([
      {
        directive: "script-src",
        blockedURI: "eval",
        source: "https://webview.test/webview.js:2:31",
        sample: "",
      },
      { directive: "style-src-attr", blockedURI: "inline", source: "", sample: "fill: red" },
    ]);
    expect(stub.errors()).toEqual([
      "boom (webview.js:1:2)",
      thrown.stack,
      "<img> failed to load https://webview.test/missing.png",
      "unhandled rejection: no fixture yet",
      'console.error: palette: {"entries":0}',
    ]);
    expect(quiet).toHaveBeenCalledWith("palette:", { entries: 0 });
  });
});

describe("vsCodeStubSearch and stubOptionsFromSearch", () => {
  it("hand the requested appearance and the extras to the test page", () => {
    const search = vsCodeStubSearch(
      { theme: "dark", kontrast: "hoch" },
      { colorTheme: "light", reduceMotion: true },
    );
    expect(stubOptionsFromSearch(`?${search}`)).toEqual({
      requested: { theme: "dark", kontrast: "hoch" },
      colorTheme: "light",
      reduceMotion: true,
    });
    expect(stubOptionsFromSearch(vsCodeStubSearch({ theme: "light" }))).toEqual({
      requested: { theme: "light" },
      colorTheme: undefined,
      reduceMotion: false,
    });
  });

  it("maps an appearance to the VS Code color theme that requests it", () => {
    expect(colorThemeKindOf({ theme: "light" })).toBe(1);
    expect(colorThemeKindOf({ theme: "dark" })).toBe(2);
    expect(colorThemeKindOf({ theme: "dark", kontrast: "hoch" })).toBe(3);
    expect(colorThemeKindOf({ theme: "light", kontrast: "hoch" })).toBe(4);
  });
});
