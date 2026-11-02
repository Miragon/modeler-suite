import { expect, test, type Page } from "@playwright/test";
import { breadcrumb, EXAMPLE_COMPONENT_VIEW } from "./breadcrumbs.js";
import { EXAMPLE_CONTAINER_VIEW } from "./documents.js";

/** How a host's page opens the example on a view, with the canvas ready. */
export interface FitFeedbackHost {
  open(page: Page, view?: string): Promise<void>;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The screen box of what the view draws (the contract's content bounds), in the shell's root. */
function contentOnScreen(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const modeler = (window.app?.modeler ?? window.modeler)!;
    const bounds = modeler.contentBounds();
    if (!bounds) throw new Error("the view draws nothing");
    const viewbox = modeler.diagram
      .get<{ viewbox(): { x: number; y: number; scale: number } }>("canvas")
      .viewbox();
    const root = document.querySelector(".cd-shell")!.getBoundingClientRect();
    const slot = document.querySelector(".cd-shell-canvas")!.getBoundingClientRect();
    const toX = (x: number) => slot.left - root.left + (x - viewbox.x) * viewbox.scale;
    const toY = (y: number) => slot.top - root.top + (y - viewbox.y) * viewbox.scale;
    return {
      left: toX(bounds.x),
      top: toY(bounds.y),
      right: toX(bounds.x + bounds.width),
      bottom: toY(bounds.y + bounds.height),
    };
  });
}

/** Waits until the viewbox holds still: a fit glides for 250ms. */
async function settled(page: Page): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const now = await page.evaluate(() =>
        JSON.stringify(
          (window.app?.modeler ?? window.modeler)!.diagram
            .get<{ viewbox(): unknown }>("canvas")
            .viewbox(),
        ),
      );
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
}

/**
 * What the canvas does after the app hands it a fit, in either host: "Lay out automatically" shows
 * the new layout, and a fitted view stays clear of the breadcrumb.
 */
export function registerFitFeedbackTests(host: FitFeedbackHost): void {
  test("Lay out automatically fits the view to the new layout", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await host.open(page, EXAMPLE_CONTAINER_VIEW);
    // A member dragged far off, and the view zoomed in on it: the new layout lies elsewhere.
    await page.evaluate(() => {
      const diagram = (window.app?.modeler ?? window.modeler)!.diagram;
      const registry = diagram.get<{ get(id: string): { x: number; y: number } }>(
        "elementRegistry",
      );
      diagram
        .get<{ moveElements(shapes: unknown[], delta: { x: number; y: number }): void }>("modeling")
        .moveElements([registry.get("payments")], { x: 2600, y: 1400 });
      const shape = registry.get("payments");
      diagram
        .get<{ viewbox(box: object): void }>("canvas")
        .viewbox({ x: shape.x - 300, y: shape.y - 300, width: 1440, height: 900 });
    });

    await page.locator('[data-chrome="menu"]').click();
    await page.locator('[role="menu"] [data-menu-id="lay-out-automatically"]').click();
    await settled(page);

    const content = await contentOnScreen(page);
    const free = await page.evaluate(() => {
      const shell = (window.app?.shell ?? window.shell)!;
      const root = document.querySelector(".cd-shell")!.getBoundingClientRect();
      return { insets: shell.fitInsets(), width: root.width, height: root.height };
    });
    expect(content.left).toBeGreaterThanOrEqual(free.insets.left - 1);
    expect(content.right).toBeLessThanOrEqual(free.width - free.insets.right + 1);
    expect(content.top).toBeGreaterThanOrEqual(free.insets.top - 1);
    expect(content.bottom).toBeLessThanOrEqual(free.height - free.insets.bottom + 1);
  });

  test("a fitted view leaves 8px between the breadcrumb and the content", async ({ page }) => {
    // Short enough that the height decides the fit, so the content reaches the top of the room.
    await page.setViewportSize({ width: 1440, height: 700 });
    await host.open(page, EXAMPLE_COMPONENT_VIEW);
    await breadcrumb(page).waitFor();
    await page.evaluate(() => (window.app?.connection ?? window.connection)!.viewport.fit());
    await settled(page);

    const crumbBottom = await breadcrumb(page).evaluate(
      (nav) =>
        nav.getBoundingClientRect().bottom -
        document.querySelector(".cd-shell")!.getBoundingClientRect().top,
    );
    const content = await contentOnScreen(page);
    expect(content.top - crumbBottom).toBeGreaterThanOrEqual(7.5);
    expect(content.top - crumbBottom, "the height decides this fit").toBeLessThan(12);
  });
}
