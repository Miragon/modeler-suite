import type { Page } from "@playwright/test";

import type { Theme } from "../src/index.js";
import type { DropFixtures, ShellConformanceHarness, ShowHooks } from "../src/testing.js";
import { demoLabelEditor } from "./label-editor-hooks.js";

export interface WebDemoHarnessOptions {
  /** The modes the demo modeler declares; default `["light"]`, as every modeler today. */
  themes?: readonly Theme[];
  /** Slots the demo leaves out; the harness drops their show hooks and declares them `absent`. */
  without?: ReadonlyArray<"legend" | "inspector">;
}

/** What the web demo opens and rejects (its `dropZone.accept`: `.demo`, `.json`, `application/json`). */
export const WEB_DROP: DropFixtures = {
  accepted: { name: "board.json", type: "application/json", text: '{ "boxes": 3 }' },
  // no MIME type: the drag cannot be told apart before the drop, so the drop itself rejects it
  rejected: { name: "notes.md", type: "", text: "# Notes" },
};

/** Pages that start every visit without a stored appearance choice (`miragon.darstellung`). */
const freshPages = new WeakSet<Page>();

/**
 * The kit's harness for the web demo (`/web.html`), as a Miragon web app's e2e suite writes it:
 * the kit emulates the system's mode and contrast before `open`, `open` loads the page without a
 * stored choice (the empty document: the start screen, then its "New diagram"), and the show hooks
 * drive `window.__webDemo`.
 */
export function webDemoHarness(options: WebDemoHarnessOptions = {}): ShellConformanceHarness<Page> {
  const themes = options.themes ?? ["light"];
  const without = options.without ?? [];
  const show: ShowHooks<Page> = {
    async problems(page) {
      await page.evaluate(() => window.__webDemo?.showProblems());
    },
    async status(page) {
      await page.evaluate(() => {
        const shell = window.__webDemo?.shell;
        shell?.setStatus({ severity: "danger", text: shell.messages.invalidFile("demo diagram") });
      });
    },
    async legend(page) {
      await page.evaluate(() => window.__webDemo?.shell.legend?.setOpen(true));
    },
    async inspector(page) {
      await page.evaluate(() => window.__webDemo?.shell.inspector?.open());
    },
    async invalid(page) {
      await page.evaluate(() => window.__webDemo?.setInvalid(true));
    },
    async emptyState(page) {
      await page.evaluate(() => window.__webDemo?.startScreen());
    },
    async toast(page, toast) {
      await page.evaluate((request) => window.__webDemo?.toast(request), toast);
    },
  };
  for (const slot of without) delete show[slot];
  return {
    host: "web",
    themes,
    async open(page, { size, document: documentKey }) {
      if (!freshPages.has(page)) {
        freshPages.add(page);
        await page.addInitScript(() => {
          try {
            localStorage.removeItem("miragon.darstellung");
          } catch {
            // a blocked storage holds no choice either
          }
        });
      }
      await page.setViewportSize({ width: size.width, height: size.height });
      const query = new URLSearchParams({ themes: themes.join(",") });
      for (const slot of ["legend", "inspector"] as const) {
        if (!without.includes(slot)) query.set(slot, "");
      }
      if (documentKey !== undefined && documentKey !== "empty") {
        throw new Error(`web demo: no document "${documentKey}"`);
      }
      if (documentKey) query.set("empty", "");
      await page.goto(`/web.html?${query.toString()}`);
      await page.waitForFunction(() => window.__webDemo?.ready === true);
      if (!documentKey) return;
      await page.getByRole("button", { name: "New diagram" }).click();
      await page.waitForFunction(() => window.__webDemo?.shell.isEmptyStateShown() === false);
    },
    async destroy(page) {
      await page.evaluate(() => window.__webDemo?.destroy());
    },
    show,
    drop: WEB_DROP,
    labelEditor: demoLabelEditor((page) =>
      page.evaluate(() => window.__webDemo?.documentChanges() ?? 0),
    ),
    absent: without,
    documents: ["empty"],
  };
}
