import { expect, test } from "@playwright/test";
import {
  appliedEdits,
  canvasText,
  centreAtRest,
  EXAMPLE_BOARD,
  EXAMPLE_MODELS,
  modelsReady,
  MODELS_READY_MS,
  openWebview,
  pickerModels,
  postedMessages,
  problemsOf,
} from "./support/webview.js";

/**
 * A node whose file no notation of the suite covers, as a board that comes from another tool
 * has them: a card that asks the extension to show the file in an editor of VS Code's own. The
 * page's files run through the extension's real plumbing; what VS Code then opens is stood in
 * for by a list the test page keeps.
 */

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

const PROCESS = "processes/order-to-cash.bpmn";
const PROCESS_NODE = "n_zz_process";
/** the node as a text editor beside the board writes it, on the line a board file has it on */
const NODE_LINE = `{"file":"${PROCESS}","height":320,"id":"${PROCESS_NODE}","kind":"node","type":"model","width":480,"x":0,"y":1300,"z":"l"}`;

test("a file no notation covers is a card: Open in its editor asks the extension to show it, and the page gets nothing of the file", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);

  // a file of the repository, and its node in the board file
  await page.evaluate(([path, text]) => window.vscodeHost?.backend.outside(path, text), [
    PROCESS,
    "<definitions/>\n",
  ] as const);
  await page.evaluate(
    (text) => window.vscodeHost?.host.replaceText(window.vscodeHost.document, text),
    `${EXAMPLE_BOARD}${NODE_LINE}\n`,
  );
  await expect.poll(() => canvasText(page)).toBe(`${EXAMPLE_BOARD}${NODE_LINE}\n`);
  await page.locator('.cd-shell [data-zoom="fit"]').click();

  const card = page.locator(`.react-flow__node[data-id="${PROCESS_NODE}"] .board-engine`);
  await expect(card).toHaveAttribute("data-embed-state", "card");
  await expect(card).toContainText("order-to-cash.bpmn");
  // no failure look, and the seven models beside it are as they were
  await expect(card).not.toHaveClass(/board-engine--failed/);
  await modelsReady(page);
  // the picker offers the seven notations' files and not this one
  expect(await pickerModels(page)).toEqual([...EXAMPLE_MODELS]);

  // a real click where the button stands, on a node that is a preview
  const open = card.locator("button", { hasText: "Open in its editor" });
  await expect(open).toBeVisible();
  const at = await centreAtRest(open);
  await page.mouse.click(at.x, at.y);

  await expect
    .poll(() => page.evaluate(() => [...(window.vscodeHost?.shown ?? [])]))
    .toEqual([PROCESS]);
  await expect(card).toContainText("Opened in its editor.");
  const posted = await postedMessages(page);
  expect(
    posted.filter((message) => message.type === "board.file.show").map(({ path }) => path),
  ).toEqual([PROCESS]);
  // the page asked for nothing else of that file: neither its text nor its bytes
  expect(
    posted.filter((message) => message.path === PROCESS && message.type !== "board.file.show"),
  ).toEqual([]);
  // and showing a file writes nothing into the board file
  expect(await appliedEdits(page)).toEqual([]);
  expect(problems).toEqual([]);
});
