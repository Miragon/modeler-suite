import { describe, expect, it } from "vitest";
import {
  createFirstFit,
  type FirstFitOptions,
  type NextFrame,
  type SizeWatch,
} from "../src/first-fit.js";
import type { BoardView, ViewedBoard } from "../src/zoom-target.js";

const INSETS = { top: 88, right: 24, bottom: 64, left: 24 };
const CONTENT = { x: 0, y: 0, width: 1200, height: 540 };
const FITTED = { x: 40, y: 142, zoom: 1 };

function fakeBoard(content: typeof CONTENT | "empty" = CONTENT) {
  const sets: BoardView[] = [];
  let bounds = content === "empty" ? undefined : content;
  const board: ViewedBoard = {
    getViewState: () => sets.at(-1) ?? { x: 0, y: 0, zoom: 1 },
    setViewState: (state) => void sets.push(state as BoardView),
    contentBounds: () => bounds,
  };
  return { board, sets, setContent: (next: typeof CONTENT | undefined) => void (bounds = next) };
}

/**
 * A slot whose size the test sets, the watch a ResizeObserver would be, and the page's
 * animation frames, which come only when the test says the page is painted.
 */
function fakeSlot(width: number, height: number) {
  const slot = { clientWidth: width, clientHeight: height };
  const watchers = new Set<() => void>();
  const frames = new Set<() => void>();
  let watches = 0;
  const watchSize: SizeWatch = (_element, onSize) => {
    watches++;
    watchers.add(onSize);
    return () => void watchers.delete(onSize);
  };
  const nextFrame: NextFrame = (run) => {
    frames.add(run);
    return () => void frames.delete(run);
  };
  return {
    slot: slot as typeof slot & Element,
    watchSize,
    nextFrame,
    watching: () => watchers.size,
    watches: () => watches,
    /** how many frames are asked for and have not come */
    awaited: () => frames.size,
    /** the page is painted: every frame that was asked for comes, once */
    paint() {
      const due = [...frames];
      frames.clear();
      for (const frame of due) frame();
    },
    resize(nextWidth: number, nextHeight: number) {
      slot.clientWidth = nextWidth;
      slot.clientHeight = nextHeight;
      for (const watcher of [...watchers]) watcher();
    },
  };
}

type Page = ReturnType<typeof fakeSlot>;
const firstFitOf = (
  fake: ReturnType<typeof fakeBoard>,
  page: Page,
  options: Pick<FirstFitOptions, "kept" | "shown" | "boxes"> = {},
) =>
  createFirstFit(fake.board, page.slot, () => INSETS, {
    ...options,
    watchSize: page.watchSize,
    nextFrame: page.nextFrame,
  });

describe("the first view of a board under the shell", () => {
  it("is fitted in the frame after the first accepted text, and never again", () => {
    const fake = fakeBoard();
    const page = fakeSlot(1280, 800);
    const firstFit = firstFitOf(fake, page);
    expect(fake.sets).toEqual([]);

    firstFit.imported();
    expect(fake.sets).toEqual([]);
    page.paint();
    expect(fake.sets).toEqual([FITTED]);
    expect(page.watches()).toBe(0);

    // an update, after the person moved the view: it is theirs
    fake.setContent({ x: 0, y: 0, width: 4000, height: 3000 });
    firstFit.imported();
    page.paint();
    page.resize(900, 600);
    expect(fake.sets).toEqual([FITTED]);
    expect(page.awaited()).toBe(0);
  });

  it("waits while the page is not painted, and fits the size it has when it is: a tab behind a text editor", () => {
    const fake = fakeBoard();
    // VS Code gives the webview of a covered tab a stand-in size, which is no size of zero
    const page = fakeSlot(300, 150);
    const firstFit = firstFitOf(fake, page);

    // the file is repaired in the editor that covers the board: its first valid text
    firstFit.imported();
    firstFit.imported();
    expect(fake.sets).toEqual([]);
    expect(page.awaited()).toBe(1);
    expect(page.watches()).toBe(0);

    // the tab is shown: the slot has its size, and then the frame comes
    page.resize(1280, 800);
    expect(fake.sets).toEqual([]);
    page.paint();
    expect(fake.sets).toEqual([FITTED]);
    expect(page.watches()).toBe(0);
  });

  it("waits for a slot without a size, fits once it has one and then stops watching", () => {
    const fake = fakeBoard();
    const page = fakeSlot(0, 0);
    const firstFit = firstFitOf(fake, page);

    firstFit.imported();
    page.paint();
    expect(fake.sets).toEqual([]);
    expect(page.watching()).toBe(1);

    // an update while the slot still has no size starts no second watch
    firstFit.imported();
    page.paint();
    expect(page.watches()).toBe(1);
    // a size of one side only is none
    page.resize(1280, 0);
    expect(fake.sets).toEqual([]);

    page.resize(1280, 800);
    expect(fake.sets).toEqual([FITTED]);
    expect(page.watching()).toBe(0);
    page.resize(640, 400);
    expect(fake.sets).toEqual([FITTED]);
  });

  it("fits what the board holds when the slot gets its size, not what it held at the import", () => {
    const fake = fakeBoard();
    const page = fakeSlot(0, 0);
    const firstFit = firstFitOf(fake, page);
    firstFit.imported();
    page.paint();
    fake.setContent({ x: 1000, y: 1000, width: 1200, height: 540 });
    page.resize(1280, 800);
    expect(fake.sets).toEqual([{ x: -960, y: -858, zoom: 1 }]);
  });

  it("leaves an empty board where it is, and does not fit what comes later", () => {
    const fake = fakeBoard("empty");
    const page = fakeSlot(1280, 800);
    const firstFit = firstFitOf(fake, page);
    firstFit.imported();
    page.paint();
    fake.setContent(CONTENT);
    firstFit.imported();
    page.paint();
    expect(fake.sets).toEqual([]);
    expect(page.watches()).toBe(0);
  });

  it("gives up a fit that still waits for the slot's size when it is stopped", () => {
    const fake = fakeBoard();
    const page = fakeSlot(0, 0);
    const firstFit = firstFitOf(fake, page);
    firstFit.imported();
    page.paint();
    firstFit.stop();
    expect(page.watching()).toBe(0);
    page.resize(1280, 800);
    expect(fake.sets).toEqual([]);
  });

  it("gives up a fit that still waits for its frame when it is stopped", () => {
    const fake = fakeBoard();
    const page = fakeSlot(1280, 800);
    const firstFit = firstFitOf(fake, page);
    firstFit.imported();
    firstFit.stop();
    expect(page.awaited()).toBe(0);
    page.paint();
    expect(fake.sets).toEqual([]);
    expect(page.watches()).toBe(0);
  });
});

describe("a view the host kept", () => {
  /** the person had zoomed in on the left end of the content */
  const KEPT = { x: -120, y: 40, zoom: 1.35 };

  it("is shown in the place of the fit, in the same frame", () => {
    const fake = fakeBoard();
    const page = fakeSlot(1280, 800);
    let asked = 0;
    const firstFit = firstFitOf(fake, page, {
      kept: () => {
        asked++;
        return KEPT;
      },
    });

    firstFit.imported();
    // not read at the import: what is kept then may still be the view of the page before
    expect(asked).toBe(0);
    expect(fake.sets).toEqual([]);
    page.paint();
    expect(fake.sets).toEqual([KEPT]);
    expect(asked).toBe(1);

    firstFit.imported();
    page.paint();
    page.resize(900, 600);
    expect(fake.sets).toEqual([KEPT]);
    expect(asked).toBe(1);
  });

  it("is not there, or is no view: the board is fitted", () => {
    const nothing: unknown[] = [
      undefined,
      null,
      {},
      "",
      [],
      { x: 0, y: 0 },
      { x: "0", y: 0, zoom: 1 },
      { x: Number.NaN, y: 0, zoom: 1 },
      { x: 0, y: Number.POSITIVE_INFINITY, zoom: 1 },
      { x: 0, y: 0, zoom: 0 },
      // outside the board's range: no view this board ever had
      { x: 0, y: 0, zoom: 0.05 },
      { x: 0, y: 0, zoom: 8 },
    ];
    for (const kept of nothing) {
      const fake = fakeBoard();
      const page = fakeSlot(1280, 800);
      firstFitOf(fake, page, { kept: () => kept }).imported();
      page.paint();
      expect(fake.sets, JSON.stringify(kept)).toEqual([FITTED]);
    }
  });

  it("lies far outside the content: the board is fitted, and never shown empty", () => {
    for (const kept of [
      { x: 5000, y: 0, zoom: 1 },
      { x: 0, y: -4000, zoom: 1 },
      { x: -90_000, y: -90_000, zoom: 4 },
      // 44 px of the content's right end in the slot, 24 of them under the left inset
      { x: -1156, y: 142, zoom: 1 },
    ]) {
      const fake = fakeBoard();
      const page = fakeSlot(1280, 800);
      firstFitOf(fake, page, { kept: () => kept }).imported();
      page.paint();
      expect(fake.sets, JSON.stringify(kept)).toEqual([FITTED]);
    }
  });

  it("was the view of another board text: restored only where this board's content is in sight", () => {
    // kept while the board's content lay around (6000, 3000), at 50 %
    const ofAnother = { x: -2600, y: -1200, zoom: 0.5 };
    const there = { x: 6000, y: 3000, width: 1200, height: 540 };

    const moved = fakeBoard(there);
    const page = fakeSlot(1280, 800);
    firstFitOf(moved, page, { kept: () => ofAnother }).imported();
    page.paint();
    expect(moved.sets).toEqual([ofAnother]);

    // the text that is there now has its content at the origin: nothing of it is in that view
    const fake = fakeBoard();
    const second = fakeSlot(1280, 800);
    firstFitOf(fake, second, { kept: () => ofAnother }).imported();
    second.paint();
    expect(fake.sets).toEqual([FITTED]);
  });

  it("is judged by the boxes of the nodes where the host hands them: a view between two far groups is left for the fit", () => {
    // the file changed while the page was away: its nodes lie 60 000 px apart now
    const west = { x: -30_000, y: 0, width: 520, height: 400 };
    const east = { x: 30_000, y: 0, width: 520, height: 400 };
    const around = { x: -30_000, y: 0, width: 60_520, height: 400 };
    const between = { x: 40, y: 142, zoom: 1 };

    const fake = fakeBoard(around);
    const page = fakeSlot(1280, 800);
    firstFitOf(fake, page, { kept: () => between, boxes: () => [west, east] }).imported();
    page.paint();
    expect(fake.sets).toHaveLength(1);
    expect(fake.sets[0]).not.toEqual(between);

    // with a node in sight the view is the person's own again
    const onTheEast = { x: 100 - 30_000, y: 142, zoom: 1 };
    const shown = fakeBoard(around);
    const second = fakeSlot(1280, 800);
    firstFitOf(shown, second, { kept: () => onTheEast, boxes: () => [west, east] }).imported();
    second.paint();
    expect(shown.sets).toEqual([onTheEast]);

    // a host that hands no boxes is judged by the box around all content, as before
    const whole = fakeBoard(around);
    const third = fakeSlot(1280, 800);
    firstFitOf(whole, third, { kept: () => between }).imported();
    third.paint();
    expect(whole.sets).toEqual([between]);
  });

  it("is not shown on an empty board, which has nothing to be in sight", () => {
    const fake = fakeBoard("empty");
    const page = fakeSlot(1280, 800);
    firstFitOf(fake, page, { kept: () => KEPT }).imported();
    page.paint();
    expect(fake.sets).toEqual([]);
  });

  it("waits for the slot's size like the fit, and is judged by the size the slot then has", () => {
    // content this view shows from 900 to 1100 px across: in a wide slot, beside a narrow one
    const content = { x: 1000, y: 0, width: 200, height: 540 };
    const kept = { x: -100, y: 142, zoom: 1 };

    const wide = fakeBoard(content);
    const page = fakeSlot(0, 0);
    firstFitOf(wide, page, { kept: () => kept }).imported();
    page.paint();
    expect(wide.sets).toEqual([]);
    page.resize(1280, 800);
    expect(wide.sets).toEqual([kept]);

    const narrow = fakeBoard(content);
    const small = fakeSlot(0, 0);
    firstFitOf(narrow, small, { kept: () => kept }).imported();
    small.paint();
    small.resize(600, 800);
    expect(narrow.sets).toHaveLength(1);
    expect(narrow.sets[0]).not.toEqual(kept);
  });
});

describe("the moment the first view stands", () => {
  it("is told once: after the fit, after a kept view, and for an empty board that got neither", () => {
    for (const [content, kept] of [
      [CONTENT, undefined],
      [CONTENT, { x: 0, y: 142, zoom: 1 }],
      ["empty", undefined],
    ] as const) {
      const fake = fakeBoard(content);
      const page = fakeSlot(1280, 800);
      const seen: number[] = [];
      const firstFit = firstFitOf(fake, page, {
        kept: () => kept,
        // by then the view is set
        shown: () => void seen.push(fake.sets.length),
      });
      firstFit.imported();
      expect(seen).toEqual([]);
      page.paint();
      expect(seen).toEqual([content === "empty" ? 0 : 1]);
      firstFit.imported();
      page.paint();
      page.resize(900, 600);
      expect(seen).toHaveLength(1);
    }
  });

  it("waits for the slot's size, and never comes for a first view that was given up", () => {
    const fake = fakeBoard();
    const page = fakeSlot(0, 0);
    let shown = 0;
    const firstFit = firstFitOf(fake, page, { shown: () => void shown++ });
    firstFit.imported();
    page.paint();
    expect(shown).toBe(0);
    page.resize(1280, 800);
    expect(shown).toBe(1);

    const stopped = fakeSlot(1280, 800);
    const given = firstFitOf(fakeBoard(), stopped, { shown: () => void shown++ });
    given.imported();
    given.stop();
    stopped.paint();
    expect(shown).toBe(1);
  });
});
