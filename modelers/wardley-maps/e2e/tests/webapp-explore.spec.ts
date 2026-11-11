import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  canvasSlot,
  exportDSL,
  exportMap,
  exportSvg,
  menuEntry,
  openExample,
  openMenu,
  selectShape,
  startNewMap,
  waitForViewer,
} from "./support/viewer.js";

/**
 * Explore mode in the web app: the Tea Shop revealed step by step from Hot Water along its value
 * chain, with the palette's toggle, the chips, the Model menu's checkbox and the E key. Exploring
 * changes nothing: the map text stays as it was, and the SVG export holds only what shows.
 */

const MY_MAP = "title My strategy\ncomponent Alpha [0.5, 0.5]\ncomponent Beta [0.3, 0.7]";

const HIDDEN = "wardley-explore-hidden";

test.beforeEach(({ page }) => {
  page.on("dialog", (dialog) => {
    throw new Error(`unexpected native ${dialog.type()} prompt: ${dialog.message()}`);
  });
});

async function openTeaShop(page: Page): Promise<void> {
  await page.goto("/");
  await waitForViewer(page);
  await openExample(page);
}

/** The drawn element, not a chip of explore mode that names the same element. */
function shape(page: Page, id: string): Locator {
  return canvasSlot(page).locator(`.djs-element[data-element-id="${id}"]`);
}

function paletteEntry(page: Page, action: string): Locator {
  return page.locator(`[data-chrome="palette"] [data-action="${action}"]`);
}

function chip(page: Page, id: string, direction: "dependencies" | "dependents"): Locator {
  return canvasSlot(page).locator(
    `.wardley-explore-chip[data-element-id="${id}"][data-direction="${direction}"]`,
  );
}

function hint(page: Page): Locator {
  return canvasSlot(page).locator(".wardley-explore-hint");
}

function exploring(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    (
      window.__wardleyViewer as unknown as {
        get(name: "wardleyExplore"): { isActive(): boolean };
      }
    )
      .get("wardleyExplore")
      .isActive(),
  );
}

function canvasSvg(page: Page): Locator {
  return canvasSlot(page).locator('svg[role="application"]');
}

function toast(page: Page, text: string): Locator {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

test.describe("explore mode", () => {
  test("reveals the Tea Shop from Hot Water, exports only what shows and changes no text", async ({
    page,
  }) => {
    await openTeaShop(page);
    const before = await exportDSL(page);
    await selectShape(page, "cmp_hot_water");

    const toggle = paletteEntry(page, "explore");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();

    await expect(paletteEntry(page, "explore")).toHaveAttribute("aria-pressed", "true");
    await expect(paletteEntry(page, "create.component")).toHaveCount(0);
    await expect(shape(page, "cmp_hot_water")).toBeVisible();
    await expect(shape(page, "cmp_kettle")).toBeHidden();
    await expect(shape(page, "cmp_cup_of_tea")).toBeHidden();
    await expect(hint(page)).toHaveText("1 of 9 components");

    const dependencies = chip(page, "cmp_hot_water", "dependencies");
    await expect(dependencies).toHaveAttribute("aria-label", "Show 2 dependencies of Hot Water");
    await expect(chip(page, "cmp_hot_water", "dependents")).toHaveAttribute(
      "aria-label",
      "Show 1 dependent of Hot Water",
    );
    await dependencies.click();

    await expect(shape(page, "cmp_kettle")).toBeVisible();
    await expect(shape(page, "cmp_water")).toBeVisible();
    await expect(shape(page, "cmp_power")).toBeHidden();
    await expect(shape(page, "cmp_cup_of_tea")).toBeHidden();
    await expect(hint(page)).toHaveText("3 of 9 components");
    await expect(chip(page, "cmp_kettle", "dependencies")).toBeVisible();

    const svg = await exportSvg(page);
    for (const shown of ["cmp_hot_water", "cmp_kettle", "cmp_water"]) {
      expect(svg).toContain(`data-element-id="${shown}"`);
    }
    for (const hidden of ["cmp_power", "cmp_cup_of_tea", "cmp_tea", "anchor_business"]) {
      expect(svg).not.toContain(`data-element-id="${hidden}"`);
    }
    expect(svg).not.toContain("wardley-explore");
    expect(await exportDSL(page)).toBe(before);

    await paletteEntry(page, "explore").click();

    await expect(paletteEntry(page, "explore")).toHaveAttribute("aria-pressed", "false");
    await expect(paletteEntry(page, "create.component")).toHaveCount(1);
    await expect(canvasSlot(page).locator(`.${HIDDEN}`)).toHaveCount(0);
    await expect(canvasSlot(page).locator(".wardley-explore-chip")).toHaveCount(0);
    await expect(hint(page)).toBeEmpty();
    for (const id of ["cmp_power", "cmp_cup_of_tea", "anchor_business"]) {
      await expect(shape(page, id)).toBeVisible();
    }
    const exported = await exportSvg(page);
    expect(exported).toContain('data-element-id="cmp_power"');
    expect(exported).toContain('data-element-id="anchor_business"');
    expect(await exportDSL(page)).toBe(before);
  });

  test("the Model menu's checkbox toggles it and disables the entries that change the map", async ({
    page,
  }) => {
    await openTeaShop(page);
    const documentEntries = ["map-title", "map-size", "x-axis-labels", "edit-dsl"];
    const dropdown = await openMenu(page);
    const checkbox = dropdown.locator('[data-menu-id="explore-mode"]');
    await expect(checkbox).toHaveAttribute("role", "menuitemcheckbox");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    for (const id of documentEntries) {
      await expect(dropdown.locator(`[data-menu-id="${id}"]`)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }

    await checkbox.click();

    await expect(dropdown).toBeVisible();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    expect(await exploring(page)).toBe(true);
    await expect(hint(page)).toHaveText("Pick a component to start from.");
    for (const id of documentEntries) {
      await expect(dropdown.locator(`[data-menu-id="${id}"]`)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    for (const id of ["view-json", "export-png", "export-svg", "keyboard-shortcuts"]) {
      await expect(dropdown.locator(`[data-menu-id="${id}"]`)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }

    await checkbox.click();

    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    expect(await exploring(page)).toBe(false);
    await expect(hint(page)).toBeEmpty();
    await expect(dropdown.locator('[data-menu-id="map-size"]')).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("E on the canvas toggles it, and the menu follows", async ({ page }) => {
    await openTeaShop(page);
    await canvasSvg(page).focus();
    await page.keyboard.press("e");
    await expect(hint(page)).toHaveText("Pick a component to start from.");
    expect(await exploring(page)).toBe(true);
    await expect((await openMenu(page)).locator('[data-menu-id="explore-mode"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");

    await canvasSvg(page).focus();
    await page.keyboard.press("e");
    await expect(hint(page)).toBeEmpty();
    expect(await exploring(page)).toBe(false);
  });

  test("Cmd/Ctrl+Z brings no replaced map back while exploring", async ({ page }) => {
    await startNewMap(page);
    await page.evaluate((dsl) => window.__wardleyViewer.importDSL(dsl), MY_MAP);
    await menuEntry(page, "show-example");
    await expect.poll(async () => (await exportMap(page)).config.title).toBe("Tea Shop");
    await expect(toast(page, "Map replaced")).toBeVisible();

    await canvasSvg(page).focus();
    await page.keyboard.press("e");
    expect(await exploring(page)).toBe(true);
    await page.keyboard.press("ControlOrMeta+z");
    // Bringing the map back would have left explore mode at once, before its import.
    expect(await exploring(page)).toBe(true);
    expect((await exportMap(page)).config.title).toBe("Tea Shop");

    await page.keyboard.press("e");
    expect(await exploring(page)).toBe(false);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await exportMap(page)).config.title).toBe("My strategy");
  });

  test("opening another map leaves it", async ({ page }) => {
    await openTeaShop(page);
    await selectShape(page, "cmp_hot_water");
    await paletteEntry(page, "explore").click();
    await expect(shape(page, "cmp_kettle")).toBeHidden();

    await menuEntry(page, "new-diagram");
    await expect.poll(async () => (await exportMap(page)).elements.length).toBe(0);
    expect(await exploring(page)).toBe(false);
    await expect(paletteEntry(page, "explore")).toHaveAttribute("aria-pressed", "false");
    await expect(paletteEntry(page, "create.component")).toHaveCount(1);
    await expect(canvasSlot(page).locator(`.${HIDDEN}`)).toHaveCount(0);
    await expect(hint(page)).toBeEmpty();
  });
});
