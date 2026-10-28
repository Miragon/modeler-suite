import type { BrowserContext, Page } from "@playwright/test";

/**
 * Safari on macOS gives a clicked button no focus: the focus is on `<body>` when its click runs,
 * so a control that only hands on a focus it holds never hands anything on there. Chromium and
 * Playwright's WebKit on Linux, as in CI, focus the button. A capture `mousedown` keeps the button
 * from taking the focus and takes it off the element that held it, as Safari does; the shell's
 * own `e2e/pointer-focus.spec.ts` clicks the same way.
 */
export async function clickButtonsLikeSafari(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener(
      "mousedown",
      (event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button")) return;
        event.preventDefault();
        (document.activeElement as HTMLElement | SVGElement | null)?.blur();
      },
      true,
    );
  });
}

/**
 * Chromium refuses a clipboard write without the permission. WebKit knows no such permission
 * (granting it throws) and allows a write during the click, as Safari does.
 */
export async function allowClipboardWrite(
  context: BrowserContext,
  browserName: string,
): Promise<void> {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-write"]);
}
