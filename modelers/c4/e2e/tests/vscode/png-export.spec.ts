import { expect, test, type Page } from "@playwright/test";
import { vsCodeStubSearch } from "@miragon/modeler-shell/testing";
import { EMBEDDED_GEIST, recordSvgImages, recordedSvgImages } from "../support/svg-images.js";

/**
 * The webview cannot fetch its font files, so "Export as PNG" hands the shell's `svgToPng` Geist as
 * data: URLs. The extension host gets the PNG in Base64, and `fontFallback` only when it could not
 * be embedded, so that the host can say so in a warning notification. When the shell rejects, the
 * host gets the app's own sentence to show, never the shell's developer text.
 */
const BASE64_PNG_SIGNATURE = "iVBORw0KGgo";

async function openWebview(page: Page): Promise<void> {
  await page.goto(`/webview-test.html?${vsCodeStubSearch({ theme: "light" })}`);
  await page.waitForFunction(() => window.webviewReady === true);
}

async function chooseExportAsPng(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Export as PNG", exact: true }).click();
}

function postedOfType(page: Page, type: string): Promise<Record<string, unknown>> {
  return page
    .waitForFunction(
      (wanted) =>
        (window.__modelerShellVsCodeStub?.posted ?? []).find(
          (message) => (message as { type?: unknown }).type === wanted,
        ),
      type,
    )
    .then((handle) => handle.jsonValue() as Promise<Record<string, unknown>>);
}

async function exportAsPng(page: Page): Promise<Record<string, unknown>> {
  await openWebview(page);
  await chooseExportAsPng(page);
  const exported = await postedOfType(page, "export");
  expect(exported).toMatchObject({ type: "export", format: "png" });
  expect(String(exported.data).startsWith(BASE64_PNG_SIGNATURE)).toBe(true);
  return exported;
}

test("VS Code webview: Export as PNG posts a picture with Geist embedded", async ({ page }) => {
  await recordSvgImages(page);
  const exported = await exportAsPng(page);
  expect(exported).not.toHaveProperty("fontFallback");
  const [svg] = await recordedSvgImages(page);
  expect(svg).toContain(EMBEDDED_GEIST.family);
  expect(svg).toMatch(EMBEDDED_GEIST.file);
});

test("VS Code webview: Export as PNG tells the host when Geist cannot be embedded", async ({
  page,
}) => {
  // The faces are data: URLs, so no network failure can stop them. Embedding ends in serialising
  // the SVG with the faces in it: that is the step which throws here.
  await page.addInitScript(() => {
    const serialize = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (node: Node): string {
      const styles = node instanceof Document ? [...node.querySelectorAll("style")] : [];
      if (styles.some((style) => style.textContent?.includes("@font-face"))) {
        throw new Error("the font faces cannot be embedded");
      }
      return serialize.call(this, node);
    };
  });
  const exported = await exportAsPng(page);
  expect(exported).toMatchObject({ fontFallback: true });
});

test("VS Code webview: a picture the browser cannot draw reaches the host as the app's own text", async ({
  page,
}) => {
  await openWebview(page);
  await page.evaluate(() => {
    window.modeler!.diagram.saveSVG = () => ({ svg: "this is no SVG" });
  });
  await chooseExportAsPng(page);
  expect(await postedOfType(page, "error")).toEqual({
    type: "error",
    message: "Couldn't export the diagram as PNG. Try again, or export it as SVG.",
  });
  const posted = await page.evaluate(() => window.__modelerShellVsCodeStub?.posted ?? []);
  expect(posted.filter((message) => (message as { type?: unknown }).type === "export")).toEqual([]);
});
