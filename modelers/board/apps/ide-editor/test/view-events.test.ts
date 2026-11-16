import { describe, expect, it } from "vitest";
import { viewChanges, type PageFrames } from "../src/view-events.js";
import type { BoardView, ViewedBoard } from "../src/zoom-target.js";

/** A page whose frames the test draws by hand. */
function fakePage() {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  const visibilityListeners = new Set<() => void>();
  let shown = true;
  const frames: PageFrames = {
    request(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel: (handle) => void pending.delete(handle),
    visible: () => shown,
    onVisibility(listener) {
      visibilityListeners.add(listener);
      return () => void visibilityListeners.delete(listener);
    },
  };
  return {
    frames,
    pending: () => pending.size,
    visibilityListeners: () => visibilityListeners.size,
    /** one animation frame: every callback that was requested before it */
    frame() {
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) callback();
    },
    setShown(next: boolean) {
      shown = next;
      for (const listener of [...visibilityListeners]) listener();
    },
  };
}

function fakeBoard(start: BoardView = { x: 0, y: 0, zoom: 1 }) {
  let view = start;
  let reads = 0;
  const board: ViewedBoard = {
    getViewState() {
      reads++;
      return { ...view };
    },
    setViewState: (state) => void (view = state as BoardView),
    contentBounds: () => undefined,
  };
  return { board, reads: () => reads, moveTo: (next: BoardView) => void (view = next) };
}

describe("a board that does not report its view", () => {
  it("is looked at once per animation frame, and tells only of a view that changed", () => {
    const page = fakePage();
    const fake = fakeBoard();
    let told = 0;
    viewChanges(fake.board, page.frames)(() => void told++);
    const readsAtStart = fake.reads();
    expect(page.pending()).toBe(1);

    page.frame();
    page.frame();
    expect(fake.reads() - readsAtStart).toBe(2);
    expect(told).toBe(0);

    fake.moveTo({ x: 0, y: 0, zoom: 1.35 });
    page.frame();
    expect(told).toBe(1);
    page.frame();
    expect(told).toBe(1);

    fake.moveTo({ x: -12, y: 0, zoom: 1.35 });
    page.frame();
    fake.moveTo({ x: -12, y: 7, zoom: 1.35 });
    page.frame();
    expect(told).toBe(3);
    expect(page.pending()).toBe(1);
  });

  it("asks for no frame before somebody listens, and for none after the last one went", () => {
    const page = fakePage();
    const fake = fakeBoard();
    const subscribe = viewChanges(fake.board, page.frames);
    expect([page.pending(), page.visibilityListeners(), fake.reads()]).toEqual([0, 0, 0]);

    const stopFirst = subscribe(() => undefined);
    const stopSecond = subscribe(() => undefined);
    // one look per frame, however many listen
    expect([page.pending(), page.visibilityListeners()]).toEqual([1, 1]);
    stopFirst();
    expect(page.pending()).toBe(1);
    stopSecond();
    expect([page.pending(), page.visibilityListeners()]).toEqual([0, 0]);

    const reads = fake.reads();
    page.frame();
    expect(fake.reads()).toBe(reads);
  });

  it("does not look while the page is hidden, and sees what changed meanwhile once it is back", () => {
    const page = fakePage();
    const fake = fakeBoard();
    let told = 0;
    viewChanges(fake.board, page.frames)(() => void told++);

    page.setShown(false);
    expect(page.pending()).toBe(0);
    fake.moveTo({ x: 5, y: 5, zoom: 2 });
    const reads = fake.reads();
    page.frame();
    expect([told, fake.reads()]).toEqual([0, reads]);

    page.setShown(true);
    expect(page.pending()).toBe(1);
    page.frame();
    expect(told).toBe(1);
  });

  it("starts no frame for a listener that comes while the page is hidden", () => {
    const page = fakePage();
    page.setShown(false);
    const fake = fakeBoard();
    let told = 0;
    viewChanges(fake.board, page.frames)(() => void told++);
    expect(page.pending()).toBe(0);
    fake.moveTo({ x: 1, y: 1, zoom: 1 });
    page.setShown(true);
    page.frame();
    expect(told).toBe(1);
  });

  it("does not tell a listener of the view it found when it began to listen", () => {
    const page = fakePage();
    const fake = fakeBoard({ x: 40, y: 142, zoom: 1 });
    let told = 0;
    viewChanges(fake.board, page.frames)(() => void told++);
    page.frame();
    expect(told).toBe(0);
  });

  it("goes on when a listener stops listening while it is told", () => {
    const page = fakePage();
    const fake = fakeBoard();
    const subscribe = viewChanges(fake.board, page.frames);
    const heard: string[] = [];
    const stopFirst = subscribe(() => {
      heard.push("first");
      stopFirst();
    });
    subscribe(() => void heard.push("second"));
    fake.moveTo({ x: 1, y: 0, zoom: 1 });
    page.frame();
    fake.moveTo({ x: 2, y: 0, zoom: 1 });
    page.frame();
    expect(heard).toEqual(["first", "second", "second"]);
  });
});

describe("a board that reports its view", () => {
  it("is listened to, and never looked at", () => {
    const page = fakePage();
    const fake = fakeBoard();
    const viewListeners = new Set<(view: BoardView) => void>();
    const handle = {
      onViewChanged(this: unknown, listener: (view: BoardView) => void) {
        // the event is a method of the board's handle
        expect(this).toBe(handle);
        viewListeners.add(listener);
        return () => void viewListeners.delete(listener);
      },
    };
    const board = { ...fake.board, board: handle };
    const heard: unknown[][] = [];
    const stop = viewChanges(board, page.frames)((...args: unknown[]) => void heard.push(args));
    expect(viewListeners.size).toBe(1);
    expect([page.pending(), page.visibilityListeners(), fake.reads()]).toEqual([0, 0, 0]);

    for (const listener of viewListeners) listener({ x: 1, y: 2, zoom: 3 });
    // the listener is told that the view changed, not what it is
    expect(heard).toEqual([[]]);
    stop();
    expect(viewListeners.size).toBe(0);
  });

  it("is looked at where the member of that name is no function", () => {
    const page = fakePage();
    const fake = fakeBoard();
    const board = { ...fake.board, board: { onViewChanged: true } };
    viewChanges(board, page.frames)(() => undefined);
    expect(page.pending()).toBe(1);
  });
});
