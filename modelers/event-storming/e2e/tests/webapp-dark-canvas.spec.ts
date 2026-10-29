import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openExample, openMenu, settleForSnapshot, waitForViewer } from "./support/viewer.js";
import { readDownload } from "./support/png.js";

/**
 * The web app's exports from a dark canvas (#215, guide §10.7 and §13.4). The board reports light
 * only until the modelers switch together (#219), so the test puts the page into dark itself, as
 * the web app's head script will: the canvas turns dark, and every export stays light, byte for
 * byte the one the light page gives.
 */

const vendoredTokens = JSON.parse(
  readFileSync(
    new URL("../../packages/renderer/src/theme/cd-tokens.generated.json", import.meta.url),
    "utf8",
  ),
) as { hell: Record<string, string>; dunkel: Record<string, string> };

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

function rgb(hex: string | undefined): string {
  if (!hex) throw new Error("no such role in the vendored tokens");
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

async function exportAs(page: Page, id: string): Promise<Buffer> {
  const download = page.waitForEvent("download");
  await (await openMenu(page)).locator(`[data-menu-id="${id}"]`).click();
  return readDownload(await download);
}

async function exports(page: Page): Promise<Record<string, Buffer>> {
  return {
    svg: await exportAs(page, "export-svg"),
    png: await exportAs(page, "export-png"),
    transparent: await exportAs(page, "export-png-transparent"),
  };
}

/** What the canvas shows: its ground, the annotation and the default ink. */
function canvasColours(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector(".event-storming-container")!;
    const annotation = container.querySelector(".djs-connection .djs-visual > text")!;
    const ink = container.querySelector(".djs-shape .djs-visual > polyline.cd-c-stroke-text")!;
    return {
      ground: getComputedStyle(container).backgroundColor,
      annotation: getComputedStyle(annotation).fill,
      ink: getComputedStyle(ink).stroke,
    };
  });
}

test("an SVG and a PNG exported from a dark canvas are byte-identical to the light ones", async ({
  page,
}) => {
  await page.goto("/");
  await waitForViewer(page);
  await openExample(page);
  await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), BOARD);
  await settleForSnapshot(page);

  expect(await page.locator("html").getAttribute("data-cd-theme")).toBe("light");
  expect(await canvasColours(page)).toEqual({
    ground: rgb(vendoredTokens.hell["--cd-ui-grund"]),
    annotation: rgb(vendoredTokens.hell["--cd-ui-text-leise"]),
    ink: rgb(vendoredTokens.hell["--cd-ui-text"]),
  });
  const light = await exports(page);
  expect(light.svg!.toString("utf8")).not.toMatch(/cd-c-|event-storming-arrowhead/);

  await page.evaluate(() => document.documentElement.setAttribute("data-cd-theme", "dark"));
  expect(await canvasColours(page)).toEqual({
    ground: rgb(vendoredTokens.dunkel["--cd-ui-grund"]),
    annotation: rgb(vendoredTokens.dunkel["--cd-ui-text-leise"]),
    ink: rgb(vendoredTokens.dunkel["--cd-ui-text"]),
  });
  const dark = await exports(page);

  for (const kind of Object.keys(light)) {
    expect(dark[kind]!.equals(light[kind]!), kind).toBe(true);
  }
});
