import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE, EXAMPLE_CONTAINER_VIEW } from "../support/documents.js";
import { activeViewKey, registerNavigationTests } from "../support/navigation.js";
import { openWebview, webviewPosted } from "./support/webview.js";

/**
 * Navigation in the VS Code webview (SPEC 7.3, 8.2): the host-independent part, then what the
 * webview adds. Go to View… and the Parent View command arrive as messages of the extension host.
 * The webview state keeps the view the canvas showed and the place each view was left at, so a
 * reload comes back to both: the first import applies the stored place with `viewport.setState`.
 */

interface StoredC4State {
  readonly activeView?: string;
  readonly viewportByView?: Record<string, { viewbox: unknown; userMoved: boolean }>;
}

function storedState(page: Page): Promise<{ c4?: StoredC4State } & Record<string, unknown>> {
  return page.evaluate(
    () =>
      (window.__modelerShellVsCodeStub?.state() ?? {}) as { c4?: StoredC4State } & Record<
        string,
        unknown
      >,
  );
}

function viewState(page: Page) {
  return page.evaluate(() => window.modeler!.getViewState());
}

const post = (page: Page, message: Record<string, unknown>) =>
  page.evaluate((sent) => window.postMessage(sent, "*"), message);

test.describe("VS Code webview: navigation", () => {
  registerNavigationTests({ open: (page) => openWebview(page) });

  test("a draft's first edit reaches the extension as one edit that writes the view", async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => window.modeler!.views.open("Containers-mail", { cause: "user" }));
    await expect.poll(() => activeViewKey(page)).toBe("Containers-mail");
    // A view switch posts nothing.
    expect((await webviewPosted(page)).map((message) => message.type)).toEqual(["ready"]);

    await page.locator('.djs-palette [data-action="create.container"]').focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");

    await expect
      .poll(async () => (await webviewPosted(page)).filter((message) => message.type === "edit"))
      .toHaveLength(1);
    const [edit] = (await webviewPosted(page)).filter((message) => message.type === "edit");
    expect(String(edit!.text)).toContain('container mail "Containers-mail"');
  });

  test("Go to View… and Parent View arrive from the extension", async ({ page }) => {
    await openWebview(page);
    await post(page, { type: "c4.showView", key: "Components-api" });
    await expect.poll(() => activeViewKey(page)).toBe("Components-api");
    await post(page, { type: "command", name: "parentView" });
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);

    // A view the file no longer has is a notification, and the canvas stays.
    await post(page, { type: "c4.showView", key: "Gone" });
    await expect
      .poll(async () => (await webviewPosted(page)).filter((message) => message.type === "error"))
      .toHaveLength(1);
    expect(await activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    expect(await page.evaluate(() => window.modeler!.exportText())).toBe(EXAMPLE);
  });

  test("a reload comes back to the view and the place the user panned to", async ({ page }) => {
    await openWebview(page);
    await post(page, { type: "c4.showView", key: EXAMPLE_CONTAINER_VIEW });
    await expect.poll(() => activeViewKey(page)).toBe(EXAMPLE_CONTAINER_VIEW);
    const fitted = await viewState(page);

    const canvas = (await page.locator(".djs-container > svg").boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.mouse.wheel(120, 160);
    await expect.poll(() => viewState(page)).not.toEqual(fitted);
    const panned = await viewState(page);
    // The webview writes its state once the view rests.
    await expect
      .poll(async () => (await storedState(page)).c4?.viewportByView?.[EXAMPLE_CONTAINER_VIEW])
      .toMatchObject({
        userMoved: true,
        viewbox: { x: panned!.x, y: panned!.y, width: panned!.width, height: panned!.height },
      });
    const stored = await storedState(page);
    expect(stored.c4?.activeView).toBe(EXAMPLE_CONTAINER_VIEW);

    await openWebview(page, { state: stored });

    expect(await viewState(page)).toEqual(panned);
    // The place stays: a fit that the first import still owed would move it.
    await page.waitForTimeout(300);
    expect(await viewState(page)).toEqual(panned);
  });
});
