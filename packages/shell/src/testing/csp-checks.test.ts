import { describe, expect, it } from "vitest";

import { cspProblems, type CspFacts } from "./csp-checks.js";

const POLICY =
  "default-src 'none'; img-src https://webview.test data: blob:; style-src https://webview.test 'unsafe-inline'; font-src https://webview.test data:; script-src 'nonce-abc'";

function facts(overrides: Partial<CspFacts> = {}): CspFacts {
  return {
    policy: POLICY,
    origin: "https://webview.test",
    recording: true,
    violations: [],
    errors: [],
    fonts: [
      { family: "Geist Variable", faces: 1, error: "", inlined: false, unranged: false },
      { family: "Geist Mono Variable", faces: 1, error: "", inlined: false, unranged: false },
    ],
    failedFaces: [],
    ...overrides,
  };
}

describe("cspProblems", () => {
  it("passes a bundle under renderWebviewHtml's policy without violation, error or missing font", () => {
    expect(cspProblems(facts())).toEqual([]);
  });

  it("passes renderWebviewHtml's policy without inline styles, and in another order", () => {
    expect(
      cspProblems(
        facts({
          policy:
            "script-src 'nonce-xyz'; font-src data: https://webview.test; default-src 'none'; style-src https://webview.test; img-src https://webview.test data: blob:",
        }),
      ),
    ).toEqual([]);
  });

  it("fails a page without a policy or with a looser one", () => {
    const expected = (inlineStyles: string) =>
      `("default-src 'none'; img-src https://webview.test data: blob:; style-src https://webview.test${inlineStyles}; font-src https://webview.test data:; script-src 'nonce-…'")`;
    expect(cspProblems(facts({ policy: null }))).toEqual([
      "csp: the page csp.open loaded has no Content-Security-Policy; open the production bundle with openWebviewBundle, which serves renderWebviewHtml's document",
    ]);
    for (const policy of [
      "default-src *",
      "default-src 'none'; script-src 'unsafe-inline'",
      POLICY.replace("'nonce-abc'", "'nonce-abc' 'unsafe-eval'"),
      POLICY.replace("'nonce-abc'", "'nonce-abc' https://webview.test"),
      POLICY.replace("img-src https://webview.test", "img-src *"),
      `${POLICY}; connect-src *`,
    ]) {
      const inlineStyles = policy.includes("style-src") ? " 'unsafe-inline'" : "";
      expect(cspProblems(facts({ policy }))).toEqual([
        `csp: the page's policy "${policy}" is not renderWebviewHtml's for https://webview.test ${expected(inlineStyles)}; open the production bundle with openWebviewBundle`,
      ]);
    }
    expect(cspProblems(facts({ origin: "http://127.0.0.1:5181" }))).toEqual([
      `csp: the page's policy "${POLICY}" is not renderWebviewHtml's for http://127.0.0.1:5181 ("default-src 'none'; img-src http://127.0.0.1:5181 data: blob:; style-src http://127.0.0.1:5181 'unsafe-inline'; font-src http://127.0.0.1:5181 data:; script-src 'nonce-…'"); open the production bundle with openWebviewBundle`,
    ]);
  });

  it("fails a page without the recording stub", () => {
    expect(cspProblems(facts({ recording: false }))).toEqual([
      "csp: the page has no VS Code stub that records violations (window.__modelerShellVsCodeStub.cspViolations); open the bundle with openWebviewBundle",
    ]);
  });

  it("names each violation once, with how often, where and what to do", () => {
    const evalProbe = {
      directive: "script-src",
      blockedURI: "eval",
      source: "https://webview.test/webview.js:2:3105",
      sample: "",
    };
    expect(
      cspProblems(
        facts({
          violations: [
            evalProbe,
            evalProbe,
            { directive: "style-src-attr", blockedURI: "inline", source: "", sample: "fill: red" },
            {
              directive: "font-src",
              blockedURI: "https://fonts.example/geist.woff2",
              source: "",
              sample: "",
            },
            { directive: "img-src", blockedURI: "", source: "", sample: "" },
          ],
        }),
      ),
    ).toEqual([
      "csp: script-src blocked eval at https://webview.test/webview.js:2:3105; the webview CSP blocks eval and new Function, and a bundle with zod 4 runs z.config({ jitless: true }) before any schema (2 times)",
      `csp: style-src-attr blocked inline ("fill: red"); inline styles need renderWebviewHtml's inlineStyles, so the harness passes what the extension passes`,
      "csp: font-src blocked https://fonts.example/geist.woff2; bundle the font files next to the webview bundle",
      "csp: img-src blocked a resource",
    ]);
  });

  it("quotes every error with the first lines of its stack", () => {
    const stack = ["TypeError: boom", ...Array.from({ length: 8 }, (_, line) => `    at f${line}`)];
    expect(
      cspProblems(facts({ errors: [stack.join("\n"), "console.error: no fixture yet"] })),
    ).toEqual([
      `error: ${stack
        .slice(0, 6)
        .map((line) => line.trim())
        .join("\n    ")}\n    …`,
      "error: console.error: no fixture yet",
    ]);
  });

  it("fails a font that loaded no face, one inlined as a data: URL, a subset without unicode-range, a face that failed and a root without fonts", () => {
    expect(
      cspProblems(
        facts({
          fonts: [
            {
              family: "Geist Variable",
              faces: 0,
              error: "NetworkError",
              inlined: false,
              unranged: false,
            },
            { family: "Geist Mono Variable", faces: 1, error: "", inlined: true, unranged: true },
          ],
        }),
      ),
    ).toEqual([
      `fonts: "Geist Variable" loaded no face: NetworkError; bundle its font files next to the webview bundle`,
      `fonts: "Geist Mono Variable" comes from a data: URL; bundle its font files next to the webview bundle (esbuild loader "file"), so the browser fetches only the subsets a page needs`,
      `fonts: a face of "Geist Mono Variable" has no unicode-range beside the family's other subsets, so every page fetches its file; keep the font's @font-face rules as its package ships them`,
    ]);
    expect(
      cspProblems(
        facts({
          failedFaces: ['"Geist Variable" italic 100 900', '"Geist Variable" italic 100 900'],
        }),
      ),
    ).toEqual([
      `fonts: the face "Geist Variable" italic 100 900 failed to load; bundle its font file next to the webview bundle`,
    ]);
    expect(cspProblems(facts({ fonts: [] }))).toEqual([
      "fonts: the shell root names no font family (--modeler-shell-font); the shell's stylesheet did not load",
    ]);
  });
});
