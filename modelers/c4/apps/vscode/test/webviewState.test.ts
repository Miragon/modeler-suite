import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewportState } from "@miragon/modeler-shell/core";
import { SHELL_STATE_KEY, writeShellState } from "@miragon/modeler-shell/vscode/webview";
import {
  C4_STATE_KEY,
  REMEMBERED_VIEWS,
  connectViewportMemory,
  readC4State,
  storedViewport,
  writeC4State,
} from "../src/webview/state.js";

/** `acquireVsCodeApi()`'s state, which VS Code hands over as JSON. */
function webviewApi(initial?: unknown) {
  let state = initial === undefined ? undefined : JSON.parse(JSON.stringify(initial));
  const api = {
    writes: 0,
    getState: () => state as unknown,
    setState(next: unknown) {
      api.writes += 1;
      state = JSON.parse(JSON.stringify(next));
    },
  };
  return api;
}

function place(x: number, userMoved = true): ViewportState {
  return { viewbox: { x, y: 10, width: 800, height: 600 }, userMoved };
}

/** The shell's viewport as far as the memory reads it. */
function fakeViewport(initial: ViewportState | undefined) {
  const listeners = new Set<() => void>();
  let state = initial;
  return {
    onChange(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getState: () => state,
    /** The canvas shows `next` now. */
    move(next: ViewportState | undefined) {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
}

describe("the webview state's C4 part (SPEC 7.3)", () => {
  it("is empty without one, and with a malformed one", () => {
    for (const state of [undefined, null, 7, [], { c4: "Landscape" }, { c4: [] }]) {
      expect(readC4State(webviewApi(state))).toEqual({
        activeView: undefined,
        viewportByView: new Map(),
      });
    }
  });

  it("keeps only the valid places", () => {
    const api = webviewApi({
      [C4_STATE_KEY]: {
        activeView: "Containers-shop",
        viewportByView: {
          Landscape: place(1),
          Broken: { viewbox: { x: 0, y: 0, width: 0, height: 10 }, userMoved: true },
          NoFlag: { viewbox: place(2).viewbox },
          NotFinite: { viewbox: { x: null, y: 0, width: 1, height: 1 }, userMoved: false },
          "Containers-shop": place(3, false),
        },
      },
    });

    const state = readC4State(api);

    expect(state.activeView).toBe("Containers-shop");
    expect([...state.viewportByView]).toEqual([
      ["Landscape", place(1)],
      ["Containers-shop", place(3, false)],
    ]);
  });

  it("is written next to the shell's part, which stays as it is", () => {
    const api = webviewApi();
    writeShellState(api, { legendOpen: true, view: place(5) });

    writeC4State(api, {
      activeView: "Landscape",
      viewportByView: new Map([["Landscape", place(1)]]),
    });
    writeShellState(api, { legendOpen: false });

    expect(api.getState()).toEqual({
      [SHELL_STATE_KEY]: { legendOpen: false, view: place(5) },
      [C4_STATE_KEY]: { activeView: "Landscape", viewportByView: { Landscape: place(1) } },
    });
  });

  it("writes nothing when nothing changed", () => {
    const api = webviewApi();
    const state = { activeView: "Landscape", viewportByView: new Map([["Landscape", place(1)]]) };

    writeC4State(api, state);
    writeC4State(api, { ...state, viewportByView: new Map(state.viewportByView) });

    expect(api.writes).toBe(1);
  });

  it("keeps a view key that is also the name of an object's prototype", () => {
    const api = webviewApi();

    writeC4State(api, {
      activeView: "__proto__",
      viewportByView: new Map([["__proto__", place(1)]]),
    });

    expect([...readC4State(api).viewportByView]).toEqual([["__proto__", place(1)]]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("the place the first import comes back to", () => {
  const shellView = place(9);

  it("is the view's own place", () => {
    const state = { activeView: "Landscape", viewportByView: new Map([["Context", place(1)]]) };
    expect(storedViewport(state, shellView, "Context")).toEqual(place(1));
  });

  it("is the shell's view when that was written for the same view", () => {
    const state = { activeView: "Context", viewportByView: new Map() };
    expect(storedViewport(state, shellView, "Context")).toBe(shellView);
  });

  it("is the shell's view for a webview from before the modeler kept its own", () => {
    expect(storedViewport({ viewportByView: new Map() }, shellView, "Landscape")).toBe(shellView);
  });

  it("is none when the view shown last is gone and the import shows another", () => {
    const state = { activeView: "Deleted", viewportByView: new Map() };
    expect(storedViewport(state, shellView, "Landscape")).toBeUndefined();
  });
});

describe("the viewport memory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function connect(initial?: unknown, shown = "Landscape") {
    const api = webviewApi(initial);
    const viewport = fakeViewport(undefined);
    const view = { shown };
    const memory = connectViewportMemory(api, { viewport, activeView: () => view.shown });
    const stored = () => readC4State(api);
    return { api, viewport, view, memory, stored };
  }

  it("reads the stored state once, when it connects", () => {
    const { memory } = connect({
      [C4_STATE_KEY]: { activeView: "Context", viewportByView: { Context: place(1) } },
    });

    expect(memory.stored.activeView).toBe("Context");
    expect(memory.stored.viewportByView.get("Context")).toEqual(place(1));
  });

  it("writes the view shown and its place once the view has rested", () => {
    const { api, viewport, stored } = connect();

    viewport.move(place(1));
    viewport.move(place(2));
    vi.advanceTimersByTime(249);
    expect(api.writes).toBe(0);
    vi.advanceTimersByTime(1);

    expect(api.writes).toBe(1);
    expect(stored().activeView).toBe("Landscape");
    expect([...stored().viewportByView]).toEqual([["Landscape", place(2)]]);
  });

  it("writes nothing before the viewport has a state", () => {
    const { api, viewport } = connect();

    viewport.move(undefined);
    vi.runAllTimers();

    expect(api.writes).toBe(0);
  });

  it("keeps the place of the view the canvas switched away from, at the switch", () => {
    const { viewport, view, memory, stored } = connect();
    viewport.move(place(1));
    vi.runAllTimers();
    viewport.move(place(2));

    // The view switched; the canvas still shows the box the landscape was left at.
    view.shown = "Context";
    memory.switched("Landscape", "Context", "user");
    expect(stored().activeView).toBe("Context");
    expect(stored().viewportByView.get("Landscape")).toEqual(place(2));

    // The host restores or fits the new view.
    viewport.move(place(3));
    vi.runAllTimers();
    expect([...stored().viewportByView]).toEqual([
      ["Landscape", place(2)],
      ["Context", place(3)],
    ]);
  });

  it("hands out the place a view was left at before a reload, and the one it is left at now", () => {
    const { viewport, view, memory } = connect({
      [C4_STATE_KEY]: { activeView: "Landscape", viewportByView: { Context: place(1) } },
    });
    expect(memory.placeOf("Context")).toEqual(place(1));
    expect(memory.placeOf("Landscape")).toBeUndefined();

    viewport.move(place(2));
    view.shown = "Context";
    memory.switched("Landscape", "Context", "user");

    expect(memory.placeOf("Landscape")).toEqual(place(2));
    memory.switched("Context", "Landscape", "removed");
    expect(memory.placeOf("Context")).toBeUndefined();
  });

  it("moves the place of a re-keyed view to its new key", () => {
    const { viewport, view, memory, stored } = connect();
    viewport.move(place(1));
    vi.runAllTimers();

    view.shown = "Containers-store";
    memory.switched("Landscape", "Containers-store", "rekey");

    expect([...stored().viewportByView]).toEqual([["Containers-store", place(1)]]);
    expect(stored().activeView).toBe("Containers-store");
  });

  it("forgets the place of a view the edit removed", () => {
    const { viewport, view, memory, stored } = connect();
    view.shown = "Context";
    viewport.move(place(1));
    vi.runAllTimers();

    view.shown = "Landscape";
    memory.switched("Context", "Landscape", "removed");

    expect(stored().viewportByView.has("Context")).toBe(false);
    expect(stored().activeView).toBe("Landscape");
  });

  it(`remembers the ${REMEMBERED_VIEWS} views seen last`, () => {
    const { viewport, view, stored } = connect();
    for (let index = 0; index <= REMEMBERED_VIEWS; index++) {
      view.shown = `View-${index}`;
      viewport.move(place(index));
      vi.runAllTimers();
    }
    view.shown = "View-1";
    viewport.move(place(1000));
    vi.runAllTimers();

    const keys = [...stored().viewportByView.keys()];
    expect(keys).toHaveLength(REMEMBERED_VIEWS);
    expect(keys).not.toContain("View-0");
    expect(keys.at(-1)).toBe("View-1");
  });

  it("writes a pending change when it stops, and listens no more", () => {
    const { api, viewport, memory, stored } = connect();
    viewport.move(place(1));

    memory.stop();
    expect(stored().viewportByView.get("Landscape")).toEqual(place(1));
    expect(viewport.listeners.size).toBe(0);

    memory.switched("Landscape", "Context", "user");
    memory.stop();
    expect(api.writes).toBe(1);
  });
});
