import { expect, test, type Page } from "@playwright/test";

/**
 * The web app as a page: the example repository on the board, with every model drawn by its own
 * modeler, and what only a real page has: the browser's own storage, a reload, and the reset
 * link, which is a navigation.
 */

// The first visit loads the seven renderers from their sources through the dev server.
const MODELS_READY_MS = 90_000;

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

// Chromium's line for a ResizeObserver that could not deliver in one frame: no error of the page.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

/** uncaught errors and console.error lines of the page, collected from before it loads */
function problemsOf(page: Page): string[] {
  const problems: string[] = [];
  const report = (problem: string): void => {
    if (!problem.includes(RESIZE_OBSERVER)) problems.push(problem);
  };
  page.on("pageerror", (error) => report(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") report(`console.error: ${message.text()}`);
  });
  return problems;
}

async function modelsReady(page: Page): Promise<void> {
  await expect(page.locator('.board-engine[data-embed-state="ready"]')).toHaveCount(7, {
    timeout: MODELS_READY_MS,
  });
  await expect(page.locator(".board-engine")).toHaveCount(7);
}

test("the example opens with its seven models ready, its picture drawn and no page error", async ({
  page,
}) => {
  const problems = problemsOf(page);

  await page.goto("/");
  await modelsReady(page);

  // one editor per notation of the suite, each on its own canvas
  await expect(page.locator(".board-engine svg")).not.toHaveCount(0);
  const kinds = await page.locator(".board-node__notation").allTextContents();
  expect([...kinds].sort()).toEqual([
    "Business Model Canvas",
    "C4 model",
    "Context Map",
    "Event Storming",
    "Team Topology",
    "Value Chain",
    "Wardley Map",
  ]);
  const picture = page.locator('.board-image[data-missing="false"] img');
  await expect(picture).toHaveCount(1);
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator(".board-text")).toHaveCount(2);
  await expect(page.locator(".board-group")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("a change is there after a reload, and the reset link brings the example back", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await page.goto("/");
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(2);

  await page.getByRole("button", { name: "Text" }).click();
  await expect(page.locator(".board-text")).toHaveCount(3);

  await page.reload();
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(3);

  await page.getByRole("link", { name: "Reset the example" }).click();
  await modelsReady(page);
  await expect(page.locator(".board-text")).toHaveCount(2);
  // the request is taken out of the address: another reload must not reset again
  expect(new URL(page.url()).search).toBe("");
  expect(problems).toEqual([]);
});
