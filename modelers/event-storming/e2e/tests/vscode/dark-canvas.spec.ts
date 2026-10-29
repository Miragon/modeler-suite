import { expect, test, type Page } from "@playwright/test";
import { openWebview, postFromHost, postedMessages } from "./support/webview.js";

/**
 * The webview's exports from a dark canvas (#215, guide §10.7 and §13.4). The board reports light
 * only until the modelers switch together (#219), so the theme bridge keeps `<html>` light; the
 * test puts it into dark itself. The canvas turns dark, and every export the webview posts to the
 * extension host stays light, byte for byte the light one.
 */

/** Arrows with an annotation, a drawing in the default ink and one in a colour weak on dark. */
const BOARD = [
  "title Night shift",
  "command Place Order [240, 300]",
  "event Order Placed [620, 300]",
  "readmodel Order Status [620, 120]",
  "line [[100,500],[300,560],[260,620]]",
  "line [[400,500],[600,560]] (dashed) (color #4A4A4A)",
  "Place Order -> Order Placed",
  "Order Placed -> Order Status; async",
].join("\n");

const EXPORT_COMMANDS = ["exportSvg", "exportPng", "exportPngTransparent"] as const;

/** Runs each export command in turn and returns what the webview posted, format and data. */
async function exportAll(page: Page): Promise<string[][]> {
  const exported = async () =>
    (await postedMessages(page)).filter((message) => message.type === "export");
  const before = (await exported()).length;
  for (const [index, name] of EXPORT_COMMANDS.entries()) {
    await postFromHost(page, { type: "command", name });
    await expect.poll(async () => (await exported()).length).toBe(before + index + 1);
  }
  return (await exported())
    .slice(before)
    .map((message) => [String(message.format), String(message.data)]);
}

function annotationFill(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector(".event-storming-container .djs-connection .djs-visual > text")!,
      ).fill,
  );
}

test("an SVG and a PNG exported from a dark canvas are byte-identical to the light ones", async ({
  page,
}) => {
  await openWebview(page, { text: BOARD });
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-cd-theme", "light");
  const lightAnnotation = await annotationFill(page);
  const light = await exportAll(page);
  expect(light.map(([format]) => format)).toEqual(["svg", "png", "png-transparent"]);
  expect(light[0]![1]).not.toMatch(/cd-c-|event-storming-arrowhead/);

  await page.evaluate(() => document.documentElement.setAttribute("data-cd-theme", "dark"));
  expect(await annotationFill(page)).not.toBe(lightAnnotation);
  const dark = await exportAll(page);

  expect(dark).toEqual(light);
});
