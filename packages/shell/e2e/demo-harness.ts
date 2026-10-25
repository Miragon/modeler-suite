import type { Page } from "@playwright/test";

import type { Appearance, ShellHost, Theme } from "../src/index.js";
import { vsCodeStubSearch, type ShellConformanceHarness, type ShowHooks } from "../src/testing.js";
import { colorThemeKindOf } from "../src/testing-vscode-stub.js";
import { openWebviewBundle } from "../src/testing-webview-bundle.js";
import { DEMO_WEBVIEW_DIST, demoStubScript } from "./demo-webview.js";
import { demoLabelEditor } from "./label-editor-hooks.js";

/**
 * What the demo's foreign page (demo.css) puts around the embedded root's container: 40px page
 * padding and the root's own 1px border on each side.
 */
const EMBEDDED_FRAME = { width: 2 * 40 + 2 * 1, height: 2 * 40 + 2 * 1 } as const;

export interface DemoHarnessOptions {
  /** The modes the demo modeler declares; default `["light"]`, as every modeler today. */
  themes?: readonly Theme[];
  /**
   * `ide` only: open under VS Code Light and switch the stubbed host to the requested color theme
   * at runtime, so the mode arrives through the theme bridge instead of the initial HTML.
   */
  switchAtRuntime?: boolean;
  /**
   * Slots the demo modeler leaves out, as a modeler without a legend or an inspector: the page
   * mounts neither, the harness drops their show hooks and declares them `absent`.
   */
  without?: ReadonlyArray<"legend" | "inspector">;
}

const LIGHT: Appearance = { theme: "light" };

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * The kit's harness for the demo page, as a modeler's e2e suite writes it for its webview: the
 * demo mounts legend and inspector slots, the show hooks open them through `window.__demo.shell`,
 * `invalid` puts the demo into its invalid-file state as a failed import would, `labelEditor`
 * edits a box's label, and in the IDE host `csp` opens the demo's production bundle
 * (e2e/demo-webview.ts) under the webview CSP.
 */
export function demoHarness(
  host: ShellHost,
  options: DemoHarnessOptions = {},
): ShellConformanceHarness<Page> {
  const themes = options.themes ?? ["light"];
  const switchAtRuntime = options.switchAtRuntime === true && host === "ide";
  const without = options.without ?? [];
  const show: ShowHooks<Page> = {
    async problems(page) {
      await page.evaluate(() => window.__demo?.shell.setProblems({ count: 2, errors: 1 }));
    },
    async status(page) {
      await page.evaluate(() => {
        const shell = window.__demo?.shell;
        shell?.setStatus({ severity: "danger", text: shell.messages.invalidFile("demo diagram") });
      });
    },
    async legend(page) {
      await page.evaluate(() => window.__demo?.shell.legend?.setOpen(true));
    },
    async inspector(page) {
      await page.evaluate(() => window.__demo?.shell.inspector?.open());
    },
    async invalid(page) {
      await page.evaluate(() => window.__demo?.setInvalid(true));
    },
    // Embedded: toasts until the contract has a channel to the host (guide §5.2); IDE: inert.
    async toast(page, toast) {
      await page.evaluate(
        ({ status, text, actionLabel }) =>
          window.__demo?.shell.toast({
            status,
            text,
            ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
          }),
        toast,
      );
    },
  };
  for (const slot of without) delete show[slot];
  const query = (requested: Appearance): URLSearchParams => {
    const search = new URLSearchParams(vsCodeStubSearch(requested));
    search.set("host", host);
    search.set("themes", themes.join(","));
    for (const slot of ["legend", "inspector"] as const) {
      if (!without.includes(slot)) search.set(slot, "");
    }
    return search;
  };
  return {
    host,
    themes,
    async open(page, { size, requested }) {
      // the embedded root sits inside a framed foreign page; grow the page so the container gets `size`
      const frame = host === "embedded" ? EMBEDDED_FRAME : { width: 0, height: 0 };
      await page.setViewportSize({
        width: size.width + frame.width,
        height: size.height + frame.height,
      });
      await page.goto(`/?${query(switchAtRuntime ? LIGHT : requested).toString()}`);
      await page.waitForFunction(() => window.__demo?.ready === true);
      if (!switchAtRuntime) return;
      await page.evaluate(
        (kind) => window.__demo?.vscode?.setColorThemeKind(kind),
        colorThemeKindOf(requested),
      );
      await page.waitForFunction(
        () =>
          window.__demo?.vscode?.pendingMessages() === 0 &&
          !document.documentElement.classList.contains("cd-shell-no-transition"),
      );
    },
    async destroy(page) {
      await page.evaluate(() => window.__demo?.destroy());
    },
    show,
    labelEditor: demoLabelEditor((page) =>
      page.evaluate(() => window.__demo?.documentChanges() ?? 0),
    ),
    csp:
      host === "ide"
        ? {
            async open(page, { size, requested }) {
              await page.setViewportSize(size);
              await openWebviewBundle(page, {
                dist: DEMO_WEBVIEW_DIST,
                title: "@miragon/modeler-shell demo",
                requested,
                themes,
                body: `<div id="app" data-search="${escapeAttribute(query(requested).toString())}"></div>`,
                stubScript: demoStubScript(),
              });
              await page.waitForFunction(() => window.__demo?.ready === true);
            },
          }
        : undefined,
    absent: without,
  };
}
