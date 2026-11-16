import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_VIEW_KEY,
  IN_SIGHT_PX,
  keepView,
  keptView,
  keptViewFor,
  showsContent,
  VIEW_REST_MS,
} from "../src/kept-view.js";
import type { BoardView } from "../src/zoom-target.js";

const SIZE = { width: 1280, height: 800 };
const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const CONTENT = { x: 0, y: 0, width: 1200, height: 540 };

describe("what a host kept, read as a view", () => {
  it("is the three numbers of a view, and nothing a host kept beside them", () => {
    expect(keptView({ x: -12.5, y: 40, zoom: 0.74 })).toEqual({ x: -12.5, y: 40, zoom: 0.74 });
    expect(keptView({ x: 1, y: 2, zoom: 1, of: "another board", userMoved: true })).toEqual({
      x: 1,
      y: 2,
      zoom: 1,
    });
  });

  it("holds the ends of the board's zoom range, and nothing beyond them", () => {
    expect(keptView({ x: 0, y: 0, zoom: 0.1 })).toEqual({ x: 0, y: 0, zoom: 0.1 });
    expect(keptView({ x: 0, y: 0, zoom: 4 })).toEqual({ x: 0, y: 0, zoom: 4 });
    expect(keptView({ x: 0, y: 0, zoom: 0.099 })).toBeUndefined();
    expect(keptView({ x: 0, y: 0, zoom: 4.001 })).toBeUndefined();
    expect(keptView({ x: 0, y: 0, zoom: -1 })).toBeUndefined();
  });

  it("is nothing for an empty place and for a value of another shape", () => {
    for (const value of [
      undefined,
      null,
      "",
      0,
      true,
      [],
      {},
      { x: 0, y: 0 },
      { x: "0", y: 0, zoom: 1 },
      { x: 0, y: null, zoom: 1 },
      { x: 0, y: 0, zoom: Number.NaN },
      { x: Number.NEGATIVE_INFINITY, y: 0, zoom: 1 },
      // the shell's own kept view of a diagram-js canvas
      { viewbox: { x: 0, y: 0, width: 800, height: 600 }, userMoved: true },
    ]) {
      expect(keptView(value), JSON.stringify(value)).toBeUndefined();
    }
  });
});

describe("whether a view shows the content", () => {
  const at = (x: number, y: number, zoom = 1): BoardView => ({ x, y, zoom });

  it("does while enough of the content's box is in the free part of the slot, each way", () => {
    expect(showsContent(at(40, 142), CONTENT, SIZE, INSETS)).toBe(true);
    // the right end: exactly the least from the left inset on
    expect(showsContent(at(24 + IN_SIGHT_PX - 1200, 142), CONTENT, SIZE, INSETS)).toBe(true);
    expect(showsContent(at(24 + IN_SIGHT_PX - 1201, 142), CONTENT, SIZE, INSETS)).toBe(false);
    // the left end, from the right inset back
    expect(showsContent(at(1256 - IN_SIGHT_PX, 142), CONTENT, SIZE, INSETS)).toBe(true);
    expect(showsContent(at(1257 - IN_SIGHT_PX, 142), CONTENT, SIZE, INSETS)).toBe(false);
    // the bottom end under the top inset, and the top end over the bottom inset
    expect(showsContent(at(40, 88 + IN_SIGHT_PX - 540), CONTENT, SIZE, INSETS)).toBe(true);
    expect(showsContent(at(40, 87 + IN_SIGHT_PX - 540), CONTENT, SIZE, INSETS)).toBe(false);
    expect(showsContent(at(40, 736 - IN_SIGHT_PX), CONTENT, SIZE, INSETS)).toBe(true);
    expect(showsContent(at(40, 737 - IN_SIGHT_PX), CONTENT, SIZE, INSETS)).toBe(false);
  });

  it("counts what the chrome covers as out of sight", () => {
    // 60 px of the content in the slot's top band, all of them under the shell's top inset
    const underTheChrome = at(40, 60 - 540);
    expect(showsContent(underTheChrome, CONTENT, SIZE, NO_INSETS)).toBe(true);
    expect(showsContent(underTheChrome, CONTENT, SIZE, INSETS)).toBe(false);
  });

  it("reads the content at the view's zoom", () => {
    // at 400 % the content is 4800 px wide and starts at 2000 px
    const away = { x: 500, y: 0, width: 1200, height: 540 };
    expect(showsContent(at(0, 142, 1), away, SIZE, INSETS)).toBe(true);
    expect(showsContent(at(0, 142, 4), away, SIZE, INSETS)).toBe(false);
    expect(showsContent(at(-1800, 142, 4), away, SIZE, INSETS)).toBe(true);
  });

  it("asks for all of a content that is smaller on screen than the least", () => {
    // one note at 10 %: 32 x 18 px on screen
    const note = { x: 0, y: 0, width: 320, height: 180 };
    expect(showsContent(at(600, 400, 0.1), note, SIZE, INSETS)).toBe(true);
    // 30 of its 32 px in the free part
    expect(showsContent(at(22, 400, 0.1), note, SIZE, INSETS)).toBe(false);
    expect(showsContent(at(24, 400, 0.1), note, SIZE, INSETS)).toBe(true);
  });

  it("shows nothing in a slot the insets leave no room in", () => {
    expect(showsContent(at(0, 0), CONTENT, { width: 40, height: 100 }, INSETS)).toBe(false);
  });
});

describe("the kept view for a board", () => {
  it("is the kept view where it is one and shows the content, and nothing otherwise", () => {
    const kept = { x: 40, y: 142, zoom: 1 };
    expect(keptViewFor(kept, [CONTENT], SIZE, INSETS)).toEqual(kept);
    expect(keptViewFor({ ...kept, more: 1 }, [CONTENT], SIZE, INSETS)).toEqual(kept);
    expect(keptViewFor(undefined, [CONTENT], SIZE, INSETS)).toBeUndefined();
    expect(keptViewFor({ x: 9000, y: 142, zoom: 1 }, [CONTENT], SIZE, INSETS)).toBeUndefined();
    // an empty board has no content a view could show
    expect(keptViewFor(kept, [], SIZE, INSETS)).toBeUndefined();
  });

  it("asks each node by its own box: a view between nodes that lie far apart shows nothing", () => {
    // two groups of nodes 60 000 px apart, as after a change of the file from outside
    const west = { x: -30_000, y: 0, width: 520, height: 400 };
    const east = { x: 30_000, y: 0, width: 520, height: 400 };
    const between = { x: 40, y: 142, zoom: 1 };
    // the box around both holds the view, and neither node is in it
    const around = { x: -30_000, y: 0, width: 60_520, height: 400 };
    expect(showsContent(between, around, SIZE, INSETS)).toBe(true);
    expect(keptViewFor(between, [west, east], SIZE, INSETS)).toBeUndefined();
    // one node in sight is enough, whichever it is
    const onTheEast = { x: 100 - 30_000, y: 142, zoom: 1 };
    expect(keptViewFor(onTheEast, [west, east], SIZE, INSETS)).toEqual(onTheEast);
    const onTheWest = { x: 100 + 30_000, y: 142, zoom: 1 };
    expect(keptViewFor(onTheWest, [west, east], SIZE, INSETS)).toEqual(onTheWest);
  });
});

describe("keeping the view", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  function fake(start: BoardView = { x: 40, y: 142, zoom: 1 }) {
    let view = start;
    const writes: Array<[string, unknown]> = [];
    const listeners = new Set<() => void>();
    let subscriptions = 0;
    const keeper = keepView({
      modeler: { getViewState: () => ({ ...view }) },
      place: { write: (key, value) => void writes.push([key, value]) },
      onView(listener) {
        subscriptions++;
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    });
    return {
      keeper,
      writes,
      listening: () => listeners.size,
      subscriptions: () => subscriptions,
      /** the view changed, and whoever watches it tells */
      moveTo(next: BoardView) {
        view = next;
        for (const listener of [...listeners]) listener();
      },
      /** the watch tells although the view is the one it was */
      tell() {
        for (const listener of [...listeners]) listener();
      },
    };
  }

  it("writes nothing before the first view stands, whatever the board does until then", () => {
    const board = fake();
    expect(board.listening()).toBe(0);
    board.moveTo({ x: 0, y: 0, zoom: 2 });
    vi.advanceTimersByTime(10 * VIEW_REST_MS);
    expect(board.writes).toEqual([]);
  });

  it("does not write the first view, which is the app's own, and writes nothing while it stays", () => {
    const board = fake();
    board.keeper.start();
    expect(board.listening()).toBe(1);
    vi.advanceTimersByTime(10 * VIEW_REST_MS);
    board.tell();
    board.tell();
    vi.advanceTimersByTime(10 * VIEW_REST_MS);
    expect(board.writes).toEqual([]);
  });

  it("writes a view once it rested, under the board's key: one write for a whole pan", () => {
    const board = fake();
    board.keeper.start();
    // a pan: a new view with every frame, for longer than the rest
    for (let frame = 1; frame <= 60; frame++) {
      board.moveTo({ x: 40 - frame * 5, y: 142, zoom: 1 });
      vi.advanceTimersByTime(16);
    }
    expect(board.writes).toEqual([]);
    vi.advanceTimersByTime(VIEW_REST_MS - 17);
    expect(board.writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(board.writes).toEqual([[BOARD_VIEW_KEY, { x: -260, y: 142, zoom: 1 }]]);
    expect(BOARD_VIEW_KEY).toBe("boardView");
    expect(VIEW_REST_MS).toBe(250);

    vi.advanceTimersByTime(10 * VIEW_REST_MS);
    expect(board.writes).toHaveLength(1);
  });

  it("writes nothing for a view that came back to the one kept last", () => {
    const board = fake();
    board.keeper.start();
    board.moveTo({ x: 0, y: 0, zoom: 2 });
    vi.advanceTimersByTime(VIEW_REST_MS);
    expect(board.writes).toHaveLength(1);

    // away and back within one rest
    board.moveTo({ x: 5, y: 5, zoom: 2 });
    vi.advanceTimersByTime(100);
    board.moveTo({ x: 0, y: 0, zoom: 2 });
    vi.advanceTimersByTime(VIEW_REST_MS);
    expect(board.writes).toHaveLength(1);

    // back to the first view, which was never kept: that is a change of what is kept
    board.moveTo({ x: 40, y: 142, zoom: 1 });
    vi.advanceTimersByTime(VIEW_REST_MS);
    expect(board.writes.map(([, view]) => view)).toEqual([
      { x: 0, y: 0, zoom: 2 },
      { x: 40, y: 142, zoom: 1 },
    ]);
  });

  it("starts once: a second start neither listens twice nor forgets what was kept", () => {
    const board = fake();
    board.keeper.start();
    board.moveTo({ x: 0, y: 0, zoom: 2 });
    board.keeper.start();
    expect(board.subscriptions()).toBe(1);
    vi.advanceTimersByTime(VIEW_REST_MS);
    expect(board.writes).toHaveLength(1);
  });

  it("writes a view that still rests when it is stopped, and nothing after", () => {
    const board = fake();
    board.keeper.start();
    board.moveTo({ x: 7, y: 8, zoom: 0.5 });
    vi.advanceTimersByTime(100);
    board.keeper.stop();
    expect(board.writes).toEqual([[BOARD_VIEW_KEY, { x: 7, y: 8, zoom: 0.5 }]]);
    expect(board.listening()).toBe(0);

    vi.advanceTimersByTime(10 * VIEW_REST_MS);
    board.keeper.stop();
    expect(board.writes).toHaveLength(1);
  });

  it("writes the view it is stopped at even where the watch has not told of it yet", () => {
    let view: BoardView = { x: 40, y: 142, zoom: 1 };
    const writes: unknown[] = [];
    const keeper = keepView({
      modeler: { getViewState: () => view },
      place: { write: (_key, value) => void writes.push(value) },
      // a watch that looks once per frame, and the board goes before its next look
      onView: () => () => undefined,
    });
    keeper.start();
    view = { x: 1, y: 2, zoom: 3 };
    keeper.stop();
    expect(writes).toEqual([{ x: 1, y: 2, zoom: 3 }]);
  });

  it("writes nothing when it is stopped while nothing waits", () => {
    const board = fake();
    board.keeper.stop();
    board.keeper.start();
    board.keeper.stop();
    expect(board.writes).toEqual([]);
    expect(board.listening()).toBe(0);
  });
});
