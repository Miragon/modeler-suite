/**
 * A board's loads, measured. One load that nobody touches gives the time until every preview
 * is drawn (T2), and at rest the memory (M), a scripted pan and zoom, and the arming of a
 * model. A second load, panned from its first moment on, gives the time to the first
 * interaction (T1): a pan is a frame the page has to produce, so a load that is panned is
 * another load than one that is left alone, and its T2 is no T2 of the board. Every input is
 * real input through the browser, and every time is read inside the page.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Browser, BrowserContext, CDPSession, Page } from "@playwright/test";
import type { BenchRepository } from "./generate.js";
import {
  BENCH_BINDING,
  type BenchWord,
  type ArmTimes,
  type FrameWindow,
  type PageCounts,
  type PanAnswer,
  type ProbeState,
} from "./page-probe.js";
import { LOAD_LIMIT_MS, OUT } from "./settings.js";

/** A pan or a click counts as answered when the frame that shows it comes within this time. */
export const ANSWERED_MS = 100;
/** A task longer than this keeps the page from answering: the long-task threshold. */
const BLOCKING_MS = 50;

export interface LoadNumbers {
  /**
   * T1: the first pan after the board has drawn that is answered within `ANSWERED_MS`. Undefined
   * where none was, up to a second after the last preview: such a board never answers in time.
   */
  readonly t1Ms: number | undefined;
  /** the last pan before T2 that was not answered within `ANSWERED_MS`; T1 where there is none */
  readonly t1LastSlowMs: number | undefined;
  /** the median answer to a pan in the second after T2 */
  readonly restPanMs: number;
  /** the slowest answer to a pan between the board's drawing and T2 */
  readonly slowestPanMs: number;
  /** the pans the page took between the board's drawing and T2, and those answered in time */
  readonly pans: number;
  readonly pansInTime: number;
  /** every node's frame and the toolbar in the DOM */
  readonly drawnMs: number;
  /** T2: the last model node's editor ready with its picture in the DOM, and that frame painted */
  readonly t2Ms: number;
  readonly longestTaskMs: number;
  /** what the long tasks until T2 took beyond 50 ms each */
  readonly blockedMs: number;
  /** the browser's own sums from the navigation until the board rested: script, layout, style, all tasks */
  readonly scriptMs: number;
  readonly layoutMs: number;
  readonly styleMs: number;
  readonly taskMs: number;
}

export interface MemoryNumbers {
  /** the JS heap in use after a forced collection */
  readonly heapMB: number;
  /** DOM nodes the page's process holds, attached or not */
  readonly domNodes: number;
  /** elements in the document */
  readonly elements: number;
  readonly modelers: number;
  /** the resident memory of the page's renderer process; undefined where /proc is not read */
  readonly rendererMB: number | undefined;
}

export interface MotionNumbers {
  /** frames the compositor drew during the script, and the script's length */
  readonly frames: number;
  readonly scriptMs: number;
  readonly framesPerSecond: number;
  /** animation frames of the page itself, the main thread's share */
  readonly pageFrames: number;
  readonly longestFrameGapMs: number;
  readonly longestTaskMs: number;
  /** the median answer to a move of the pan */
  readonly panAnswerMs: number;
  readonly moves: number;
  readonly wheels: number;
}

export interface ArmNumbers {
  /** from the double-click until the Done control names the node */
  readonly armedMs: number;
  /** until the board's move to the node ended */
  readonly armRestedMs: number;
  /** from the click on Done until the editor is a preview again */
  readonly leftMs: number;
}

/** What a load gives that nobody touched until its last preview was drawn. */
export type QuietNumbers = Omit<
  LoadNumbers,
  "t1Ms" | "t1LastSlowMs" | "slowestPanMs" | "pans" | "pansInTime"
>;

/** What a load gives that was panned from its first moment on. */
export interface AnswerNumbers {
  /**
   * T1: when the first pan that was made after the board had drawn and answered within
   * `ANSWERED_MS` was answered. Undefined where none was: such a board never answers in time.
   */
  readonly t1Ms: number | undefined;
  /** when the last pan of the load that took longer was answered; T1 where there is none */
  readonly t1LastSlowMs: number | undefined;
  /** the pans the page took between the board's drawing and its last preview */
  readonly pans: number;
  /** those of them that were answered within `ANSWERED_MS` */
  readonly pansInTime: number;
  readonly medianPanMs: number;
  readonly slowestPanMs: number;
  readonly drawnMs: number;
  /**
   * The last preview under those pans: beside the quiet load's T2 it says what the panning
   * cost. Undefined where it had not come when the load was given up.
   */
  readonly t2Ms: number | undefined;
}

export interface RunNumbers {
  /**
   * A fixed piece of work in this process, timed right before the load: how fast the machine
   * was at that moment. On a machine shared with others it says which runs met a busy one.
   */
  readonly yardstickMs: number;
  /**
   * The same work on six threads at once. A browser that draws in software works on several
   * threads, and a host that leaves the machine one processor passes the yardstick above and
   * makes a load three times as slow.
   */
  readonly yardstickSixMs: number;
  readonly load: QuietNumbers;
  readonly memory: MemoryNumbers;
  readonly motion?: MotionNumbers | undefined;
  readonly arm?: ArmNumbers | undefined;
  /**
   * Where the window shows bare pane once the board is fitted, with room for a pan of the
   * load: the panned load of the same board starts its pans there. Absent where the fitted
   * board leaves no such stretch.
   */
  readonly pane?: Point | undefined;
  /** the same board loaded once more and panned throughout; absent where that load was not made */
  readonly answer?: AnswerNumbers | undefined;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

// Chromium's line for a ResizeObserver that could not deliver in one frame: no error of a page.
const RESIZE_OBSERVER = "ResizeObserver loop completed with undelivered notifications.";

const FAILURES = join(OUT, "failures");

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const stateOf = (page: Page): Promise<ProbeState> =>
  page.evaluate(() => window.__boardBench!.state());

/** How far a pan drags the pane, in px. */
const REST_REACH: Point = { x: 6, y: 4 };
/**
 * The reach of a pan of the load, and the room of bare pane it needs around its point. The
 * load's pans all start at one point, found before the load: a board that is too large for its
 * smallest zoom leaves 8 px between two nodes, and the pan has to stay inside that.
 */
const LOAD_REACH: Point = { x: 2, y: 0 };
const LOAD_ROOM_PX = 3;
/**
 * The rest between two pans of the load: after a pan was answered the next one waits as long
 * as that answer took, and at least this. Each pan is a frame the page has to produce, so the
 * pans leave the load at least half of the page's time. Pans sent as fast as the page takes
 * them leave a large board none: a board of 200 models did not finish loading in ten minutes.
 */
const PAN_REST_MS = 50;

/**
 * A real drag of the bare pane by a few px with its four events sent at once, the other way
 * with every call so that the view stays where it was. The press, the move and the release then
 * meet in one frame, which no hand does: the bench's own pans are `panByHand`, and this one
 * stays for whoever wants that frame.
 */
export async function pan(
  cdp: CDPSession,
  point: Point,
  way: 1 | -1,
  reach: Point = REST_REACH,
): Promise<void> {
  const there = { x: point.x + reach.x * way, y: point.y + reach.y * way };
  const mouse = (
    type: "mouseMoved" | "mousePressed" | "mouseReleased",
    at: typeof point,
    held: 0 | 1,
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x: at.x,
      y: at.y,
      button: type === "mouseMoved" && held === 0 ? "none" : "left",
      buttons: held,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  await Promise.all([
    mouse("mouseMoved", point, 0),
    mouse("mousePressed", point, 1),
    mouse("mouseMoved", there, 1),
    mouse("mouseReleased", there, 0),
  ]);
}

/** What the probe tells the bench by itself (`BENCH_BINDING`), as something to wait on. */
interface PageWords {
  /** true once the probe said that the board has drawn */
  drawn(): boolean;
  /**
   * Settles with the next frame the probe tells of, and after `FRAME_WAIT_MS` without one; at
   * once where the probe said that the last press never reached the board, since no move
   * follows such a press.
   */
  frame(): Promise<void>;
}

/**
 * How long a pan waits for the frame that answers it before it goes on without. A frame that
 * takes longer is no answer in time anyway, and the probe has its time all the same.
 */
const FRAME_WAIT_MS = 400;
/** How long a hand holds a press before it moves: the press has a frame of its own. */
const PRESS_HOLD_MS = 60;

/** The page's words, taken once per page and before its navigation. */
async function wordsOf(page: Page): Promise<PageWords> {
  let drawn = false;
  let missed = false;
  let frame: (() => void) | undefined;
  await page.exposeBinding(BENCH_BINDING, (_source, word: BenchWord) => {
    if (word === "drawn") drawn = true;
    else if (word === "missed") missed = true;
    else frame?.();
  });
  return {
    drawn: () => drawn,
    frame() {
      if (missed) {
        missed = false;
        return Promise.resolve();
      }
      const next = new Promise<void>((done) => (frame = done));
      return Promise.race([next, sleep(FRAME_WAIT_MS)]);
    },
  };
}

/**
 * A real drag of the bare pane as a hand makes it: the press, a moment later the move, and once
 * the page drew that the release, the other way with every call so that the view stays where it
 * was. The move is alone in its frame, so the answer the probe takes is the answer to the move.
 * Sent at once, the press and the release are in that frame too: on a board of 200 models at
 * rest that was 138.4 ms where a move after a press took 85.8 ms. Answers how long the page
 * took for the move's frame, as far as it was waited for.
 */
async function panByHand(
  cdp: CDPSession,
  point: Point,
  way: 1 | -1,
  reach: Point,
  words: PageWords,
): Promise<number> {
  const there = { x: point.x + reach.x * way, y: point.y + reach.y * way };
  const mouse = (type: "mouseMoved" | "mousePressed" | "mouseReleased", at: Point, held: 0 | 1) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x: at.x,
      y: at.y,
      button: type === "mouseMoved" && held === 0 ? "none" : "left",
      buttons: held,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  // No move to the point before the press: the press brings the pointer there, and every
  // event the bench waits for is one more of the page's tasks to wait out while a board loads.
  await mouse("mousePressed", point, 1);
  await sleep(PRESS_HOLD_MS);
  const from = Date.now();
  const answer = words.frame();
  await mouse("mouseMoved", there, 1);
  await answer;
  const took = Date.now() - from;
  await mouse("mouseReleased", there, 0);
  return took;
}

interface Look {
  readonly state: ProbeState;
  readonly pane: { x: number; y: number } | null;
}

const look = (page: Page): Promise<Look> =>
  page.evaluate(() => {
    const bench = window.__boardBench!;
    return { state: bench.state(), pane: bench.panePoint() };
  });

function describeMissing(repository: BenchRepository, state: ProbeState): string {
  const missing = repository.modelNodes.filter((node) => !(node.id in state.ready));
  const named = missing.slice(0, 8).map((node) => `${node.id} (${node.file})`);
  return `${missing.length} of ${repository.modelNodes.length} previews never came: ${named.join(", ")}${missing.length > named.length ? ", …" : ""}`;
}

/**
 * Waits until the board's last preview is painted, and touches nothing. A node that failed, a
 * preview without a picture and a preview that never comes each end the run with an error: a
 * number of such a run would be a number of another board.
 */
async function untilEveryPreview(
  page: Page,
  repository: BenchRepository,
  giveUpAfterMs?: number,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    // The page answers this once the tasks it queued before are done, so while a board loads
    // the answer comes late. The times are the probe's own, taken in the page.
    const state = await stateOf(page);
    if (state.failed.length > 0) {
      const [first] = state.failed;
      throw new Error(
        `${repository.name}: ${state.failed.length} model nodes failed, the first ${first?.id} (${first?.state}): ${first?.text}`,
      );
    }
    if (state.paintedAt !== undefined) {
      if (state.withoutPicture.length > 0) {
        throw new Error(
          `${repository.name}: ready without a picture: ${state.withoutPicture.join(", ")}`,
        );
      }
      return;
    }
    // a load that is panned may be given up: its previews come as fast as the pans let them
    if (giveUpAfterMs !== undefined && Date.now() - started > giveUpAfterMs) return;
    if (Date.now() - started > LOAD_LIMIT_MS) {
      throw new Error(
        `${repository.name}: after ${LOAD_LIMIT_MS} ms ${describeMissing(repository, state)}`,
      );
    }
    await sleep(100);
  }
}

/**
 * Pans the board at `pane` for as long as `during` runs, from the moment the board has drawn:
 * the next pan once the last one was answered and as long again has passed. The pans wait for
 * nothing the bench asks of the page. A question of the bench is answered behind the load's own
 * tasks, an input ahead of them, as a person's is; that the board drew, and that a pan was
 * answered, the probe says by itself. Before the board has drawn a pan counts for nothing, and
 * the browser drops an input that comes before a page's first frame.
 */
async function panDuring<T>(
  cdp: CDPSession,
  pane: Point,
  words: PageWords,
  during: () => Promise<T>,
): Promise<T> {
  let ended = false;
  const panning = (async () => {
    let way: 1 | -1 = 1;
    while (!ended) {
      if (!words.drawn()) {
        await sleep(5);
        continue;
      }
      // one that was on its way when the page went is no failure of the run
      const took = await panByHand(cdp, pane, way, LOAD_REACH, words).catch(() => 0);
      way = way === 1 ? -1 : 1;
      await sleep(Math.max(PAN_REST_MS, took));
    }
  })();
  try {
    return await during();
  } finally {
    ended = true;
    await panning;
  }
}

function yardstick(): number {
  const from = performance.now();
  let sum = 0;
  for (let step = 0; step < 100_000_000; step++) sum += step % 7;
  if (sum < 0) throw new Error("unreachable");
  return performance.now() - from;
}

// the loop of `yardstick`, as the text a worker thread runs
const YARDSTICK = "let sum = 0; for (let step = 0; step < 100_000_000; step++) sum += step % 7;";
const YARDSTICK_THREADS = 6;

/** The yardstick on `YARDSTICK_THREADS` threads at once, their start included. */
function yardstickTogether(): Promise<number> {
  const from = performance.now();
  return new Promise((done) => {
    let left = YARDSTICK_THREADS;
    for (let thread = 0; thread < YARDSTICK_THREADS; thread++) {
      new Worker(YARDSTICK, { eval: true }).once("exit", () => {
        left -= 1;
        if (left === 0) done(performance.now() - from);
      });
    }
  });
}

const metricsOf = async (cdp: CDPSession): Promise<Readonly<Record<string, number>>> => {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
};

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? sorted[middle]
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return value ?? 0;
};

/** The load's numbers from what the probe saw; `metrics` are the browser's own sums, where read. */
export function loadNumbers(
  state: ProbeState,
  metrics: Readonly<Record<string, number>>,
): LoadNumbers {
  const { drawnAt, paintedAt } = state;
  if (drawnAt === undefined || paintedAt === undefined) throw new Error("the board never drew");
  const answer = (pan: PanAnswer): number => pan.answered - pan.moved;
  const before = state.pans.filter((pan) => pan.moved >= drawnAt && pan.moved <= paintedAt);
  // the pans after T2 count as well: a board whose previews all came while the first was held
  const after = state.pans.filter((pan) => pan.moved > paintedAt);
  const first = [...before, ...after].find((pan) => answer(pan) <= ANSWERED_MS);
  const slow = before.filter((pan) => answer(pan) > ANSWERED_MS);
  const lastSlow = slow.at(-1);
  const tasks = state.longTasks.filter((task) => task.start < paintedAt);
  const ms = (name: string): number => round((metrics[name] ?? 0) * 1000);
  return {
    t1Ms: first && round(first.answered),
    t1LastSlowMs: first && round(Math.max(first.answered, lastSlow?.answered ?? 0)),
    restPanMs: round(median(after.map(answer))),
    slowestPanMs: round(Math.max(0, ...before.map(answer))),
    pans: before.length,
    pansInTime: before.length - slow.length,
    drawnMs: round(drawnAt),
    t2Ms: round(paintedAt),
    longestTaskMs: round(Math.max(0, ...tasks.map((task) => task.duration))),
    blockedMs: round(
      tasks.reduce((sum, task) => sum + Math.max(0, task.duration - BLOCKING_MS), 0),
    ),
    scriptMs: ms("ScriptDuration"),
    layoutMs: ms("LayoutDuration"),
    styleMs: ms("RecalcStyleDuration"),
    taskMs: ms("TaskDuration"),
  };
}

/**
 * What the probe saw of a load that was panned throughout. `state.paintedAt` is undefined where
 * the load was given up before its last preview: every pan up to that moment is then one of
 * the load.
 */
export function answerNumbers(state: ProbeState): AnswerNumbers {
  const { drawnAt, paintedAt } = state;
  if (drawnAt === undefined) throw new Error("the board never drew");
  const answer = (pan: PanAnswer): number => pan.answered - pan.moved;
  const end = paintedAt ?? Infinity;
  const during = state.pans.filter((pan) => pan.moved >= drawnAt && pan.moved <= end);
  // the pans after T2 count as well: a board whose previews all came while the first was held
  const after = state.pans.filter((pan) => pan.moved > end);
  const first = [...during, ...after].find((pan) => answer(pan) <= ANSWERED_MS);
  const slow = during.filter((pan) => answer(pan) > ANSWERED_MS);
  return {
    t1Ms: first && round(first.answered),
    t1LastSlowMs: first && round(Math.max(first.answered, slow.at(-1)?.answered ?? 0)),
    pans: during.length,
    pansInTime: during.length - slow.length,
    medianPanMs: round(median(during.map(answer))),
    slowestPanMs: round(Math.max(0, ...during.map(answer))),
    drawnMs: round(drawnAt),
    t2Ms: paintedAt === undefined ? undefined : round(paintedAt),
  };
}

/** The resident memory of the renderer that did the page's work, from the process table. */
async function rendererMB(browser: Browser): Promise<number | undefined> {
  if (!existsSync("/proc/self/status")) return undefined;
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo");
    const renderers = processInfo.filter((process) => process.type === "renderer");
    const busiest = renderers.sort((a, b) => b.cpuTime - a.cpuTime)[0];
    if (!busiest) return undefined;
    const status = readFileSync(`/proc/${busiest.id}/status`, "utf8");
    const resident = /^VmRSS:\s+(\d+) kB$/m.exec(status)?.[1];
    return resident === undefined ? undefined : round(Number(resident) / 1024);
  } catch {
    return undefined;
  } finally {
    await session.detach();
  }
}

async function memoryNumbers(
  browser: Browser,
  page: Page,
  cdp: CDPSession,
): Promise<MemoryNumbers> {
  await cdp.send("HeapProfiler.collectGarbage");
  await sleep(200);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  // after the collection: a node that nothing holds any more is not the board's
  const metrics = await metricsOf(cdp);
  const counts: PageCounts = await page.evaluate(() => window.__boardBench!.counts());
  return {
    heapMB: round(usedSize / 1024 / 1024),
    domNodes: metrics.Nodes ?? 0,
    elements: counts.elements,
    modelers: counts.modelers,
    rendererMB: await rendererMB(browser),
  };
}

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly pid: number;
  readonly tid: number;
  readonly ts: number;
  readonly dur?: number;
  readonly args?: { readonly name?: string };
}

/** Frames the compositor drew and the main thread's longest task, from a trace of the script. */
function readTrace(trace: Buffer): { frames: number; longestTaskMs: number } {
  const { traceEvents } = JSON.parse(trace.toString("utf8")) as { traceEvents: TraceEvent[] };
  const drawn = new Map<number, number>();
  for (const event of traceEvents) {
    if (event.name === "DrawFrame") drawn.set(event.pid, (drawn.get(event.pid) ?? 0) + 1);
  }
  // the page's renderer is the process that drew the most
  const [renderer, frames] = [...drawn].sort((a, b) => b[1] - a[1])[0] ?? [undefined, 0];
  const main = traceEvents.find(
    (event) =>
      event.pid === renderer &&
      event.name === "thread_name" &&
      event.args?.name === "CrRendererMain",
  )?.tid;
  const tasks = traceEvents.filter(
    (event) => event.pid === renderer && event.tid === main && event.name === "RunTask",
  );
  return {
    frames,
    longestTaskMs: round(Math.max(0, ...tasks.map((task) => (task.dur ?? 0) / 1000))),
  };
}

const TRACED = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
];
/** one input every frame of a 60 Hz screen, where the page keeps up */
const CADENCE_MS = 16;

/**
 * Two seconds as a person would spend them on a board at rest: a second of dragging the pane,
 * half a second of wheeling in and the same wheel steps out again.
 */
async function motionNumbers(browser: Browser, page: Page): Promise<MotionNumbers> {
  const point = await page.evaluate(() => window.__boardBench!.panePoint());
  if (!point) throw new Error("no point of the window shows the bare pane");
  const answered = (await stateOf(page)).pans.length;
  await browser.startTracing(page, { categories: TRACED });
  await page.evaluate(() => window.__boardBench!.startFrames());
  const started = Date.now();
  const paced = async (
    until: number,
    step: (elapsed: number) => Promise<void>,
  ): Promise<number> => {
    const from = Date.now();
    let steps = 0;
    while (Date.now() - from < until) {
      await step(Date.now() - from);
      steps += 1;
      const next = from + steps * CADENCE_MS;
      if (next > Date.now()) await sleep(next - Date.now());
    }
    return steps;
  };

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const moves = await paced(1000, (elapsed) => {
    const angle = (elapsed / 1000) * 2 * Math.PI;
    return page.mouse.move(point.x + 80 * Math.sin(angle), point.y + 50 * Math.sin(2 * angle));
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  const wheels = await paced(500, () => page.mouse.wheel(0, -30));
  for (let step = 0; step < wheels; step++) {
    const from = Date.now();
    await page.mouse.wheel(0, 30);
    if (Date.now() - from < CADENCE_MS) await sleep(CADENCE_MS - (Date.now() - from));
  }

  const scriptMs = Date.now() - started;
  const window_: FrameWindow = await page.evaluate(() => window.__boardBench!.stopFrames());
  const trace = readTrace(await browser.stopTracing());
  const state = await stateOf(page);
  const gaps = window_.frames.slice(1).map((time, index) => time - (window_.frames[index] ?? time));
  return {
    frames: trace.frames,
    scriptMs,
    framesPerSecond: round(trace.frames / (scriptMs / 1000)),
    pageFrames: window_.frames.length,
    longestFrameGapMs: round(Math.max(0, ...gaps)),
    longestTaskMs: trace.longestTaskMs,
    panAnswerMs: round(median(state.pans.slice(answered).map((pan) => pan.answered - pan.moved))),
    moves,
    wheels: wheels * 2,
  };
}

const ARM_LIMIT_MS = 60_000;

function elapsed(times: ArmTimes, what: string): { switched: number; rested: number } {
  const { asked, switched, rested } = times;
  if (asked === undefined || switched === undefined || rested === undefined) {
    throw new Error(`${what}: ${times.problem ?? "nothing happened"}`);
  }
  return { switched: round(switched - asked), rested: round(rested - asked) };
}

/**
 * Arms a model by a real double-click on its preview and leaves it by a click on Done: of the
 * first node's notation the node nearest the middle of the window, so that every board of all
 * notations arms the same kind of model.
 */
async function armNumbers(page: Page, repository: BenchRepository): Promise<ArmNumbers> {
  // the script left the board somewhere: the shell's fit shows the board again
  await page.locator('[data-chrome="zoom"] [data-zoom="fit"]').click();
  await sleep(400);
  const notation = repository.modelNodes[0]?.notation;
  const candidates = repository.modelNodes.filter((node) => node.notation === notation);
  const at = await page.evaluate(
    (ids) => window.__boardBench!.armTarget(ids),
    candidates.map((node) => node.id),
  );
  if (!at) throw new Error(`no ${notation} node of ${repository.name} is in the window`);
  const nodeId = at.id;
  await page.evaluate(([id, limit]) => window.__boardBench!.watchArm(id, limit), [
    nodeId,
    ARM_LIMIT_MS,
  ] as const);
  await page.mouse.dblclick(at.x, at.y);
  const armed = elapsed(
    await page.evaluate(() => window.__boardBench!.watched()),
    `a double-click did not arm ${nodeId}`,
  );
  await sleep(300);
  const done = await page.evaluate(() => window.__boardBench!.donePoint());
  if (!done) throw new Error("the Done control is not in the window");
  await page.evaluate((limit) => window.__boardBench!.watchLeave(limit), ARM_LIMIT_MS);
  await page.mouse.click(done.x, done.y);
  const left = elapsed(
    await page.evaluate(() => window.__boardBench!.watched()),
    "a click on Done did not leave the model",
  );
  return { armedMs: armed.switched, armRestedMs: armed.rested, leftMs: left.switched };
}

export interface LoadOptions {
  readonly context: BrowserContext;
  readonly repository: BenchRepository;
  /** navigates the page to the board; the probe is installed by the context */
  open(page: Page): Promise<void>;
}

export interface MeasureOptions extends LoadOptions {
  readonly browser: Browser;
  /** false: T2 and M alone, for a load that only warms the browser */
  readonly whole: boolean;
}

export interface AnswerOptions extends LoadOptions {
  /** where the fitted board shows bare pane: `RunNumbers.pane` of a quiet load of this board */
  readonly pane: Point;
  /** how long the panned load may take until its last preview before it is read as it stands */
  readonly giveUpAfterMs: number;
}

/** A page of its own for one load, closed again; a failure comes with a picture of the page. */
async function inPage<T>(
  { context, repository }: LoadOptions,
  measure: (page: Page, cdp: CDPSession) => Promise<T>,
): Promise<T> {
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => {
    if (!error.message.includes(RESIZE_OBSERVER)) problems.push(error.message);
  });
  try {
    const cdp = await context.newCDPSession(page);
    // before the navigation: the sums then hold the whole load
    await cdp.send("Performance.enable");
    const measured = await measure(page, cdp);
    if (problems.length > 0) throw new Error(`the page reported: ${problems.join(" | ")}`);
    return measured;
  } catch (error) {
    // what a person would see at that moment, beside the error
    mkdirSync(FAILURES, { recursive: true });
    const picture = join(FAILURES, `${repository.name}-${Date.now()}.png`);
    await page.screenshot({ path: picture }).catch(() => undefined);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} (the page: ${picture})`,
      {
        cause: error,
      },
    );
  } finally {
    await page.close();
  }
}

const withoutPans = ({
  t1Ms: _t1,
  t1LastSlowMs: _lastSlow,
  slowestPanMs: _slowest,
  pans: _pans,
  pansInTime: _inTime,
  ...quiet
}: LoadNumbers): QuietNumbers => quiet;

/** One load that nobody touches until its last preview is drawn, in a page of its own. */
export function measureLoad(options: MeasureOptions): Promise<RunNumbers> {
  const { browser, repository } = options;
  return inPage(options, async (page, cdp) => {
    const yardstickMs = round(yardstick());
    const yardstickSixMs = round(await yardstickTogether());
    const words = await wordsOf(page);
    await options.open(page);
    await page.waitForFunction(() => window.__boardBench !== undefined, undefined, {
      timeout: LOAD_LIMIT_MS,
    });
    await untilEveryPreview(page, repository);
    // a second of pans after the last preview: what a person meets at rest
    for (let step = 0; step < 8; step++) {
      const { pane } = await look(page);
      if (pane) await panByHand(cdp, pane, step % 2 === 0 ? 1 : -1, REST_REACH, words);
      await sleep(120);
    }
    const state = await stateOf(page);
    const pane = await page.evaluate(
      (room) => window.__boardBench!.roomyPanePoint(room),
      LOAD_ROOM_PX,
    );
    await page.evaluate(() => window.__boardBench!.panesOnly(false));
    await sleep(1000);
    const load = withoutPans(loadNumbers(state, await metricsOf(cdp)));
    const memory = await memoryNumbers(browser, page, cdp);
    const motion = options.whole ? await motionNumbers(browser, page) : undefined;
    const arm = options.whole ? await armNumbers(page, repository) : undefined;
    return { yardstickMs, yardstickSixMs, load, memory, motion, arm, pane: pane ?? undefined };
  });
}

/**
 * One more load of the board in a page of its own, panned from its first moment until a second
 * after its last preview: T1, and how the pans of the load were answered.
 */
export function measureAnswers(options: AnswerOptions): Promise<AnswerNumbers> {
  const { repository, pane } = options;
  return inPage(options, async (page, cdp) => {
    const words = await wordsOf(page);
    await options.open(page);
    await page.waitForFunction(() => window.__boardBench !== undefined, undefined, {
      timeout: LOAD_LIMIT_MS,
    });
    const state = await panDuring(cdp, pane, words, async () => {
      await untilEveryPreview(page, repository, options.giveUpAfterMs);
      await sleep(1000);
      return stateOf(page);
    });
    // every pan started at one point that was found on another load of this board: where the
    // fit came out another one, the presses met a node and the page was never panned
    if (!state.pans.some((one) => one.shown)) {
      throw new Error(
        `${repository.name}: no pan at ${pane.x}, ${pane.y} moved the board: the point is not bare pane in this load`,
      );
    }
    return answerNumbers(state);
  });
}
