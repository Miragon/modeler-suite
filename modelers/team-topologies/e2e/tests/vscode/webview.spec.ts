import { expect, test, type Page } from "@playwright/test";
import { EXAMPLE_MAP } from "../../../apps/vscode/src/examples.js";
import {
  WIDE,
  exportedDocument,
  openWebview,
  postFromHost,
  postedMessages,
  waitForPosted,
  zoomReadout,
} from "./support/webview.js";
import { PNG_BACKGROUND, TRANSPARENT, pngPixel, svgPixel } from "../support/png.js";

/*
 * The VS Code webview on the modeler shell, driven the way the extension host drives it: document
 * sync and echo, the read-only lock of an invalid file, the empty file, the inspector and legend
 * in the shell's slots, the menu, the Command Palette commands, save and PNG round trips.
 */

const shape = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`);

async function selectOnCanvas(page: Page, id: string): Promise<void> {
  await shape(page, id).click();
  await expect(shape(page, id)).toHaveClass(/selected/);
}

function renamed(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`"${from}" is not in the document`);
  return text.replace(from, to);
}

test.describe("VS Code webview", () => {
  test("a canvas edit becomes one edit with the canonical document", async ({ page }) => {
    await openWebview(page);
    await selectOnCanvas(page, "team_fraud");
    await page.keyboard.press("Delete");

    const edit = await waitForPosted(page, "edit");
    expect(edit.text).not.toContain("team_fraud");
    expect(String(edit.text).endsWith("}\n")).toBe(true);
    expect((await postedMessages(page)).filter((message) => message.type === "edit")).toHaveLength(
      1,
    );
  });

  test("with nothing focused Delete and Backspace leave the diagram and post no edit", async ({
    page,
  }) => {
    await openWebview(page);
    await selectOnCanvas(page, "team_fraud");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.keyboard.press("Delete");
    await page.keyboard.press("Backspace");

    await expect(shape(page, "team_fraud")).toBeAttached();
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);
  });

  for (const change of ["renames another team", "removes the team"] as const) {
    test(`a focused context-pad entry hands the focus to the canvas when an outside change ${change}`, async ({
      page,
    }) => {
      await openWebview(page);
      await selectOnCanvas(page, "team_checkout");
      await page.locator('.djs-context-pad.open [data-action="edit-label"]').focus();

      const changed = JSON.parse(EXAMPLE_MAP) as { nodes: Array<{ id: string; label: string }> };
      if (change === "removes the team") {
        changed.nodes = changed.nodes.filter((node) => node.id !== "team_checkout");
      } else {
        changed.nodes.find((node) => node.id === "team_fraud")!.label = "Fraud Office";
      }
      await postFromHost(page, { type: "update", text: `${JSON.stringify(changed, null, 2)}\n` });
      await expect(shape(page, "team_checkout")).toHaveCount(change === "removes the team" ? 0 : 1);
      await expect(shape(page, "team_fraud")).toContainText(
        change === "removes the team" ? "Fraud Detection" : "Fraud Office",
      );

      await expect(page.locator('.cd-shell-canvas svg[role="application"]')).toBeFocused();
      await page.keyboard.press("ControlOrMeta+A");
      await expect(shape(page, "team_platform")).toHaveClass(/selected/);
    });
  }

  test("an outside change keeps the view and the selection", async ({ page }) => {
    await openWebview(page);
    const fitted = await zoomReadout(page);
    await page.locator('[data-zoom="in"]').click();
    // The readout follows on the next animation frame.
    await expect.poll(() => zoomReadout(page)).not.toBe(fitted);
    const zoom = await zoomReadout(page);
    await selectOnCanvas(page, "team_checkout");

    await postFromHost(page, {
      type: "update",
      text: renamed(EXAMPLE_MAP, '"label": "Fraud Detection"', '"label": "Fraud Office"'),
    });

    await expect(shape(page, "team_fraud")).toContainText("Fraud Office");
    expect(await zoomReadout(page)).toBe(zoom);
    await expect(shape(page, "team_checkout")).toHaveClass(/selected/);
    await expect(page.locator('[data-chrome="inspector"]')).toBeVisible();
  });

  test("an invalid text locks canvas and inspector until a valid one arrives", async ({ page }) => {
    await openWebview(page);
    await selectOnCanvas(page, "team_checkout");
    await postFromHost(page, {
      type: "update",
      text: renamed(EXAMPLE_MAP, '"type": "platform",', '"type": "plat'),
    });

    await expect(page.locator(".cd-shell[data-readonly]")).toBeAttached();
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();
    await expect(page.locator('[data-chrome="inspector"]').getByLabel("Name")).toBeDisabled();
    await shape(page, "team_checkout").click();
    await page.keyboard.press("Delete");
    await expect(shape(page, "team_checkout")).toBeAttached();
    expect((await postedMessages(page)).some((message) => message.type === "edit")).toBe(false);

    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });
    await expect(page.locator(".cd-shell[data-readonly]")).not.toBeAttached();
    await expect(page.locator('[data-chrome="status"]')).toBeHidden();
  });

  test("an empty file opens at 100 % with Insert example, which the host writes", async ({
    page,
  }) => {
    await openWebview(page, { doc: "empty" });
    expect(await zoomReadout(page)).toBe("100%");
    const insert = page.getByRole("button", { name: "Insert example" });
    await expect(insert).toBeVisible();

    await insert.click();
    await waitForPosted(page, "insertExample");
    await postFromHost(page, { type: "update", text: EXAMPLE_MAP });

    await expect(insert).toBeHidden();
    await expect(shape(page, "team_checkout")).toBeVisible();
    expect(parseInt((await zoomReadout(page)) ?? "", 10)).toBeLessThanOrEqual(100);
  });

  test("a blank file is a new, empty diagram, not an invalid one", async ({ page }) => {
    await openWebview(page, { doc: "blank" });
    await expect(page.getByRole("button", { name: "Insert example" })).toBeVisible();
    await expect(page.locator(".cd-shell[data-readonly]")).not.toBeAttached();
  });

  test("the inspector in the shell's slot edits the selected team as one edit", async ({
    page,
  }) => {
    await openWebview(page);
    await selectOnCanvas(page, "team_checkout");
    const inspector = page.locator('[data-chrome="inspector"]');
    await expect(inspector).toHaveAttribute("aria-label", "Properties");

    const name = inspector.getByLabel("Name");
    await name.fill("Checkout");
    await name.press("Enter");

    const edit = await waitForPosted(page, "edit");
    expect(edit.text).toContain('"label": "Checkout"');
    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
  });

  test("a save commits the inspector's draft first", async ({ page }) => {
    await openWebview(page);
    await selectOnCanvas(page, "team_checkout");
    await page.locator('[data-chrome="inspector"]').getByLabel("Name").fill("Payments");

    await postFromHost(page, { type: "flush", id: 7 });

    await waitForPosted(page, "flushed");
    const messages = await postedMessages(page);
    const edit = messages.findIndex((message) => message.type === "edit");
    expect(edit).toBeGreaterThanOrEqual(0);
    expect(String(messages[edit]!.text)).toContain('"label": "Payments"');
    expect(edit).toBeLessThan(messages.findIndex((message) => message.type === "flushed"));
  });

  test("the legend keeps its state under the shell's key, carried over once", async ({ page }) => {
    await openWebview(page, { state: { legendOpen: false } });
    await expect(page.locator('[data-chrome="legend"]')).toBeHidden();
    const state = () => page.evaluate(() => window.__modelerShellVsCodeStub!.state());
    expect(await state()).toEqual({ modelerShell: { legendOpen: false } });

    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitemcheckbox", { name: "Legend" }).click();
    await expect(page.locator('[data-chrome="legend"]')).toBeVisible();
    expect(await state()).toMatchObject({ modelerShell: { legendOpen: true } });
  });

  test("the legend starts closed in any panel, and a stored state still wins", async ({ page }) => {
    const legend = page.locator('[data-chrome="legend"]');
    for (const size of [{ width: 390, height: 844 }, WIDE]) {
      await openWebview(page, { size });
      await expect(legend).toBeHidden();

      await openWebview(page, { size, state: { modelerShell: { legendOpen: true } } });
      await expect(legend).toBeVisible();
    }
  });

  test("the menu and the Command Palette run the same exports", async ({ page }) => {
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').click();
    await page.getByRole("menuitem", { name: "Export as SVG" }).click();
    const svg = await waitForPosted(page, "export");
    expect(svg).toMatchObject({ format: "svg" });
    expect(String(svg.data)).toContain("data-tt-document=");

    await postFromHost(page, { type: "command", name: "exportPng" });
    await page.waitForFunction(() =>
      window.__modelerShellVsCodeStub!.posted.some(
        (message) => (message as { format?: string }).format === "png",
      ),
    );

    const zoom = async () => parseInt((await zoomReadout(page)) ?? "", 10);
    const fitted = await zoom();
    await page.locator('[data-zoom="in"]').click();
    await expect.poll(zoom).toBeGreaterThan(fitted);
    const zoomedIn = await zoom();
    await postFromHost(page, { type: "command", name: "fitView" });
    // with the legend closed by default the fit can land on 100 %, so compare with the zoomed-in view
    await expect.poll(zoom).toBeLessThan(zoomedIn);
  });

  test("the SVG export is transparent and the PNG export fills the guide's background", async ({
    page,
  }) => {
    await openWebview(page);
    await postFromHost(page, { type: "command", name: "exportSvg" });
    const svg = await waitForPosted(page, "export");
    expect(svg).toMatchObject({ format: "svg" });
    expect(String(svg.data)).not.toContain("tt-export-paper");
    expect(await svgPixel(page, String(svg.data))).toBe(TRANSPARENT);

    await postFromHost(page, { type: "command", name: "exportPng" });
    await page.waitForFunction(() =>
      window.__modelerShellVsCodeStub!.posted.some(
        (message) => (message as { format?: string }).format === "png",
      ),
    );
    const png = (await postedMessages(page)).find((message) => message.format === "png")!;
    expect(png.fontFallback).toBeUndefined();
    expect(await pngPixel(page, String(png.data))).toBe(PNG_BACKGROUND);
  });

  test("a PNG save gets the rendered PNG with the document inside", async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: "requestPng", id: 3, includeDraft: true });
    const response = await waitForPosted(page, "pngResponse");
    expect(response).toMatchObject({ id: 3 });
    expect(String(response.data).startsWith("iVBORw0KGgo")).toBe(true);
  });

  test("a PNG without Geist is still posted, flagged so the host warns, except as a backup", async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => {
      const serialize = XMLSerializer.prototype.serializeToString;
      XMLSerializer.prototype.serializeToString = function (node: Node) {
        if (node instanceof Document) throw new Error("Geist cannot be embedded, on purpose.");
        return serialize.call(this, node);
      };
    });

    await postFromHost(page, { type: "command", name: "exportPng" });
    await page.waitForFunction(() =>
      window.__modelerShellVsCodeStub!.posted.some(
        (message) => (message as { format?: string }).format === "png",
      ),
    );
    const exported = (await postedMessages(page)).find((message) => message.format === "png")!;
    expect(exported.fontFallback).toBe(true);
    expect(await pngPixel(page, String(exported.data))).toBe(PNG_BACKGROUND);

    await postFromHost(page, { type: "requestPng", id: 4, includeDraft: true });
    await postFromHost(page, { type: "requestPng", id: 5, includeDraft: false });
    await expect
      .poll(async () => (await postedMessages(page)).filter((m) => m.type === "pngResponse").length)
      .toBe(2);
    const responses = (await postedMessages(page)).filter((m) => m.type === "pngResponse");
    expect(responses.find((response) => response.id === 4)).toMatchObject({ fontFallback: true });
    expect(responses.find((response) => response.id === 5)?.fontFallback).toBeUndefined();
    expect(responses.every((response) => response.error === undefined)).toBe(true);
  });

  test("a PNG the browser cannot draw is reported in the app's own words", async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => callback(null);
    });

    await postFromHost(page, { type: "command", name: "exportPng" });
    const failed = await waitForPosted(page, "error");
    expect(failed.message).toBe("Couldn't export the PNG. Try again, or export as SVG.");

    await postFromHost(page, { type: "requestPng", id: 6, includeDraft: true });
    const response = await waitForPosted(page, "pngResponse");
    expect(response).toMatchObject({
      id: 6,
      error: "Couldn't render the PNG. Try saving again.",
    });
    expect(response.data).toBeUndefined();
  });

  test("an SVG that cannot be created is reported in the app's own words", async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => {
      (window.modeler!.diagram as { saveSVG: () => unknown }).saveSVG = () => {
        throw new Error("the diagram could not be drawn, on purpose");
      };
    });

    await postFromHost(page, { type: "command", name: "exportSvg" });
    const failed = await waitForPosted(page, "error");
    expect(failed.message).toBe("Couldn't export the SVG. Try again, or export as PNG.");
  });

  test("Keyboard shortcuts… opens a modal dialog that hands the focus back", async ({ page }) => {
    await openWebview(page);
    await expect(
      page
        .getByRole("toolbar", { name: "Tools" })
        .getByRole("button", { name: "Lasso", exact: true }),
    ).toHaveCount(1);
    const trigger = page.locator('[data-chrome="menu"]');
    await trigger.click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts…" }).click();

    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveClass(/\bcd-shell-dialog\b/);
    await expect(page.locator("dialog.tt-dialog")).toHaveCount(0);
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByRole("heading", { level: 3 })).toHaveText(["View", "Edit", "Tools"]);
    // The shell's own zoom rows stand for the renderer's: each action once.
    await expect(dialog.getByRole("table", { name: "View" }).getByRole("row")).toHaveCount(4);
    // Lasso, the guide's shared term, as in the palette.
    await expect(dialog.getByRole("table", { name: "Tools" })).toContainText("Lasso by dragging");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts…" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the host's problems show in the pill, which opens the Problems view", async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: "problems", count: 3, errors: 1 });
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveAccessibleName("3 problems, 1 error");
    await pill.click();
    await waitForPosted(page, "showProblems");
  });

  test("a palette entry triggered by the keyboard creates a named team in view", async ({
    page,
  }) => {
    await openWebview(page, { doc: "empty" });
    await page.locator('.djs-palette [data-action="team.platform"]').focus();
    await page.keyboard.press("Enter");

    const editor = page.locator("textarea.tt-label-editor");
    await expect(editor).toBeFocused();
    await editor.fill("Data Platform");
    await editor.press("Enter");
    expect((await exportedDocument(page)).nodes.map((node) => node.label)).toEqual([
      "Data Platform",
    ]);
    await expect
      .poll(async () =>
        String(
          (await postedMessages(page)).filter((message) => message.type === "edit").at(-1)?.text,
        ),
      )
      .toContain('"label": "Data Platform"');
  });
});
