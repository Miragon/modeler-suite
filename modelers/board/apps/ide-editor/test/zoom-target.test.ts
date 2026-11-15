import { describe, expect, it } from "vitest";
import { fitViewbox, ZOOM_MAX, ZOOM_MIN } from "@miragon/modeler-shell/core";
import {
  BOARD_MIN_ZOOM,
  boardZoomTarget,
  fittedView,
  stepOnRaster,
  viewOf,
  zoomedAbout,
  type BoardView,
  type ViewedBoard,
} from "../src/zoom-target.js";

const SIZE = { width: 1280, height: 800 };
/** the shell's insets in the IDE column with nothing open */
const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };
const percent = (zoom: number): number => Math.round(zoom * 100);

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A board as far as the view code calls it, holding its zoom in the board's range. */
function fakeBoard(start: BoardView, content?: Bounds) {
  let view = start;
  let bounds = content;
  const sets: BoardView[] = [];
  const board: ViewedBoard = {
    getViewState: () => ({ ...view }),
    setViewState(state) {
      const next = state as BoardView;
      view = { ...next, zoom: Math.min(4, Math.max(BOARD_MIN_ZOOM, next.zoom)) };
      sets.push(view);
    },
    contentBounds: () => bounds,
  };
  return {
    board,
    sets,
    view: () => view,
    setContent: (next: Bounds | undefined) => void (bounds = next),
  };
}

function targetOn(fake: ReturnType<typeof fakeBoard>, size = SIZE) {
  const viewListeners = new Set<() => void>();
  const contentListeners = new Set<() => void>();
  const focused: Array<FocusOptions | undefined> = [];
  const pane = { focus: (options?: FocusOptions) => void focused.push(options) };
  const target = boardZoomTarget({
    modeler: fake.board,
    slot: {
      clientWidth: size.width,
      clientHeight: size.height,
      querySelector: ((selector: string) =>
        selector === ".react-flow__pane" ? pane : null) as HTMLElement["querySelector"],
    },
    insets: () => INSETS,
    onView(listener) {
      viewListeners.add(listener);
      return () => void viewListeners.delete(listener);
    },
    onContent(listener) {
      contentListeners.add(listener);
      return () => void contentListeners.delete(listener);
    },
  });
  return { target, viewListeners, contentListeners, focused };
}

/** the board point that a view shows at a point of the box */
const shownAt = (view: BoardView, x: number, y: number): { x: number; y: number } => ({
  x: (x - view.x) / view.zoom,
  y: (y - view.y) / view.zoom,
});

describe("the shell's zoom raster", () => {
  it("steps from 100 % to 135 % and back", () => {
    expect(percent(stepOnRaster(1, 1))).toBe(135);
    expect(stepOnRaster(stepOnRaster(1, 1), -1)).toBeCloseTo(1, 12);
  });

  it("is laid through 100 % and ends at the shell's limits", () => {
    const up: number[] = [];
    for (let zoom = ZOOM_MIN; up.length < 20; zoom = stepOnRaster(zoom, 1)) {
      up.push(percent(zoom));
      if (zoom === ZOOM_MAX) break;
    }
    expect(up).toEqual([20, 30, 41, 55, 74, 100, 135, 182, 246, 331, 400]);
    expect(stepOnRaster(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepOnRaster(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it("takes a zoom between two steps to the step beside the nearest one", () => {
    // what a fit or a wheel left: 99 % counts as 100 %, 120 % as 135 %
    expect(percent(stepOnRaster(0.99, 1))).toBe(135);
    expect(percent(stepOnRaster(0.99, -1))).toBe(74);
    expect(percent(stepOnRaster(1.2, 1))).toBe(182);
    expect(percent(stepOnRaster(1.2, -1))).toBe(100);
  });
});

describe("the fit", () => {
  const CONTENT = { x: 0, y: 0, width: 1200, height: 540 };

  it("centres the content in the box minus the insets, at most at 100 %", () => {
    // 1232 x 648 px are free: the content fits at 100 % and stands in their middle
    expect(fittedView(CONTENT, SIZE, INSETS)).toEqual({ x: 40, y: 142, zoom: 1 });
  });

  it("scales content that is larger than the free box down to it", () => {
    const fitted = fittedView({ x: -100, y: 50, width: 2464, height: 648 }, SIZE, INSETS);
    expect(fitted?.zoom).toBeCloseTo(0.5, 12);
    if (!fitted) throw new Error("nothing was fitted");
    // the content's middle is shown in the middle of the free box
    expect(shownAt(fitted, 24 + 1232 / 2, 88 + 648 / 2)).toEqual({ x: 1132, y: 374 });
  });

  it("is the view of the shell's own fit, which every other modeler gets", () => {
    const bounds = { x: 310, y: -220, width: 3100, height: 900 };
    const box = fitViewbox(bounds, SIZE, INSETS);
    const fitted = fittedView(bounds, SIZE, INSETS);
    if (!box || !fitted) throw new Error("nothing was fitted");
    expect(fitted.zoom).toBe(box.scale);
    expect(fitted.x).toBeCloseTo(-box.x * box.scale, 9);
    expect(fitted.y).toBeCloseTo(-box.y * box.scale, 9);
  });

  it("holds content too large for the board's smallest zoom at that zoom, still centred", () => {
    const bounds = { x: 0, y: 0, width: 100_000, height: 1000 };
    const fitted = fittedView(bounds, SIZE, INSETS);
    if (!fitted) throw new Error("nothing was fitted");
    expect(fitted.zoom).toBe(BOARD_MIN_ZOOM);
    expect(shownAt(fitted, 24 + 1232 / 2, 88 + 648 / 2).x).toBeCloseTo(50_000, 6);
  });

  it("is undefined for an empty board and for a box without a size", () => {
    expect(fittedView(undefined, SIZE, INSETS)).toBeUndefined();
    expect(fittedView({ x: 5, y: 5, width: 0, height: 0 }, SIZE, INSETS)).toBeUndefined();
    expect(fittedView(CONTENT, { width: 0, height: 0 }, INSETS)).toBeUndefined();
  });
});

describe("the board as the shell's zoom target", () => {
  const START = { x: 48, y: 176.6, zoom: 0.9866666666666667 };
  const CONTENT = { x: 0, y: 0, width: 1200, height: 540 };

  it("reads the zoom rounded to three decimals", () => {
    const { target } = targetOn(fakeBoard(START, CONTENT));
    expect(target.zoom()).toBe(0.987);
  });

  it("steps on the raster around the middle of the box", () => {
    const fake = fakeBoard(START, CONTENT);
    const { target } = targetOn(fake);
    const middleBefore = shownAt(fake.view(), 640, 400);
    target.stepZoom(1);
    expect(percent(fake.view().zoom)).toBe(135);
    const middleAfter = shownAt(fake.view(), 640, 400);
    expect(middleAfter.x).toBeCloseTo(middleBefore.x, 9);
    expect(middleAfter.y).toBeCloseTo(middleBefore.y, 9);
    target.stepZoom(-1);
    expect(fake.view().zoom).toBeCloseTo(1, 12);
    expect(fake.sets).toHaveLength(2);
  });

  it("never zooms in by a step out below the shell's range, nor past its end", () => {
    const low = fakeBoard({ x: 0, y: 0, zoom: 0.12 }, CONTENT);
    targetOn(low).target.stepZoom(-1);
    expect(low.sets).toEqual([]);
    const high = fakeBoard({ x: 0, y: 0, zoom: 4 }, CONTENT);
    targetOn(high).target.stepZoom(1);
    expect(high.sets).toEqual([]);
  });

  it("zooms to 100 % around the middle of the box", () => {
    const fake = fakeBoard({ x: -169.5, y: 94.5, zoom: 1.35 }, CONTENT);
    const middleBefore = shownAt(fake.view(), 640, 400);
    targetOn(fake).target.zoomToActual();
    expect(fake.view().zoom).toBe(1);
    expect(shownAt(fake.view(), 640, 400).x).toBeCloseTo(middleBefore.x, 9);
  });

  it("fits by the shell's rule, and has nothing to fit on an empty board", () => {
    const fake = fakeBoard(START, CONTENT);
    const { target } = targetOn(fake);
    expect(target.canFit()).toBe(true);
    target.fit();
    expect(fake.view()).toEqual({ x: 40, y: 142, zoom: 1 });

    fake.setContent(undefined);
    expect(target.canFit()).toBe(false);
    target.fit();
    expect(fake.sets).toHaveLength(1);
  });

  it("tells its listeners of its own steps, of the board's view and of the content", () => {
    const fake = fakeBoard(START, CONTENT);
    const { target, viewListeners, contentListeners } = targetOn(fake);
    let told = 0;
    const stop = target.onChange(() => void told++);
    expect([viewListeners.size, contentListeners.size]).toEqual([1, 1]);

    target.stepZoom(1);
    expect(told).toBe(1);
    for (const listener of viewListeners) listener();
    expect(told).toBe(2);
    for (const listener of contentListeners) listener();
    expect(told).toBe(3);

    // a second listener shares the two subscriptions, and the last one to go ends them
    const stopSecond = target.onChange(() => undefined);
    expect([viewListeners.size, contentListeners.size]).toEqual([1, 1]);
    stop();
    expect([viewListeners.size, contentListeners.size]).toEqual([1, 1]);
    stopSecond();
    expect([viewListeners.size, contentListeners.size]).toEqual([0, 0]);
    target.zoomToActual();
    expect(told).toBe(3);
  });

  it("hands the focus to the board's pane without scrolling the page", () => {
    const { target, focused } = targetOn(fakeBoard(START, CONTENT));
    target.focus?.();
    expect(focused).toEqual([{ preventScroll: true }]);
  });
});

describe("a board's view state", () => {
  it("is read as three numbers, and as the origin at 100 % where the board has none", () => {
    expect(viewOf({ getViewState: () => ({ x: 3, y: -4, zoom: 0.5, extra: true }) })).toEqual({
      x: 3,
      y: -4,
      zoom: 0.5,
    });
    for (const none of [undefined, null, "view", { x: 1, y: 2 }, { x: 1, y: 2, zoom: 0 }]) {
      expect(viewOf({ getViewState: () => none })).toEqual({ x: 0, y: 0, zoom: 1 });
    }
  });

  it("keeps the point in the middle of the box through a change of zoom", () => {
    const view = { x: 100, y: -50, zoom: 0.5 };
    const zoomed = zoomedAbout(view, 2, SIZE);
    expect(zoomed.zoom).toBe(2);
    expect(shownAt(zoomed, 640, 400)).toEqual(shownAt(view, 640, 400));
  });
});
