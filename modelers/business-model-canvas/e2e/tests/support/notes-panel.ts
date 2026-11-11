import type { Page } from "@playwright/test";

/** Opens the notes panel in the shell's inspector with its key, as a person on the canvas would. */
export async function openNotesPanel(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "n" })));
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('[data-chrome="inspector"]')?.hidden === false,
  );
}
