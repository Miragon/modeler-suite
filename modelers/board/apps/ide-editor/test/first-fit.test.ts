import { describe, expect, it } from "vitest";
import { createFirstFit, type NextFrame, type SizeWatch } from "../src/first-fit.js";
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
const firstFitOf = (fake: ReturnType<typeof fakeBoard>, page: Page) =>
  createFirstFit(fake.board, page.slot, () => INSETS, page.watchSize, page.nextFrame);

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
