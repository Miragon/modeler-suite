import { expect, test, type Page } from "@playwright/test";
import type { LabelEditorHooks } from "@miragon/modeler-shell/testing";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW, EXAMPLE_DEFAULT_VIEW } from "./documents.js";
import { activeViewKey, exportedText } from "./navigation.js";

/** The example's component view of the API: the deepest level, a breadcrumb of four. */
export const EXAMPLE_COMPONENT_VIEW = "Components-api";

/** How a host's page opens the example and shows the islands of its chrome. */
export interface BreadcrumbHost {
  /** Opens the example on `view` (its default view without one), with the canvas ready. */
  open(page: Page, view?: string): Promise<void>;
  /** Shows each island the host has, one after another, on the view shown. */
  readonly islands: Readonly<Record<string, (page: Page) => Promise<void>>>;
}

export const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });

const canvas = (page: Page) => page.locator(".djs-container > svg");

/** The shell's handle on either page: the web app's `app.shell`, or the webview's `shell`. */
export async function showStatus(page: Page): Promise<void> {
  await page.evaluate(() => {
    const shell = (window.app?.shell ?? window.shell)!;
    shell.setStatus({ severity: "danger", text: shell.messages.invalidFile("C4 diagram") });
  });
}

export async function showLegend(page: Page): Promise<void> {
  await page.evaluate(() => (window.app?.shell ?? window.shell)!.legend?.setOpen(true));
}

/** The inspector opens with a selection: the first element the view shows. */
export async function showInspector(page: Page): Promise<void> {
  await page.evaluate(() => {
    const diagram = (window.app?.modeler ?? window.modeler)!.diagram;
    const id = document
      .querySelector('.djs-shape[data-element-id]:not([data-element-id^="boundary:"])')
      ?.getAttribute("data-element-id");
    const registry = diagram.get<{ get(id: string): unknown }>("elementRegistry");
    diagram.get<{ select(element: unknown): void }>("selection").select(registry.get(id ?? ""));
  });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('[data-chrome="inspector"]')?.hidden === false,
  );
}

interface Clearance {
  /** Shown and not stepped aside. */
  readonly shown: boolean;
  /** Its top and bottom in the shell's root. */
  readonly top: number;
  readonly bottom: number;
  /** The visible islands it overlaps. */
  readonly overlaps: string[];
}

/** Where the breadcrumb stands, and every visible island of the shell it overlaps. */
function clearance(page: Page): Promise<Clearance> {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("nav.c4-breadcrumbs");
    const root = document.querySelector(".cd-shell")!.getBoundingClientRect();
    if (!nav || nav.hidden || getComputedStyle(nav).visibility === "hidden") {
      return { shown: false, top: 0, bottom: 0, overlaps: [] };
    }
    const box = nav.getBoundingClientRect();
    const overlaps = [...document.querySelectorAll("[data-chrome]")]
      .filter((island) => island.checkVisibility({ visibilityProperty: true }))
      .filter((island) => {
        const other = island.getBoundingClientRect();
        return (
          other.width > 0 &&
          other.height > 0 &&
          other.left < box.right &&
          other.right > box.left &&
          other.top < box.bottom &&
          other.bottom > box.top
        );
      })
      .map((island) => island.getAttribute("data-chrome") ?? "");
    return { shown: true, top: box.top - root.top, bottom: box.bottom - root.top, overlaps };
  });
}

/** The container sizes of the sweep: wide, the 760px breakpoint, narrow, a phone. */
const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 761, height: 600 },
  { width: 760, height: 600 },
  { width: 420, height: 700 },
  { width: 320, height: 568 },
  { width: 1024, height: 360 },
];

/**
 * The breadcrumb of the view hierarchy in either host: the path from the landscape, a crumb that
 * opens its view, the keyboard after the canvas, and no island of the shell it ever overlaps.
 */
export function registerBreadcrumbTests(host: BreadcrumbHost): void {
  test("the breadcrumb leads up from a component view, and a crumb opens its view", async ({
    page,
  }) => {
    await host.open(page);
    expect(await activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    // The landscape has no view above it.
    await expect(breadcrumb(page)).toBeHidden();

    await page.evaluate(
      (key) => (window.app?.modeler ?? window.modeler)!.views.open(key, { cause: "user" }),
      EXAMPLE_COMPONENT_VIEW,
    );
    const nav = breadcrumb(page);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button")).toHaveText([
      "System landscape",
      "Bookshop context",
      "Bookshop containers",
    ]);
    await expect(nav.getByRole("button", { name: "Bookshop containers" })).toHaveAccessibleName(
      "Bookshop containers",
    );
    await expect(nav.locator('[aria-current="page"]')).toHaveText("API components");
    await expect(nav.getByRole("listitem")).toHaveCount(4);

    await nav.getByRole("button", { name: "Bookshop containers" }).click();

    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Bookshop containers");
    await expect(canvas(page)).toBeFocused();
    await nav.getByRole("button", { name: "System landscape" }).click();
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    await expect(nav).toBeHidden();
    // Navigating writes nothing.
    expect(await exportedText(page)).toBe(EXAMPLE);
  });

  test("Tab reaches the crumbs after the canvas, and Enter on one gives the canvas the keyboard", async ({
    page,
  }) => {
    await host.open(page, EXAMPLE_COMPONENT_VIEW);
    await canvas(page).focus();
    await page.keyboard.press("Tab");
    await expect(breadcrumb(page).getByRole("button", { name: "System landscape" })).toBeFocused();
    await page.keyboard.press("Tab");
    const context = breadcrumb(page).getByRole("button", { name: "Bookshop context" });
    await expect(context).toBeFocused();

    await page.keyboard.press("Enter");

    await expect.poll(() => activeViewKey(page)).toBe("SystemContext-bookshop");
    await expect(canvas(page)).toBeFocused();
    // The canvas has the keyboard: U goes up once more.
    await page.keyboard.press("u");
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_DEFAULT_VIEW);
    await expect(breadcrumb(page)).toBeHidden();
  });

  test("it overlaps no island of the shell at any size, below the palette's second row", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      const states: Array<[string, ((page: Page) => Promise<void>) | undefined]> = [
        ["as opened", undefined],
        ...Object.entries(host.islands),
      ];
      for (const [state, show] of states) {
        await host.open(page, EXAMPLE_COMPONENT_VIEW);
        await show?.(page);
        await page.waitForTimeout(100);
        const where = `${size.width}×${size.height}, ${state}`;
        const placed = await clearance(page);
        expect(placed.overlaps, where).toEqual([]);
        if (state !== "as opened") continue;
        // As opened nothing is in its way, and it stands on the free line of its row.
        expect(placed.shown, where).toBe(size.width >= 144);
        const secondRow = await page.evaluate(
          () => document.querySelector(".cd-shell")!.getAttribute("data-palette") === "second-row",
        );
        expect([placed.top, placed.bottom], where).toEqual(secondRow ? [116, 140] : [64, 88]);
      }
    }
  });
}

/**
 * The label editor of the kit's `overlayLayers` case on a view with boundaries: a double-click on
 * its first element, not on a boundary, whose inside reaches the members.
 */
export function elementLabelEditorHooks(
  exportText: (page: Page) => Promise<string>,
): LabelEditorHooks<Page> {
  let opens = 0;
  let exportedAtOpen = "";
  return {
    async open(page) {
      await page
        .locator('.djs-shape[data-element-id]:not([data-element-id^="boundary:"])')
        .first()
        .dblclick();
      await page.locator("textarea.diagram-label-editor").waitFor();
      opens += 1;
      const typed = `Renamed ${opens}`;
      await page.keyboard.type(typed);
      exportedAtOpen = await exportText(page);
      return typed;
    },
    async documentChanged(page) {
      return (await exportText(page)) !== exportedAtOpen;
    },
  };
}
