import { afterEach, describe, expect, it } from "vitest";

import type { StubWindow } from "./vscode-stub.js";
import { installVsCodeWebviewStubFromScript } from "./vscode-stub-script.js";

afterEach(() => {
  const html = document.documentElement;
  for (const name of [...html.getAttributeNames()]) html.removeAttribute(name);
  document.body.className = "";
  document.head.querySelector("#_defaultStyles")?.remove();
  delete (window as StubWindow).acquireVsCodeApi;
  delete (window as StubWindow).__modelerShellVsCodeStub;
});

describe("installVsCodeWebviewStubFromScript", () => {
  it("installs the stub with the options of its script's data-options", () => {
    const script = document.createElement("script");
    script.setAttribute(
      "data-options",
      JSON.stringify({ requested: { theme: "dark" }, themes: ["light", "dark"], lang: "de" }),
    );
    const stub = installVsCodeWebviewStubFromScript(script);
    expect(stub.kind).toBe(2);
    expect(document.documentElement.getAttribute("lang")).toBe("de");
    expect(document.documentElement.getAttribute("data-cd-theme")).toBe("dark");
    expect((window as StubWindow).__modelerShellVsCodeStub).toBe(stub);
  });

  it("refuses a script without options", () => {
    expect(() => installVsCodeWebviewStubFromScript(null)).toThrow(
      "@miragon/modeler-shell: the VS Code stub's <script> carries no data-options",
    );
    expect(() => installVsCodeWebviewStubFromScript(document.createElement("script"))).toThrow(
      /carries no data-options/,
    );
  });
});
