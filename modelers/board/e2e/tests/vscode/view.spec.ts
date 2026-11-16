import { expect, test } from "@playwright/test";
import {
  appliedEdits,
  boardView,
  canvasText,
  EXAMPLE_BOARD,
  firstView,
  modelsReady,
  MODELS_READY_MS,
  openWebview,
  panePoint,
  problemsOf,
  reloadWebview,
  seedWebviewState,
  stateWrites,
} from "./support/webview.js";

/**
 * The board's view in the webview's state: VS Code keeps what a webview hands to `setState`
 * and gives it to the next page of the same editor. A reload of the test page is such a next
 * page; the page keeps the stub's state for its tab, since the stub keeps it for one page.
 */

test.describe.configure({ timeout: 2 * MODELS_READY_MS });

const readout = '.cd-shell [data-zoom="actual"]';

test("a reloaded webview comes back where the person left the board, and the state is written rarely", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const fitted = await firstView(page);
  // the example does not fit at 100 %
  expect(fitted.zoom).toBeLessThan(1);

  // a real wheel on the pane: a new view with every tick
  const ticks = 12;
  const pane = await panePoint(page);
  await page.mouse.move(pane.x, pane.y);
  for (let tick = 0; tick < ticks; tick++) await page.mouse.wheel(0, -60);
  await expect.poll(async () => (await boardView(page)).zoom).toBeGreaterThan(fitted.zoom);

  // kept once the view rested, under the board's key: two looks in a row find the same view,
  // and it is the one kept last (the last tick may still be on its way at the first look)
  let seen = "";
  await expect
    .poll(async () => {
      const [writes, view] = [await stateWrites(page), JSON.stringify(await boardView(page))];
      const rests = view === seen && JSON.stringify(writes.at(-1)?.boardView) === view;
      seen = view;
      return rests;
    })
    .toBe(true);
  const left = await boardView(page);
  const writes = await stateWrites(page);
  // far fewer writes than ticks, the fit itself is none of them, and none repeats the one before
  expect(writes.length).toBeLessThan(ticks / 2);
  expect(writes.map((state) => state.boardView)).not.toContainEqual(fitted);
  const views = writes.map((state) => JSON.stringify(state.boardView));
  expect(views.filter((view, index) => view === views[index - 1])).toEqual([]);

  await reloadWebview(page);
  await modelsReady(page);

  await expect.poll(() => boardView(page)).toEqual(left);
  await expect(page.locator(readout)).toHaveText(`${Math.round(left.zoom * 100)}%`);
  // coming back is no change of the view: nothing is written, and nothing of the board file
  expect(await stateWrites(page)).toEqual([]);
  expect(await canvasText(page)).toBe(EXAMPLE_BOARD);
  expect(await appliedEdits(page)).toEqual([]);

  // the next view the person makes is one write more
  await page.locator('.cd-shell [data-zoom="fit"]').click();
  await expect.poll(() => boardView(page)).toEqual(fitted);
  await expect.poll(async () => (await stateWrites(page)).length).toBe(1);
  expect((await stateWrites(page))[0]?.boardView).toEqual(fitted);
  expect(problems).toEqual([]);
});

test("a kept view that shows nothing of the board is left for the fit, and the other keys of the state stay", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const fitted = await firstView(page);
  // nothing moved the view: nothing was kept of it
  expect(await stateWrites(page)).toEqual([]);

  // a view far beside the board, and what the shell and another part keep in the same state
  const others = { modelerShell: { legendOpen: true }, somebodyElses: 1 };
  await seedWebviewState(page, { ...others, boardView: { x: 90_000, y: 0, zoom: 1 } });
  await reloadWebview(page);
  await modelsReady(page);

  await expect.poll(() => boardView(page)).toEqual(fitted);
  expect(await stateWrites(page)).toEqual([]);

  // a view of the person's own takes its place, beside the other keys
  await page.locator(readout).click();
  await expect.poll(async () => (await boardView(page)).zoom).toBe(1);
  await expect.poll(async () => (await stateWrites(page)).length).toBe(1);
  expect((await stateWrites(page))[0]).toEqual({ ...others, boardView: await boardView(page) });

  // and a state that is no object at all is nothing kept
  await seedWebviewState(page, "a view");
  await reloadWebview(page);
  await modelsReady(page);
  await expect.poll(() => boardView(page)).toEqual(fitted);
  expect(problems).toEqual([]);
});

test("a kept view inside the board's box that shows none of its nodes is left for the fit", async ({
  page,
}) => {
  const problems = problemsOf(page);
  await openWebview(page, { host: true });
  await modelsReady(page);
  const fitted = await firstView(page);

  // The example's second row has three models under four: at 200 % this view lies whole in the
  // corner the fourth would stand in, inside the box around the board and with no node in it.
  // That is what a kept view looks like after the file changed while its page was away.
  await seedWebviewState(page, { boardView: { x: -5440, y: -1380, zoom: 2 } });
  await reloadWebview(page);
  await modelsReady(page);

  await expect.poll(() => boardView(page)).toEqual(fitted);
  // a node is in sight, where the kept view would have shown an empty canvas
  await expect(page.locator(".react-flow__node").first()).toBeInViewport();
  expect(await stateWrites(page)).toEqual([]);
  expect(problems).toEqual([]);
});
