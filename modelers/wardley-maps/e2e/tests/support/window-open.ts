import type { Page } from "@playwright/test";

const RECORDED = "__windowOpens";

/** Records every `window.open` instead of opening it, from before the first script runs. */
export async function recordWindowOpens(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const recorded: unknown[][] = [];
    Object.assign(window, { [key]: recorded });
    window.open = (...args: unknown[]) => {
      recorded.push(args);
      return null;
    };
  }, RECORDED);
}

export function recordedWindowOpens(page: Page): Promise<unknown[][]> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, unknown[][] | undefined>)[key] ?? [],
    RECORDED,
  );
}
