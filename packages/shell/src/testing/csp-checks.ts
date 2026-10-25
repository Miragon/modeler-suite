import { renderWebviewHtml } from "../vscode/extension/index.js";
import type { CspViolation } from "./vscode-stub.js";

/** One of the shell's fonts in the opened bundle. */
export interface FontFacts {
  family: string;
  /** The faces `document.fonts.load('13px "<family>"', "Aa")` resolved with. */
  faces: number;
  /** Why that load rejected; empty when it resolved. */
  error: string;
  /** Whether an `@font-face` of the family takes its `src` from a `data:` URL. */
  inlined: boolean;
  /**
   * Whether a face of the family carries no `unicode-range` although the family splits its style
   * into subsets: the browser then fetches that face's file whatever the page shows.
   */
  unranged: boolean;
}

/** What the `csp` case reads from the production bundle after its walk. */
export interface CspFacts {
  /** The page's `<meta http-equiv="Content-Security-Policy">`; `null` without one. */
  policy: string | null;
  /** The page's origin, the `cspSource` `openWebviewBundle` hands `renderWebviewHtml`. */
  origin: string;
  /** Whether the page has the VS Code stub that records violations and errors. */
  recording: boolean;
  violations: readonly CspViolation[];
  errors: readonly string[];
  /** The shell's text and mono font, read from the shell root; empty when it has neither. */
  fonts: readonly FontFacts[];
  /**
   * Every font face of the page whose load failed (`FontFace.status` "error"), as
   * `"<family>" <style> <weight>`: a face the page needed, such as an italic of the canvas.
   */
  failedFaces: readonly string[];
}

/** Lines of an error's stack worth quoting; the rest is the bundle's own call chain. */
const ERROR_LINES = 6;

function hint(violation: CspViolation): string {
  if (violation.blockedURI === "eval") {
    return "; the webview CSP blocks eval and new Function, and a bundle with zod 4 runs z.config({ jitless: true }) before any schema";
  }
  if (violation.directive.startsWith("style-src") && violation.blockedURI === "inline") {
    return "; inline styles need renderWebviewHtml's inlineStyles, so the harness passes what the extension passes";
  }
  if (violation.directive.startsWith("font-src")) {
    return "; bundle the font files next to the webview bundle";
  }
  return "";
}

function describeViolation(violation: CspViolation): string {
  const blocked = violation.blockedURI || "a resource";
  const source = violation.source ? ` at ${violation.source}` : "";
  const sample = violation.sample ? ` ("${violation.sample}")` : "";
  return `csp: ${violation.directive} blocked ${blocked}${source}${sample}${hint(violation)}`;
}

/** Stands in for the page's nonce, which differs on every load. */
const ANY_NONCE = "ANY";

/**
 * A policy's directives in one order, each with its sources sorted and its nonce as `ANY_NONCE`,
 * so two spellings of one policy compare equal.
 */
function normalizedPolicy(policy: string): string {
  return policy
    .replace(/'nonce-[^'\s]*'/g, `'nonce-${ANY_NONCE}'`)
    .split(";")
    .map((directive) => directive.trim().split(/\s+/).filter(Boolean))
    .filter((parts) => parts.length > 0)
    .map(([name, ...sources]) => [name!.toLowerCase(), ...sources.sort()].join(" "))
    .sort()
    .join("; ");
}

/**
 * The policy `renderWebviewHtml` writes for `origin`, with the page's choice of `inlineStyles`
 * (the one thing besides the nonce the extension decides), read from the document it renders.
 */
function expectedPolicy(policy: string, origin: string): string {
  const html = renderWebviewHtml({
    cspSource: origin,
    nonce: ANY_NONCE,
    scriptUri: "",
    title: "",
    lang: "en",
    appearance: { theme: "light" },
    inlineStyles: /(?:^|;)\s*style-src\s[^;]*'unsafe-inline'/i.test(policy),
  });
  return (/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * The production bundle under `renderWebviewHtml`'s CSP: the page runs under that policy with the
 * recording stub, nothing violated it, nothing failed, and the shell's fonts loaded from files.
 */
export function cspProblems(facts: CspFacts): string[] {
  const problems: string[] = [];
  if (facts.policy === null) {
    problems.push(
      "csp: the page csp.open loaded has no Content-Security-Policy; open the production bundle with openWebviewBundle, which serves renderWebviewHtml's document",
    );
  } else {
    const expected = expectedPolicy(facts.policy, facts.origin);
    if (normalizedPolicy(facts.policy) !== normalizedPolicy(expected)) {
      const shown = expected.replace(`'nonce-${ANY_NONCE}'`, "'nonce-…'");
      problems.push(
        `csp: the page's policy "${facts.policy}" is not renderWebviewHtml's for ${facts.origin} ("${shown}"); open the production bundle with openWebviewBundle`,
      );
    }
  }
  if (!facts.recording) {
    problems.push(
      "csp: the page has no VS Code stub that records violations (window.__modelerShellVsCodeStub.cspViolations); open the bundle with openWebviewBundle",
    );
  }

  const counts = new Map<string, number>();
  for (const violation of facts.violations) {
    const problem = describeViolation(violation);
    counts.set(problem, (counts.get(problem) ?? 0) + 1);
  }
  for (const [problem, count] of counts) {
    problems.push(count > 1 ? `${problem} (${count} times)` : problem);
  }

  for (const error of facts.errors) {
    const lines = error.split("\n");
    const quoted = lines
      .slice(0, ERROR_LINES)
      .map((line) => line.trim())
      .join("\n    ");
    problems.push(`error: ${quoted}${lines.length > ERROR_LINES ? "\n    …" : ""}`);
  }

  if (facts.fonts.length === 0) {
    problems.push(
      "fonts: the shell root names no font family (--modeler-shell-font); the shell's stylesheet did not load",
    );
  }
  for (const font of facts.fonts) {
    if (font.faces === 0) {
      const why = font.error ? `: ${font.error}` : "";
      problems.push(
        `fonts: "${font.family}" loaded no face${why}; bundle its font files next to the webview bundle`,
      );
    }
    if (font.inlined) {
      problems.push(
        `fonts: "${font.family}" comes from a data: URL; bundle its font files next to the webview bundle (esbuild loader "file"), so the browser fetches only the subsets a page needs`,
      );
    }
    if (font.unranged) {
      problems.push(
        `fonts: a face of "${font.family}" has no unicode-range beside the family's other subsets, so every page fetches its file; keep the font's @font-face rules as its package ships them`,
      );
    }
  }
  for (const face of new Set(facts.failedFaces)) {
    problems.push(
      `fonts: the face ${face} failed to load; bundle its font file next to the webview bundle`,
    );
  }
  return problems;
}
