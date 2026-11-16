/**
 * The bench's eyes inside the page. `installProbe` is handed to the browser as an init script,
 * so it runs before the page's first script and stands alone: it reads nothing of this module
 * and nothing of the board but its DOM contract. A walk through a real VS Code puts the same
 * function into the board's webview once that exists, and says how late that was.
 *
 * It looks on a timer and in animation frames and keeps no MutationObserver: an observer on a
 * subtree is asked for every attribute a modeler writes while it draws, which is the work the
 * bench measures. A time is in ms since the navigation started.
 */

/**
 * The function a bench may put into the page (`page.exposeBinding`). The probe calls it with
 * `drawn` once the board has drawn, with `frame` once the frame after a move of a held drag was
 * produced, and with `missed` for a press it kept from the board: the browser sends no move
 * for a press that was cancelled, so no frame follows that one. So the bench hears of all three
 * without asking the page, which answers a question behind the tasks it queued before.
 */
export const BENCH_BINDING = "__boardBenchSays";
export type BenchWord = "drawn" | "frame" | "missed";

export interface ProbeOptions {
  /** the model nodes: each has an editor that becomes ready */
  readonly modelNodes: readonly string[];
  /** every node the board draws */
  readonly nodeCount: number;
}

export interface FailedNode {
  readonly id: string;
  readonly state: string;
  readonly text: string;
}

/**
 * One move of a real drag that began on the bare pane: when the pointer moved, and when the
 * frame after it was produced. `shown` says that the board's view was another one by then.
 */
export interface PanAnswer {
  readonly moved: number;
  readonly answered: number;
  readonly shown: boolean;
}

export interface ProbeState {
  /** every node's frame and the toolbar are in the DOM */
  readonly drawnAt: number | undefined;
  /** when each model node's editor said ready, with its picture in the DOM */
  readonly ready: Readonly<Record<string, number>>;
  /** model nodes whose editor said ready and drew no picture */
  readonly withoutPicture: readonly string[];
  /** the last of them */
  readonly readyAt: number | undefined;
  /** the frame after it was painted */
  readonly paintedAt: number | undefined;
  readonly failed: readonly FailedNode[];
  readonly longTasks: readonly { start: number; duration: number }[];
  readonly pans: readonly PanAnswer[];
  readonly now: number;
  /** when the probe was put into the page: before it, the page was not seen */
  readonly installedAt: number;
  /** the page's start as a time of day, for whoever holds a time of another process against it */
  readonly timeOrigin: number;
}

export interface FrameWindow {
  readonly from: number;
  readonly to: number;
  /** the time of every animation frame in the window */
  readonly frames: readonly number[];
}

export interface ArmTimes {
  /** the double-click, or the click on Done */
  readonly asked: number | undefined;
  /** the board said so: the Done control names the node, or names none again */
  readonly switched: number | undefined;
  /** the board's view changed for the last time */
  readonly rested: number | undefined;
  readonly problem?: string | undefined;
}

export interface PageCounts {
  /** editors that hold a diagram */
  readonly modelers: number;
  /** elements in the document */
  readonly elements: number;
  readonly engines: number;
}

export interface BoardBenchProbe {
  state(): ProbeState;
  /** a point of the window that shows the bare pane */
  panePoint(): { x: number; y: number } | null;
  /**
   * A point in the middle of a stretch of bare pane, with `room` px of pane to every side: a
   * small pan that starts there starts on the pane the next time as well. Null where the
   * window shows no such stretch.
   */
  roomyPanePoint(room: number): { x: number; y: number } | null;
  /**
   * While true, a press that does not land on the bare pane is kept from the board: a pan of the
   * load's probe that the first fit moved a node under would drag that node.
   */
  panesOnly(on: boolean): void;
  /**
   * Of these nodes the one nearest the middle of the window whose preview a double-click
   * reaches, with the point to click: a large board is cut at the window's edges.
   */
  armTarget(nodeIds: readonly string[]): { id: string; x: number; y: number } | null;
  donePoint(): { x: number; y: number } | null;
  startFrames(): void;
  stopFrames(): FrameWindow;
  /**
   * Starts to watch for the arming of a node, or for the leaving of the armed one: called and
   * awaited before the input that asks for it, so that the input is never ahead of the watch.
   */
  watchArm(nodeId: string, limitMs: number): void;
  watchLeave(limitMs: number): void;
  /** what the last watch saw, once it saw it */
  watched(): Promise<ArmTimes>;
  counts(): PageCounts;
  /** the board's view, as React Flow writes it on its viewport */
  view(): string;
}

declare global {
  interface Window {
    __boardBench?: BoardBenchProbe | undefined;
  }
}

export function installProbe(options: ProbeOptions): void {
  const installedAt = performance.now();
  const ready: Record<string, number> = {};
  const withoutPicture: string[] = [];
  const failed: FailedNode[] = [];
  const longTasks: { start: number; duration: number }[] = [];
  const pans: PanAnswer[] = [];
  const engines = new Map<string, HTMLElement>();
  let drawnAt: number | undefined;
  let readyAt: number | undefined;
  let paintedAt: number | undefined;

  // A task of the highest priority, queued from the frame's own callback: it runs once that
  // frame's work on the main thread is done, ahead of every task the page queued before. A
  // message task waits behind those, and while a board loads that is behind every text that is
  // still to be mounted: read that way, a pan of the load was answered when the load had ended.
  const scheduler = (
    globalThis as {
      scheduler?: { postTask(run: () => void, options: { priority: "user-blocking" }): unknown };
    }
  ).scheduler;
  /** after the frame that follows `then` was produced */
  const afterPaint = (then: () => void): void => {
    requestAnimationFrame(() => {
      if (scheduler) {
        void scheduler.postTask(then, { priority: "user-blocking" });
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = then;
      channel.port2.postMessage(undefined);
    });
  };
  const viewport = (): HTMLElement | null => document.querySelector(".react-flow__viewport");

  // the name is `BENCH_BINDING`, spelt out because this function stands alone
  const tellBench = (word: "drawn" | "frame" | "missed"): void => {
    (window as { __boardBenchSays?: (word: string) => void }).__boardBenchSays?.(word);
  };

  const look = (): void => {
    const now = performance.now();
    if (drawnAt === undefined) {
      const nodes = document.getElementsByClassName("react-flow__node").length;
      if (nodes >= options.nodeCount && document.querySelector(".board-toolbar")) {
        drawnAt = now;
        tellBench("drawn");
      }
    }
    for (const id of options.modelNodes) {
      if (id in ready || failed.some((one) => one.id === id)) continue;
      let engine = engines.get(id);
      if (!engine?.isConnected) {
        // asked inside the node alone, and no more once it is found: never the whole document
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
        engine = node?.querySelector<HTMLElement>(".board-engine") ?? undefined;
        if (!engine) continue;
        engines.set(id, engine);
      }
      const state = engine.dataset.embedState ?? "";
      if (engine.classList.contains("board-engine--failed") || /failed|invalid|gone/.test(state)) {
        failed.push({ id, state: state || "failed", text: (engine.textContent ?? "").trim() });
      } else if (state === "ready") {
        ready[id] = now;
        if (!engine.querySelector(".djs-container > svg .djs-element")) withoutPicture.push(id);
      }
    }
    if (readyAt === undefined && Object.keys(ready).length === options.modelNodes.length) {
      readyAt = now;
      clearInterval(timer);
      afterPaint(() => (paintedAt = performance.now()));
    }
  };
  const timer = setInterval(look, 10);

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // a browser without the entry type reports no long task
  }

  let panesOnly = true;
  /** the press that is held began on the bare pane */
  let heldOnPane = false;
  const isPane = (target: EventTarget | null): boolean =>
    target instanceof Element && target.classList.contains("react-flow__pane");
  for (const press of ["pointerdown", "mousedown"]) {
    window.addEventListener(
      press,
      (event) => {
        if (!event.isTrusted) return;
        const bare = isPane(event.target);
        if (press === "mousedown") heldOnPane = bare;
        if (!panesOnly || bare) return;
        if (press === "pointerdown") tellBench("missed");
        event.stopImmediatePropagation();
        event.preventDefault();
      },
      true,
    );
  }
  window.addEventListener(
    "mouseup",
    (event) => {
      if (event.isTrusted) heldOnPane = false;
    },
    true,
  );
  // What the press began, its release ends: a press the board never got is no click on a node
  // either, and two of them are no double-click that arms a model.
  for (const release of ["click", "dblclick"]) {
    window.addEventListener(
      release,
      (event) => {
        if (!panesOnly || !event.isTrusted || isPane(event.target)) return;
        event.stopImmediatePropagation();
        event.preventDefault();
      },
      true,
    );
  }

  // A real drag on the pane: the board writes its view inside the move's own event, and the
  // answer is the frame that shows it. Every move of a drag that began on the pane counts,
  // whether or not the view is another one by its frame: two pans the page took in one frame
  // may leave the view where it was, and the first of them waited the longest.
  window.addEventListener(
    "mousemove",
    (event) => {
      if (!event.isTrusted || (event.buttons & 1) === 0) return;
      const view = heldOnPane ? viewport() : null;
      const before = view?.style.transform;
      const moved = event.timeStamp;
      afterPaint(() => {
        if (view) {
          const shown = view.style.transform !== before;
          pans.push({ moved, answered: performance.now(), shown });
        }
        // also for a move that met no pane: the bench's next pan waits for this one's frame
        tellBench("frame");
      });
    },
    true,
  );

  let frames: number[] | undefined;
  let framesFrom = 0;
  const tick = (now: number): void => {
    if (!frames) return;
    frames.push(now);
    requestAnimationFrame(tick);
  };

  const centreOf = (element: Element | null): { x: number; y: number } | null => {
    const box = element?.getBoundingClientRect();
    return box && box.width > 0 ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  };
  const doneControl = (): Element | null => document.querySelector("[data-board-done]");
  const armedNode = (): string => doneControl()?.getAttribute("data-board-done") ?? "";
  const inLayer = (): boolean =>
    document.querySelector(".board-overlay-layer > .board-engine") !== null;

  /** Resolves once `switched()` holds and the board's view stood still for six frames. */
  const watch = (trigger: string, switched: () => boolean, limitMs: number): Promise<ArmTimes> =>
    new Promise((resolve) => {
      let asked: number | undefined;
      const onTrigger = (event: Event): void => {
        if (event.isTrusted) asked = event.timeStamp;
      };
      window.addEventListener(trigger, onTrigger, true);
      const started = performance.now();
      let switchedAt: number | undefined;
      let last = viewport()?.style.transform ?? "";
      let changed = started;
      let still = 0;
      const end = (times: ArmTimes): void => {
        window.removeEventListener(trigger, onTrigger, true);
        resolve(times);
      };
      const frame = (): void => {
        const now = performance.now();
        if (switchedAt === undefined && asked !== undefined && switched()) switchedAt = now;
        const view = viewport()?.style.transform ?? "";
        if (view === last) still += 1;
        else {
          last = view;
          changed = now;
          still = 0;
        }
        if (switchedAt !== undefined && still >= 6) {
          end({ asked, switched: switchedAt, rested: Math.max(changed, switchedAt) });
        } else if (now - started > limitMs) {
          end({ asked, switched: switchedAt, rested: undefined, problem: "nothing happened" });
        } else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

  let lastPane: { x: number; y: number } | undefined;
  let lastFineLook = 0;
  const NOTHING = { asked: undefined, switched: undefined, rested: undefined };
  let watching: Promise<ArmTimes> | undefined;

  const bare = (x: number, y: number): boolean => isPane(document.elementFromPoint(x, y));
  const panePoint = (): { x: number; y: number } | null => {
    if (lastPane && bare(lastPane.x, lastPane.y)) return lastPane;
    // No pane, no look. And a fine look at a window full of nodes is tens of thousands of hit
    // tests, which is work the load would be charged with: coarse first, fine twice a second.
    if (!document.querySelector(".react-flow__pane")) return null;
    const fine = performance.now() - lastFineLook > 500;
    for (const step of fine ? [16, 4] : [16]) {
      if (step === 4) lastFineLook = performance.now();
      for (let y = window.innerHeight - 9; y > 60; y -= step) {
        for (let x = 9; x < window.innerWidth - 9; x += step) {
          if (bare(x, y)) return (lastPane = { x, y });
        }
      }
    }
    return null;
  };
  const AROUND = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const;
  const roomyPanePoint = (room: number): { x: number; y: number } | null => {
    const found = panePoint();
    if (!found) return null;
    const roomy = (x: number, y: number): boolean =>
      bare(x, y) && AROUND.every(([dx, dy]) => bare(x + dx * room, y + dy * room));
    /** how far the bare pane reaches from a point along one axis, up to four times the room */
    const reach = (x: number, y: number, dx: number, dy: number): number => {
      let steps = 0;
      while (steps < room * 4 && bare(x + dx * (steps + 1), y + dy * (steps + 1))) steps += 1;
      return steps;
    };
    // The middle of the stretch across, then of the stretch down at that place: on a board
    // that fills the window the bare pane is the few px between two nodes.
    const across = reach(found.x, found.y, 1, 0) - reach(found.x, found.y, -1, 0);
    const x = found.x + Math.round(across / 2);
    const y = found.y + Math.round((reach(x, found.y, 0, 1) - reach(x, found.y, 0, -1)) / 2);
    if (roomy(x, y)) return { x, y };
    if (roomy(found.x, found.y)) return found;
    // beside a control of the page's chrome neither may have its room: every fourth px then
    for (let down = window.innerHeight - 9; down > 60; down -= 4) {
      for (let right = 9; right < window.innerWidth - 9; right += 4) {
        if (roomy(right, down)) return { x: right, y: down };
      }
    }
    return null;
  };

  window.__boardBench = {
    state: () => ({
      drawnAt,
      ready: { ...ready },
      withoutPicture: [...withoutPicture],
      readyAt,
      paintedAt,
      failed: [...failed],
      longTasks: [...longTasks],
      pans: [...pans],
      now: performance.now(),
      installedAt,
      timeOrigin: performance.timeOrigin,
    }),
    panePoint,
    roomyPanePoint,
    panesOnly(on) {
      panesOnly = on;
    },
    armTarget(nodeIds) {
      const middle = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      let best: { id: string; x: number; y: number; distance: number } | null = null;
      for (const id of nodeIds) {
        const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
        const box = node?.querySelector(".board-node__body")?.getBoundingClientRect();
        if (!node || !box || box.width === 0) continue;
        // not the middle of the preview: an arrow's label may lie there
        const at = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
        if (document.elementFromPoint(at.x, at.y)?.closest(".react-flow__node") !== node) continue;
        const distance = Math.hypot(
          box.x + box.width / 2 - middle.x,
          box.y + box.height / 2 - middle.y,
        );
        if (!best || distance < best.distance) best = { id, ...at, distance };
      }
      return best && { id: best.id, x: best.x, y: best.y };
    },
    donePoint: () => centreOf(doneControl()),
    startFrames() {
      frames = [];
      framesFrom = performance.now();
      requestAnimationFrame(tick);
    },
    stopFrames() {
      const window_ = { from: framesFrom, to: performance.now(), frames: frames ?? [] };
      frames = undefined;
      return window_;
    },
    watchArm(nodeId, limitMs) {
      watching = watch("dblclick", () => armedNode() === nodeId && inLayer(), limitMs);
    },
    watchLeave(limitMs) {
      watching = watch("click", () => armedNode() === "" && !inLayer(), limitMs);
    },
    watched: () => watching ?? Promise.resolve({ ...NOTHING, problem: "nothing was watched" }),
    counts: () => ({
      modelers: document.querySelectorAll(".board-engine .djs-container").length,
      elements: document.getElementsByTagName("*").length,
      engines: document.getElementsByClassName("board-engine").length,
    }),
    view: () => viewport()?.style.transform ?? "",
  };
}
