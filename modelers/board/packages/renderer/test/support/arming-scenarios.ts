/**
 * The arm rules at work (src/arming/board-arming.ts) on a bench of fakes, driven by scripts. The
 * bench is what the rules read and call and nothing more: React Flow's store as far as they read
 * it, a runtime that records which node is armed and shows it in the DOM as the board's surface
 * does, and a clock a script steps by hand. Every script is one scenario, and what the rules did
 * in it is its trace: each viewport write, each armed node, the counters and the moves.
 *
 * The traces stand in for designIQ's 193 arm-rule rows, which need the product's editors: they
 * were recorded from `createBoardArming` while it was one function, and a split that changes what
 * the rules do changes a trace.
 */
import type {
  ArmBy,
  ArmCounters,
  ArmingHost,
  ArmPolicy,
  ArmState,
  ArmTransition,
  BoardArming,
  FlowStore,
} from "../../src/arming/arming-api.js";
import { createBoardArming } from "../../src/arming/board-arming.js";
import type { ArmedZoom, ArmReturn, ArmZoom, Viewport } from "../../src/arming/types.js";

// ── what a trace holds ──

export type Call =
  { call: "setViewport"; to: Viewport } | { call: "setArmedId"; nodeId: string | null };

export interface Step {
  /** what the script did, numbered from 1 */
  step: string;
  /** the stepped clock when it was done, ms */
  at: number;
  /** what the script got back or saw of an event it sent */
  result?: string | undefined;
  /**
   * What was called on the store and on the runtime inside the step, in order: by the rules, and
   * by the script where the step is itself a viewport write or the runtime's own arming
   */
  calls: Call[];
  /** what was called in a microtask after it */
  later: Call[];
  /** the steps whose promise (an arming, a disarm, a rest) settled with this one */
  settled: number[];
  state: ArmState;
  /** animation frames asked for and not yet run */
  framesAsked: number;
}

export interface Trace {
  name: string;
  policy: ArmPolicy;
  starts: Viewport;
  steps: Step[];
  rests: Viewport;
  counters: ArmCounters;
  /** `measuredMs` is 0 in every record: the trace is compared, the clock is the script's */
  transitions: ArmTransition[];
  lastTransition: ArmTransition | null;
  /** only the first and the last step and move go into the text */
  brief: boolean;
}

// ── the bench ──

/** the board's own box on the page, away from the corner so that a pointer's place has to be reckoned */
const BOARD = { left: 40, top: 30, width: 800, height: 600 };
/** the toolbar's band ends 52 px under the board's top edge */
const TOOLBAR = { left: 12, top: 12, width: 300, height: 40 };

const MOTION_TOKEN = "--cd-motion-base";
const EASE_TOKEN = "--cd-ease";
/** the design system's own values (theme/cd-tokens.generated.css) */
const MOTION = "250ms";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

interface BenchNode {
  id: string;
  x: number;
  y: number;
  /** absent: React Flow has not measured the node yet */
  size?: { width: number; height: number } | undefined;
  model: boolean;
}

export const ORDER = "n_order";
export const INVOICE = "n_invoice";
/** longer than the board's box on both axes */
export const LONG = "n_long";
export const UNMEASURED = "n_unmeasured";
/** a note: on the board, and no model */
export const NOTE = "n_note";

const NODES: readonly BenchNode[] = [
  { id: ORDER, x: 100, y: 120, size: { width: 400, height: 300 }, model: true },
  { id: INVOICE, x: 900, y: 700, size: { width: 320, height: 240 }, model: true },
  { id: LONG, x: 2000, y: 0, size: { width: 1600, height: 1200 }, model: true },
  { id: UNMEASURED, x: 0, y: 0, model: true },
  { id: NOTE, x: 600, y: 60, size: { width: 200, height: 120 }, model: false },
];

export type Target =
  | "the pane"
  | "the toolbar"
  | "the armed node's body"
  | "the editor in the overlay layer"
  | "a text field on the board"
  | "an editable text on the board"
  | "a button beside the board"
  | "a text field beside the board";

export interface BoardSetup {
  /** where the board stands when the script begins; default START */
  viewport?: Viewport | undefined;
  /** the rules whoever mounted the board gave; the others are the default (exact1, disarm, stay) */
  rules?:
    | {
        armzoom?: ArmZoom | undefined;
        armedzoom?: ArmedZoom | undefined;
        armreturn?: ArmReturn | undefined;
      }
    | undefined;
  armmotion?: number | undefined;
  /** the node the URL arms on load */
  arm?: string | undefined;
  inputScope?: "page" | undefined;
  reducedMotion?: true | undefined;
  /** the page's motion token; null: the page has none. Default: the design system's */
  motionToken?: string | null | undefined;
  /** the page's ease token; null: the page has none. Default: the design system's */
  easeToken?: string | null | undefined;
  /** React Flow has not run its first fit yet */
  fitQueued?: true | undefined;
  /** false: the board has no toolbar, so no band is kept clear of an armed node */
  toolbar?: false | undefined;
  /** the runtime shows a newly armed or disarmed node a microtask late, as no board does */
  lateCommit?: true | undefined;
}

/** what a script does to the board; every call is one step of the trace */
export interface Bench {
  /** the board's `arm`: a node through its rules, or null for a disarm */
  arm(nodeId: string | null, by?: ArmBy): Promise<void>;
  beforeZoom(changes: boolean): Promise<void>;
  /** `ms` later, the frames asked for run; `times` such frames in a row */
  frame(ms?: number, times?: number): Promise<void>;
  wheel(target: Target, deltaY: number): Promise<void>;
  press(target: Target): Promise<void>;
  release(by: "pointerup" | "pointercancel" | "blur"): Promise<void>;
  key(target: Target, key: string): Promise<void>;
  /** somebody else moves the board: a script's setViewport */
  write(to: Viewport): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  queueFit(queued: boolean): Promise<void>;
  /** the node is no model any more */
  forget(nodeId: string): Promise<void>;
  /** the node's editor is through its first import */
  editorUp(nodeId: string): Promise<void>;
  /** the runtime's own setArmedId, past the rules */
  runtimeArms(nodeId: string | null): Promise<void>;
  whenRest(): Promise<void>;
  undo(what: "attach" | "watch"): Promise<void>;
}

/** replaces a member of a global for the length of a scenario; returns the undo */
function swap<T extends object, K extends keyof T>(target: T, key: K, fake: T[K]): () => void {
  const own = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value: fake });
  return () => {
    if (own) Object.defineProperty(target, key, own);
    else Reflect.deleteProperty(target, key);
  };
}

interface Clock {
  now(): number;
  framesAsked(): number;
  /** `ms` later: every frame asked for before this one runs, in the order asked */
  frame(ms: number): void;
  restore(): void;
}

function installClock(): Clock {
  let time = 0;
  let serial = 0;
  const asked = new Map<number, FrameRequestCallback>();
  const restores = [
    swap(performance, "now", () => time),
    swap(window, "requestAnimationFrame", (callback: FrameRequestCallback) => {
      asked.set(++serial, callback);
      return serial;
    }),
    swap(window, "cancelAnimationFrame", (id: number) => void asked.delete(id)),
  ];
  return {
    now: () => time,
    framesAsked: () => asked.size,
    frame(ms) {
      time += ms;
      for (const id of [...asked.keys()]) {
        // a frame an earlier callback of this round cancelled does not run, as in a browser
        const callback = asked.get(id);
        if (!callback) continue;
        asked.delete(id);
        callback(time);
      }
    },
    restore() {
      for (const restore of restores) restore();
    },
  };
}

/** sets or removes a custom property on the page's root for the length of a scenario; returns the undo */
function setToken(name: string, value: string | null): () => void {
  const { style } = document.documentElement;
  const before = style.getPropertyValue(name);
  if (value === null) style.removeProperty(name);
  else style.setProperty(name, value);
  return () => {
    if (before === "") style.removeProperty(name);
    else style.setProperty(name, before);
  };
}

function reduceMotion(): () => void {
  const real = window.matchMedia.bind(window);
  return swap(window, "matchMedia", (query: string) =>
    query === REDUCED_MOTION ? ({ matches: true, media: query } as MediaQueryList) : real(query),
  );
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  style: string,
  parent: Element,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  made.style.cssText = style;
  parent.appendChild(made);
  return made;
}

interface BenchDom {
  /** React Flow's own element: what the store has as domNode and the guards are attached to */
  board: HTMLDivElement;
  target(name: Target): Element;
  /** the DOM as the board's surface leaves it for this armed node */
  show(armedId: string | null): void;
  resize(width: number, height: number): void;
  remove(): void;
}

function buildDom(withToolbar: boolean): BenchDom {
  const page = make("div", "arming-bench", "position:fixed;left:0;top:0", document.body);
  const board = make(
    "div",
    "react-flow",
    `position:absolute;left:${BOARD.left}px;top:${BOARD.top}px;width:${BOARD.width}px;height:${BOARD.height}px;overflow:hidden`,
    page,
  );
  const renderer = make("div", "react-flow__renderer", "position:absolute;inset:0", board);
  const pane = make("div", "react-flow__pane", "position:absolute;inset:0", renderer);
  const viewport = make("div", "react-flow__viewport", "", renderer);
  for (const node of NODES.filter(({ model }) => model)) {
    const frame = make("div", "board-node", "", viewport);
    frame.dataset.id = node.id;
    frame.dataset.armed = "false";
    make("div", "board-node__body", "", frame);
  }
  const fieldOnBoard = make("textarea", "board-text__editor", "", viewport);
  const editableOnBoard = make("div", "", "", viewport);
  editableOnBoard.contentEditable = "true";
  const toolbar = withToolbar
    ? make(
        "div",
        "board-toolbar",
        `position:absolute;left:${TOOLBAR.left}px;top:${TOOLBAR.top}px;width:${TOOLBAR.width}px;height:${TOOLBAR.height}px`,
        board,
      )
    : null;
  const layer = make("div", "board-overlay-layer nodrag nopan nowheel nokey", "", board);
  const buttonBeside = make("button", "", "", page);
  const fieldBeside = make("input", "", "", page);

  const armedBody = (): Element => {
    const body = viewport.querySelector('.board-node[data-armed="true"] > .board-node__body');
    if (!body) throw new Error("arming bench: no node is shown as armed");
    return body;
  };
  const editorInLayer = (): Element => {
    const editor = layer.querySelector(":scope > .board-engine");
    if (!editor) throw new Error("arming bench: no editor is in the overlay layer");
    return editor;
  };
  const targets: Record<Target, () => Element> = {
    "the pane": () => pane,
    "the toolbar": () => {
      if (!toolbar) throw new Error("arming bench: this board has no toolbar");
      return toolbar;
    },
    "the armed node's body": armedBody,
    "the editor in the overlay layer": editorInLayer,
    "a text field on the board": () => fieldOnBoard,
    "an editable text on the board": () => editableOnBoard,
    "a button beside the board": () => buttonBeside,
    "a text field beside the board": () => fieldBeside,
  };

  return {
    board,
    target: (name) => targets[name](),
    show(armedId) {
      for (const frame of viewport.querySelectorAll<HTMLElement>(".board-node")) {
        const armed = frame.dataset.id === armedId;
        frame.dataset.armed = String(armed);
        frame.querySelector(".board-node__body")?.classList.toggle("nowheel", armed);
      }
      layer.replaceChildren();
      if (armedId !== null) make("div", "board-engine", "", layer).dataset.armed = "true";
    },
    resize(width, height) {
      board.style.width = `${width}px`;
      board.style.height = `${height}px`;
    },
    remove: () => page.remove(),
  };
}

/** React Flow's store as far as the arm rules read it */
interface FlowFields {
  transform: [number, number, number];
  panZoom: { setViewport(to: Viewport): Promise<boolean> } | null;
  nodeLookup: Map<
    string,
    {
      measured: { width?: number; height?: number };
      internals: { positionAbsolute: { x: number; y: number } };
    }
  >;
  domNode: HTMLDivElement | null;
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
  fitViewQueued: boolean;
}

type FlowListener = (state: FlowFields, previous: FlowFields) => void;

interface FakeFlow {
  store: FlowStore;
  viewport(): Viewport;
  set(patch: Partial<FlowFields>): void;
}

/** a store as React Flow's is: a new state object per change, every listener told at once and in turn */
function createFlow(fields: Omit<FlowFields, "panZoom">, record: (call: Call) => void): FakeFlow {
  const listeners = new Set<FlowListener>();
  const set = (patch: Partial<FlowFields>): void => {
    const previous = state;
    state = { ...previous, ...patch };
    for (const listener of listeners) listener(state, previous);
  };
  let state: FlowFields = {
    ...fields,
    panZoom: {
      setViewport(to) {
        record({ call: "setViewport", to: { ...to } });
        // as React Flow applies a viewport without a duration: a new transform array, inside the call
        set({ transform: [to.x, to.y, to.zoom] });
        return Promise.resolve(true);
      },
    },
  };
  const store = {
    getState: (): FlowFields => state,
    subscribe(listener: FlowListener): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    store: store as unknown as FlowStore,
    viewport() {
      const [x, y, zoom] = state.transform;
      return { x, y, zoom };
    },
    set,
  };
}

interface FakeHost extends ArmingHost {
  forget(nodeId: string): void;
  editorUp(nodeId: string): void;
}

function createHost(setup: BoardSetup, dom: BenchDom, record: (call: Call) => void): FakeHost {
  const models = new Set(NODES.filter(({ model }) => model).map(({ id }) => id));
  const editorsUp = new Set<string>();
  let armed: string | null = null;
  const counters: ArmCounters = {
    transitions: 0,
    disarmsBeforeZoom: 0,
    disarmsAtTick: 0,
    zoomsRefused: 0,
    zoomsUndone: 0,
    armedZoomTicks: 0,
    lateDisarms: 0,
  };
  return {
    params: {
      viewport: null,
      arm: setup.arm ?? null,
      armzoom: setup.rules?.armzoom ?? null,
      armedzoom: setup.rules?.armedzoom ?? null,
      armreturn: setup.rules?.armreturn ?? null,
      armmotion: setup.armmotion ?? null,
    },
    isModel: (nodeId) => models.has(nodeId),
    armedId: () => armed,
    setArmedId(nodeId) {
      armed = nodeId;
      record({ call: "setArmedId", nodeId });
      if (setup.lateCommit) queueMicrotask(() => dom.show(armed));
      else dom.show(armed);
    },
    mounted: (nodeId) => (editorsUp.has(nodeId) ? true : undefined),
    counters: { arm: counters },
    inputScope: setup.inputScope ?? "board",
    forget: (nodeId) => void models.delete(nodeId),
    editorUp: (nodeId) => void editorsUp.add(nodeId),
  };
}

/** lets every promise that is settled by now run what waits for it */
async function microtasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

/** sends an event as a browser would and says what became of it */
function send(target: Element, event: Event): string {
  let reached = false;
  const seen = (): void => {
    reached = true;
  };
  target.addEventListener(event.type, seen);
  target.dispatchEvent(event);
  target.removeEventListener(event.type, seen);
  return `${event.defaultPrevented ? "prevented" : "not prevented"}, ${
    reached ? "reaches its target" : "stopped on the way"
  }`;
}

const EVENT_INIT = { bubbles: true, cancelable: true, composed: true, view: window } as const;
const POINTER_INIT = { ...EVENT_INIT, pointerId: 1, pointerType: "mouse", isPrimary: true };

interface Running {
  arming: BoardArming;
  clock: Clock;
  dom: BenchDom;
  flow: FakeFlow;
  host: FakeHost;
  steps: Step[];
  /** where a call of the rules is written down right now */
  calls: { into: Call[] };
  undoAttach(): void;
  undoWatch(): void;
}

function createBench(running: Running): Bench {
  const { arming, clock, dom, flow, host, steps, calls } = running;
  /** the step that asked, per promise the rules handed out */
  const askedIn = new Map<Promise<void>, number>();
  let settled: number[] = [];

  const step = async (label: string, act: () => string | void): Promise<void> => {
    const entry: Step = {
      step: `${steps.length + 1}. ${label}`,
      at: clock.now(),
      calls: [],
      later: [],
      settled: [],
      state: arming.state(),
      framesAsked: 0,
    };
    steps.push(entry);
    calls.into = entry.calls;
    const result = act();
    calls.into = entry.later;
    await microtasks();
    entry.at = clock.now();
    if (typeof result === "string") entry.result = result;
    entry.settled = settled;
    settled = [];
    entry.state = arming.state();
    entry.framesAsked = clock.framesAsked();
  };

  /** a promise the rules handed out: new, or the one of an earlier step */
  const promised = (promise: Promise<void>): string => {
    const earlier = askedIn.get(promise);
    if (earlier !== undefined) return `the promise of step ${earlier}`;
    const asked = steps.length;
    askedIn.set(promise, asked);
    void promise.then(() => settled.push(asked));
    return "a new promise";
  };

  return {
    arm(nodeId, by) {
      const how = by ? ` by ${by.source}${by.point ? ` at ${by.point.x}, ${by.point.y}` : ""}` : "";
      // detached, as the board's context hands it out
      const { arm } = arming;
      return step(`arm ${nodeId ?? "none"}${how}`, () =>
        promised(by ? arm(nodeId, by) : arm(nodeId)),
      );
    },
    beforeZoom: (changes) =>
      step(`ask beforeZoom(${changes})`, () => String(arming.beforeZoom(changes))),
    async frame(ms = 100, times = 1) {
      for (let round = 0; round < times; round++) await step("frame", () => clock.frame(ms));
    },
    wheel: (target, deltaY) =>
      step(`wheel on ${target}, deltaY ${deltaY}`, () =>
        send(dom.target(target), new WheelEvent("wheel", { ...EVENT_INIT, deltaY })),
      ),
    press: (target) =>
      step(`press on ${target}`, () =>
        send(
          dom.target(target),
          new PointerEvent("pointerdown", { ...POINTER_INIT, button: 0, buttons: 1 }),
        ),
      ),
    release: (by) =>
      step(`release by ${by}`, () => {
        if (by === "blur") window.dispatchEvent(new FocusEvent("blur"));
        else document.body.dispatchEvent(new PointerEvent(by, { ...POINTER_INIT, button: 0 }));
      }),
    key: (target, key) =>
      step(`key ${key} on ${target}`, () =>
        send(dom.target(target), new KeyboardEvent("keydown", { ...EVENT_INIT, key })),
      ),
    write: (to) =>
      step(
        `a script writes the viewport ${shownViewport(to)}`,
        () => void flow.store.getState().panZoom?.setViewport(to),
      ),
    resize: (width, height) =>
      step(`the board's box becomes ${width} x ${height}`, () => {
        dom.resize(width, height);
        flow.set({ width, height });
      }),
    queueFit: (queued) =>
      step(queued ? "a fit is queued" : "the fit is through", () =>
        flow.set({ fitViewQueued: queued }),
      ),
    forget: (nodeId) => step(`${nodeId} is no model any more`, () => host.forget(nodeId)),
    editorUp: (nodeId) => step(`the editor of ${nodeId} is up`, () => host.editorUp(nodeId)),
    runtimeArms: (nodeId) =>
      step(`the runtime ${nodeId === null ? "disarms" : `arms ${nodeId}`}, past the rules`, () =>
        host.setArmedId(nodeId),
      ),
    whenRest: () => step("ask when the board rests", () => promised(arming.whenRest())),
    undo: (what) =>
      step(`undo ${what}`, what === "attach" ? running.undoAttach : running.undoWatch),
  };
}

// ── a scenario and its run ──

/** how a move ended: armed, returned (the way back), moved on (another look follows), or what interrupted it */
export type MoveEnd =
  | "armed"
  | "returned"
  | "moved on"
  | "running"
  | "wheel"
  | "pointer"
  | "key"
  | "arm"
  | "disarm"
  | "zoom"
  | "foreign"
  | "gone";

/** what a scenario claims, written by hand: the test holds the trace against it */
export interface Expected {
  /** the node that is armed when the script is through */
  armed: string | null;
  /** how each move ended, in order */
  moves: MoveEnd[];
  /** the counters that are not 0; `transitions` is the number of moves unless it is given here */
  counted?: Partial<ArmCounters> | undefined;
  /** where the board stands when the script is through, where the scenario fixes it */
  rests?: Viewport | undefined;
}

export interface Scenario {
  name: string;
  /** the board the script finds; what is left out is the default */
  board?: BoardSetup | undefined;
  script(bench: Bench): Promise<void>;
  expected: Expected;
  /** the trace's text keeps only the first and the last step and move */
  brief?: true | undefined;
  /** the script arms a node with the runtime's own call while the board moves, as no board does */
  armsPastTheRules?: true | undefined;
}

export function moveEnd(record: ArmTransition): MoveEnd {
  if (record.running) return "running";
  if (record.interrupted) return (record.interruptedBy ?? "foreign") as MoveEnd;
  if (record.armed) return "armed";
  return record.purpose === "return" ? "returned" : "moved on";
}

const once = (act: () => void): (() => void) => {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    act();
  };
};

/** runs the script against the arm rules on a bench of its own and returns what they did */
export async function runScenario(scenario: Scenario): Promise<Trace> {
  const setup = scenario.board ?? {};
  const starts = setup.viewport ?? START;
  const dom = buildDom(setup.toolbar !== false);
  const undos: Array<() => void> = [dom.remove];
  try {
    const clock = installClock();
    undos.push(clock.restore);
    undos.push(
      setToken(MOTION_TOKEN, setup.motionToken === undefined ? MOTION : setup.motionToken),
    );
    undos.push(setToken(EASE_TOKEN, setup.easeToken === undefined ? EASE : setup.easeToken));
    if (setup.reducedMotion) undos.push(reduceMotion());

    const before: Call[] = [];
    const calls = { into: before };
    const record = (call: Call): void => void calls.into.push(call);
    const flow = createFlow(
      {
        transform: [starts.x, starts.y, starts.zoom],
        nodeLookup: new Map(
          NODES.map(({ id, x, y, size }) => [
            id,
            { measured: size ? { ...size } : {}, internals: { positionAbsolute: { x, y } } },
          ]),
        ),
        domNode: dom.board,
        width: BOARD.width,
        height: BOARD.height,
        minZoom: 0.1,
        maxZoom: 4,
        fitViewQueued: setup.fitQueued === true,
      },
      record,
    );
    const host = createHost(setup, dom, record);

    const arming = createBoardArming(host, flow.store);
    // in the board's order: the provider's layout effect watches, then the canvas attaches the guards
    const undoWatch = once(arming.watch());
    undos.push(undoWatch);
    const undoAttach = once(arming.attach(dom.board));
    undos.push(undoAttach);

    const steps: Step[] = [];
    const policy = arming.policy(ORDER);
    await scenario.script(
      createBench({ arming, clock, dom, flow, host, steps, calls, undoAttach, undoWatch }),
    );
    if (before.length > 0) {
      throw new Error(`arming bench: the rules called ${shownCalls(before)} before the script`);
    }
    return {
      name: scenario.name,
      policy,
      starts,
      steps,
      rests: flow.viewport(),
      counters: { ...host.counters.arm },
      transitions: arming.transitions().map((move) => ({ ...move, measuredMs: 0 })),
      lastTransition: arming.lastTransition(),
      brief: scenario.brief === true,
    };
  } finally {
    for (const undo of undos.reverse()) undo();
  }
}

// ── the trace as text ──

const rounded = (value: number): number => Math.round(value * 1000) / 1000;

/** x, y, zoom, each rounded to three decimals */
function shownViewport({ x, y, zoom }: Viewport): string {
  return `${rounded(x)}, ${rounded(y)}, ${rounded(zoom)}`;
}

function shownCalls(calls: readonly Call[]): string {
  if (calls.length === 0) return "none";
  return calls
    .map((entry) =>
      entry.call === "setViewport"
        ? `setViewport(${shownViewport(entry.to)})`
        : `setArmedId(${entry.nodeId ?? "null"})`,
    )
    .join(", ");
}

const yesNo = (value: boolean): string => (value ? "yes" : "no");

function shownStep(entry: Step): Record<string, unknown> {
  const { state } = entry;
  return {
    step: entry.step,
    at: entry.at,
    ...(entry.result === undefined ? {} : { result: entry.result }),
    calls: shownCalls(entry.calls),
    ...(entry.later.length === 0 ? {} : { later: shownCalls(entry.later) }),
    ...(entry.settled.length === 0
      ? {}
      : { settled: entry.settled.map((asked) => `step ${asked}`).join(", ") }),
    state: `armed: ${state.armed ?? "none"}, moving: ${yesNo(state.moving)}, target: ${
      state.target ?? "none"
    }, urlPending: ${yesNo(state.urlPending)}, frames asked: ${entry.framesAsked}`,
  };
}

function shownMove(move: ArmTransition): Record<string, unknown> {
  return {
    ...move,
    from: shownViewport(move.from),
    to: shownViewport(move.to),
    end: shownViewport(move.end),
  };
}

function shownPolicy(policy: ArmPolicy): string {
  const given = policy.fromUrl.length === 0 ? "none" : policy.fromUrl.join(" and ");
  return (
    `${policy.armzoom}, ${policy.armedzoom}, ${policy.armreturn} (given: ${given}), ` +
    `motion ${policy.motion} ms from ${policy.motionFrom}, ` +
    `margin ${policy.margin}, tolerance ${policy.tolerance}`
  );
}

/** the first and the last of a list that is too long to keep, and how many were left out between them */
function ends<T>(list: readonly T[], brief: boolean): { kept: readonly T[]; leftOut: number } {
  if (!brief || list.length <= 2) return { kept: list, leftOut: 0 };
  return { kept: [list[0] as T, list[list.length - 1] as T], leftOut: list.length - 2 };
}

function shownTrace(trace: Trace): Record<string, unknown> {
  const steps = ends(trace.steps, trace.brief);
  const moves = ends(trace.transitions, trace.brief);
  return {
    policy: shownPolicy(trace.policy),
    starts: shownViewport(trace.starts),
    steps: steps.kept.map(shownStep),
    ...(steps.leftOut === 0 ? {} : { stepsLeftOut: steps.leftOut }),
    rests: shownViewport(trace.rests),
    counters: trace.counters,
    transitions: moves.kept.map(shownMove),
    ...(moves.leftOut === 0 ? {} : { transitionsLeftOut: moves.leftOut }),
    lastTransition: trace.lastTransition?.id ?? null,
  };
}

/**
 * The traces as the fixture holds them: one object per scenario under its name. No list of plain
 * values is in it, so `JSON.stringify` writes what Prettier would.
 */
export function traceText(traces: readonly Trace[]): string {
  const byName = Object.fromEntries(traces.map((trace) => [trace.name, shownTrace(trace)]));
  return `${JSON.stringify(byName, null, 2)}\n`;
}

// ── the scenarios ──

/** where every scenario begins unless it says otherwise: zoomed out, n_order in the upper left */
export const START: Viewport = { x: 20, y: 30, zoom: 0.5 };
/**
 * Where n_order is armed coming from START: zoom 1 about its centre puts its corner at -30, 15,
 * outside the box under the toolbar's band (24 to 776 across, 76 to 576 down), so the least shift
 * brings it to 24, 76.
 */
export const AT_ORDER: Viewport = { x: -76, y: -44, zoom: 1 };
/** where n_invoice is armed coming from the upper left: its far corner at the box's, 776, 576 */
export const AT_INVOICE: Viewport = { x: -444, y: -364, zoom: 1 };
/** n_order right of the box at zoom 1: arming is a pan to the left */
const RIGHT_OF_THE_BOX: Viewport = { x: 500, y: 100, zoom: 1 };
/** n_order inside the box once the zoom is 1, about whichever anchor: nothing shifts it */
const IN_THE_MIDDLE: Viewport = { x: 200, y: 150, zoom: 0.5 };
/** half of n_long in the board */
const OVER_THE_LONG_NODE: Viewport = { x: -900, y: 0, zoom: 0.5 };
const ABOVE_ONE: Viewport = { x: 500, y: 100, zoom: 1.5 };

const BUTTON: ArmBy = { source: "button" };
const DONE: ArmBy = { source: "done" };
const PANE: ArmBy = { source: "pane" };
const BACK = { armreturn: "back" } as const;
const LOCK = { armedzoom: "lock" } as const;
/** a zoom of the board under n_order as it stands armed */
const ZOOMED_OUT: Viewport = { ...AT_ORDER, zoom: 0.8 };
/** the same zoom with the board moved on both axes, as a zoom about the pointer leaves it */
const ZOOMED_OUT_ELSEWHERE: Viewport = { x: 10, y: 20, zoom: 0.8 };

const ARMING: Scenario[] = [
  {
    name: "armed at once when the board stands at its target",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: [], rests: AT_ORDER },
  },
  {
    name: "armed at once under armzoom off, wherever the board stands",
    board: { rules: { armzoom: "off" } },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: [], rests: START },
  },
  {
    name: "armed at once while the node is not measured",
    async script(bench) {
      await bench.arm(UNMEASURED, BUTTON);
    },
    expected: { armed: UNMEASURED, moves: [], rests: START },
  },
  {
    name: "a node that is no model is not armed",
    async script(bench) {
      await bench.arm(NOTE, BUTTON);
    },
    expected: { armed: null, moves: [], rests: START },
  },
  {
    name: "a move, then armed in the same task as the last write",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(50, 5);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "armed by a double-click: the zoom changes about the pointer",
    board: { viewport: IN_THE_MIDDLE },
    async script(bench) {
      // 300, 250 in the board's own box
      await bench.arm(ORDER, { source: "pointer", point: { x: 340, y: 280 } });
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: { x: 100, y: 50, zoom: 1 } },
  },
  {
    name: "armed by the button from the same place: the zoom changes about the node's centre",
    board: { viewport: IN_THE_MIDDLE },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: { x: 50, y: 15, zoom: 1 } },
  },
  {
    name: "a node longer than the box, armed by a double-click: the point stays under the pointer",
    board: { viewport: OVER_THE_LONG_NODE },
    async script(bench) {
      // 400, 300 in the board's own box
      await bench.arm(LONG, { source: "pointer", point: { x: 440, y: 330 } });
      await bench.frame(100, 3);
    },
    expected: { armed: LONG, moves: ["armed"], rests: { x: -2200, y: -300, zoom: 1 } },
  },
  {
    name: "a node longer than the box, armed by the button: its start goes to the margin",
    board: { viewport: OVER_THE_LONG_NODE },
    async script(bench) {
      await bench.arm(LONG, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: LONG, moves: ["armed"], rests: { x: -1976, y: 76, zoom: 1 } },
  },
  {
    name: "armzoom min1 above 1: the zoom stays and the board pans",
    board: { rules: { armzoom: "min1" }, viewport: ABOVE_ONE },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: { x: 26, y: -54, zoom: 1.5 } },
  },
  {
    name: "a zoom that is nearly 1 becomes exactly 1",
    board: { viewport: { x: 0, y: 0, zoom: 0.997 } },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: { x: -1, y: -1, zoom: 1 } },
  },
  {
    name: "a board without a toolbar: the box begins at its top edge",
    board: { toolbar: false },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: { x: -76, y: -96, zoom: 1 } },
  },
  {
    name: "armed at once while the board has no size",
    async script(bench) {
      await bench.resize(0, 0);
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: [], rests: START },
  },
  {
    name: "armed without a word on who asked: by other, about the node's centre",
    board: { armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "a second request for the same node joins the move",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.arm(ORDER, { source: "pointer", point: { x: 150, y: 150 } });
      await bench.frame(100, 2);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "arming another node while one is armed: a preview before the first write",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.arm(INVOICE, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: INVOICE, moves: ["armed"], rests: AT_INVOICE },
  },
  {
    name: "arming the armed node again changes nothing",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: [], rests: AT_ORDER },
  },
];

const INTERRUPTIONS: Scenario[] = [
  {
    name: "the move interrupted by a wheel on the board",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      // beside the renderer: not a wheel d3-zoom gets, so not the board's
      await bench.wheel("the toolbar", -100);
      await bench.wheel("the pane", -100);
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["wheel"] },
  },
  {
    name: "the move interrupted by a press on the board",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.press("a button beside the board");
      await bench.release("pointerup");
      await bench.press("the pane");
      await bench.release("pointerup");
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["pointer"] },
  },
  {
    name: "the move interrupted by Escape",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.key("the pane", "Escape");
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["key"] },
  },
  {
    name: "the move interrupted by a foreign viewport write",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.write({ x: 0, y: 0, zoom: 0.5 });
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["foreign"], rests: { x: 0, y: 0, zoom: 0.5 } },
  },
  {
    name: "the move interrupted by another arming, which starts its own move from there",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.arm(INVOICE, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: INVOICE, moves: ["arm", "armed"], rests: AT_INVOICE },
  },
  {
    name: "the move interrupted by a disarm",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.arm(null, PANE);
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["disarm"] },
  },
  {
    name: "the move interrupted by a zoom of the toolbar",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.beforeZoom(true);
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["zoom"] },
  },
  {
    name: "keys while the board moves reach nobody, but for a modifier, a text field and a control beside the board",
    async script(bench) {
      await bench.key("the pane", "a");
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.key("the pane", "a");
      await bench.key("the pane", "Delete");
      await bench.key("the pane", "Shift");
      await bench.key("a text field on the board", "a");
      await bench.key("an editable text on the board", "a");
      await bench.key("a button beside the board", "a");
      await bench.key("a button beside the board", "Escape");
      await bench.frame();
      await bench.key("the pane", "Escape");
      await bench.frame();
      await bench.key("the pane", "Escape");
    },
    expected: { armed: null, moves: ["key"] },
  },
  {
    name: "keys while the board moves under the scope page: a control beside the board loses them too",
    board: { inputScope: "page" },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.key("a button beside the board", "a");
      await bench.key("a text field beside the board", "a");
      await bench.key("a button beside the board", "Escape");
      await bench.frame();
    },
    expected: { armed: null, moves: ["key"] },
  },
];

const BOX: Scenario[] = [
  {
    name: "one more move when the box changed under the first",
    board: { viewport: RIGHT_OF_THE_BOX },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.resize(700, 600);
      await bench.frame(100, 2);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["moved on", "armed"], rests: { x: 176, y: 100, zoom: 1 } },
  },
  {
    name: "three moves at most when the box changes under each",
    board: { viewport: RIGHT_OF_THE_BOX },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      for (const width of [700, 600, 500]) {
        await bench.frame();
        await bench.resize(width, 600);
        await bench.frame(100, 2);
      }
      await bench.frame();
    },
    expected: {
      armed: ORDER,
      moves: ["moved on", "moved on", "armed"],
      rests: { x: 76, y: 100, zoom: 1 },
    },
  },
  {
    name: "the node is gone when the board arrives",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.forget(ORDER);
      await bench.frame(100, 2);
    },
    expected: { armed: null, moves: ["gone"], rests: AT_ORDER },
  },
];

const MOTIONS: Scenario[] = [
  {
    name: "0 ms under prefers-reduced-motion: one write, inside the call",
    board: { reducedMotion: true },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "0 ms with armmotion 0: one write, inside the call",
    board: { armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "0 ms on a page without the motion token",
    board: { motionToken: null },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "armmotion beats the token and prefers-reduced-motion",
    board: { armmotion: 100, reducedMotion: true },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(50, 2);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "a token in seconds, and linear on a page without the ease token",
    board: { motionToken: "0.2s", easeToken: null },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(50, 4);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
];

const ZOOM_SEEN_COMING: Scenario[] = [
  {
    name: "beforeZoom under disarm: a preview before the zoom",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.beforeZoom(true);
      await bench.arm(ORDER, BUTTON);
      await bench.beforeZoom(false);
      await bench.beforeZoom(true);
    },
    expected: { armed: null, moves: [], counted: { disarmsBeforeZoom: 1 } },
  },
  {
    name: "beforeZoom under lock: refused",
    board: { viewport: AT_ORDER, rules: LOCK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.beforeZoom(false);
      await bench.beforeZoom(true);
    },
    expected: { armed: ORDER, moves: [], counted: { zoomsRefused: 1 } },
  },
  {
    name: "beforeZoom under free: nothing is done",
    board: { viewport: AT_ORDER, rules: { armedzoom: "free" } },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.beforeZoom(true);
    },
    expected: { armed: ORDER, moves: [] },
  },
  {
    name: "beforeZoom with a press held in the armed editor: refused until the release",
    board: { viewport: AT_ORDER },
    async script(bench) {
      // Each kind of release is asked about before the next press. Asked only after it, a
      // release that the rules did not hear would pass for one: the next press holds anew
      await bench.arm(ORDER, BUTTON);
      await bench.press("the armed node's body");
      await bench.beforeZoom(true);
      await bench.release("pointercancel");
      await bench.beforeZoom(true);
      await bench.arm(ORDER, BUTTON);
      await bench.press("the editor in the overlay layer");
      await bench.beforeZoom(true);
      await bench.release("blur");
      await bench.beforeZoom(true);
      await bench.arm(ORDER, BUTTON);
      await bench.press("the armed node's body");
      await bench.beforeZoom(true);
      await bench.release("pointerup");
      await bench.beforeZoom(true);
      // a press that did not begin in the armed editor holds nothing
      await bench.arm(ORDER, BUTTON);
      await bench.press("the pane");
      await bench.beforeZoom(true);
    },
    expected: { armed: null, moves: [], counted: { zoomsRefused: 3, disarmsBeforeZoom: 4 } },
  },
  {
    name: "a wheel on the board under disarm: a preview before the zoom gets it",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.wheel("the pane", -100);
    },
    expected: { armed: null, moves: [], counted: { disarmsBeforeZoom: 1 } },
  },
  {
    name: "a wheel on the board under lock: refused, and not handed on",
    board: { viewport: AT_ORDER, rules: LOCK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.wheel("the pane", 100);
    },
    expected: { armed: ORDER, moves: [], counted: { zoomsRefused: 1 } },
  },
  {
    name: "a wheel with a press held in the armed editor: refused until the release",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.press("the editor in the overlay layer");
      await bench.wheel("the pane", -100);
      await bench.release("pointerup");
      await bench.wheel("the pane", -100);
    },
    expected: { armed: null, moves: [], counted: { zoomsRefused: 1, disarmsBeforeZoom: 1 } },
  },
  {
    name: "a wheel that cannot change the zoom is not asked about",
    board: {
      viewport: { x: 0, y: 0, zoom: 4 },
      rules: { armzoom: "off", armedzoom: "lock" },
    },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      // against the upper end of the range, then with no vertical part
      await bench.wheel("the pane", -100);
      await bench.wheel("the pane", 0);
      await bench.wheel("the pane", 100);
    },
    expected: { armed: ORDER, moves: [], counted: { zoomsRefused: 1 } },
  },
  {
    name: "a wheel against the lower end of the range is not asked about",
    board: {
      viewport: { x: 0, y: 0, zoom: 0.1 },
      rules: { armzoom: "off", armedzoom: "lock" },
    },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.wheel("the pane", 100);
      await bench.wheel("the pane", -100);
    },
    expected: { armed: ORDER, moves: [], counted: { zoomsRefused: 1 } },
  },
  {
    name: "a wheel in the armed editor or beside the renderer is not the board's",
    board: { viewport: AT_ORDER, rules: LOCK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.wheel("the armed node's body", -100);
      await bench.wheel("the editor in the overlay layer", -100);
      await bench.wheel("the toolbar", -100);
    },
    expected: { armed: ORDER, moves: [] },
  },
];

/** the one scenario in which a disarm is late: React cannot flush inside React Flow's fit */
export const FIT_QUEUED = "a zoom tick while a fit is queued: disarmed, and counted late";

const ZOOM_NOT_SEEN_COMING: Scenario[] = [
  {
    name: "a zoom tick not seen coming under disarm: disarmed inside the tick",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.write(ZOOMED_OUT);
    },
    expected: { armed: null, moves: [], counted: { disarmsAtTick: 1 }, rests: ZOOMED_OUT },
  },
  {
    name: "a zoom tick not seen coming under lock: undone inside the tick",
    board: { viewport: AT_ORDER, rules: LOCK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      // the tick moves the board on both axes too: x and y have to come back with the zoom
      await bench.write(ZOOMED_OUT_ELSEWHERE);
    },
    expected: {
      armed: ORDER,
      moves: [],
      counted: { zoomsRefused: 1, zoomsUndone: 1 },
      rests: AT_ORDER,
    },
  },
  {
    name: "a zoom tick with a press held in the armed editor: undone, and disarmed after the release",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.press("the armed node's body");
      await bench.write(ZOOMED_OUT);
      await bench.release("pointerup");
      await bench.write(ZOOMED_OUT);
    },
    expected: {
      armed: null,
      moves: [],
      counted: { zoomsRefused: 1, zoomsUndone: 1, disarmsAtTick: 1 },
      rests: ZOOMED_OUT,
    },
  },
  {
    name: "a zoom tick under free: counted, and the node stays armed",
    board: { viewport: AT_ORDER, rules: { armedzoom: "free" } },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.write(ZOOMED_OUT);
      await bench.write({ ...AT_ORDER, zoom: 0.6 });
      await bench.write({ x: 0, y: 0, zoom: 0.6 });
    },
    expected: { armed: ORDER, moves: [], counted: { armedZoomTicks: 2 } },
  },
  {
    name: FIT_QUEUED,
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.queueFit(true);
      await bench.write({ x: 10, y: 20, zoom: 0.7 });
    },
    expected: { armed: null, moves: [], counted: { disarmsAtTick: 1, lateDisarms: 1 } },
  },
  {
    name: "the rules' own writes are no zoom to guard against",
    armsPastTheRules: true,
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      // only so can a node be armed while the rules write: their zoom ticks pass it by
      await bench.runtimeArms(INVOICE);
      await bench.frame(100, 2);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "a pan under an armed node disarms nothing",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.write({ x: 0, y: 0, zoom: 1 });
    },
    expected: { armed: ORDER, moves: [], rests: { x: 0, y: 0, zoom: 1 } },
  },
  {
    name: "the first fit of a loading board is no zoom under an armed node",
    board: { rules: { armzoom: "off" }, fitQueued: true },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.write({ x: 10, y: 10, zoom: 0.9 });
      await bench.queueFit(false);
      await bench.write({ x: 10, y: 10, zoom: 0.7 });
    },
    expected: { armed: null, moves: [], counted: { disarmsAtTick: 1 } },
  },
];

const GOING_BACK: Scenario[] = [
  {
    name: "armreturn back after Done: a preview first, then the board goes back",
    board: { rules: BACK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
      await bench.arm(null, DONE);
      await bench.frame(100, 3);
    },
    expected: { armed: null, moves: ["armed", "returned"], rests: START },
  },
  {
    name: "armreturn back after a click on the bare board",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.arm(null, PANE);
    },
    expected: { armed: null, moves: ["armed", "returned"], rests: START },
  },
  {
    name: "armreturn back after the hook's disarm",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, { source: "hook" });
      await bench.arm(null, { source: "hook" });
    },
    expected: { armed: null, moves: ["armed", "returned"], rests: START },
  },
  {
    name: "armreturn back: a disarm by anything else stays",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.arm(null);
    },
    expected: { armed: null, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "armreturn back: a zoom seen coming forgets the way back",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.beforeZoom(true);
      await bench.runtimeArms(ORDER);
      await bench.arm(null, DONE);
    },
    expected: { armed: null, moves: ["armed"], counted: { disarmsBeforeZoom: 1 }, rests: AT_ORDER },
  },
  {
    name: "armreturn back: a zoom tick forgets the way back",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.write(ZOOMED_OUT);
      await bench.runtimeArms(ORDER);
      await bench.arm(null, DONE);
    },
    expected: { armed: null, moves: ["armed"], counted: { disarmsAtTick: 1 }, rests: ZOOMED_OUT },
  },
  {
    name: "armreturn back: nothing moves when the board stands there already",
    board: { rules: { armzoom: "min1", armreturn: "back" }, armmotion: 0, viewport: ABOVE_ONE },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      // a pan back to where the board stood: no zoom, so the node stays armed
      await bench.write(ABOVE_ONE);
      await bench.arm(null, DONE);
    },
    expected: { armed: null, moves: ["armed"], rests: ABOVE_ONE },
  },
  {
    name: "the way back interrupted by a wheel, also one with no vertical part",
    board: { rules: BACK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
      await bench.arm(null, DONE);
      await bench.frame();
      await bench.wheel("the pane", 0);
      await bench.frame();
    },
    expected: { armed: null, moves: ["armed", "wheel"] },
  },
  {
    name: "arming the node again while the board goes back starts anew",
    board: { rules: BACK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
      await bench.arm(null, DONE);
      await bench.frame();
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
    },
    expected: { armed: ORDER, moves: ["armed", "arm", "armed"], rests: AT_ORDER },
  },
  {
    name: "armreturn back: the way back belongs to the node the board moved for",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.runtimeArms(INVOICE);
      await bench.arm(null, DONE);
      // and that disarm forgot the way: Done on n_order goes nowhere either
      await bench.runtimeArms(ORDER);
      await bench.arm(null, DONE);
    },
    expected: { armed: null, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "armreturn back: an interrupted arming leaves no way back",
    board: { rules: BACK },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.wheel("the pane", -100);
      await bench.runtimeArms(ORDER);
      await bench.arm(null, DONE);
      await bench.frame();
    },
    expected: { armed: null, moves: ["wheel"] },
  },
  {
    name: "armreturn back: a node armed at once has no way back",
    board: { rules: BACK, armmotion: 0 },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.runtimeArms(null);
      await bench.arm(ORDER, BUTTON);
      await bench.arm(null, DONE);
    },
    expected: { armed: null, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "armreturn stay: Done leaves the board where it is",
    async script(bench) {
      await bench.arm(null, PANE);
      await bench.arm(ORDER, BUTTON);
      await bench.frame(100, 3);
      await bench.arm(null, DONE);
      await bench.frame();
    },
    expected: { armed: null, moves: ["armed"], rests: AT_ORDER },
  },
];

const URL_AND_REST: Scenario[] = [
  {
    name: "the URL's arm waits for the first fit and for the editor, then goes through the rule",
    board: { arm: ORDER, fitQueued: true },
    async script(bench) {
      await bench.whenRest();
      await bench.frame(16);
      // the fit is through and the editor is not up: only the editor holds the arm back
      await bench.queueFit(false);
      await bench.frame(16);
      // Escape ends a move. Here and below it finds none: an arm that did not wait would end
      // here, and the node would never be armed
      await bench.key("the pane", "Escape");
      // the editor is up and a fit is queued again: only the fit holds the arm back
      await bench.queueFit(true);
      await bench.editorUp(ORDER);
      await bench.frame(16);
      await bench.key("the pane", "Escape");
      await bench.queueFit(false);
      await bench.frame(16);
      await bench.frame(100, 3);
      await bench.frame(16, 2);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "the URL's arm is dropped with the undo of watch",
    board: { arm: ORDER },
    async script(bench) {
      await bench.editorUp(ORDER);
      await bench.undo("watch");
      await bench.frame(16, 2);
    },
    expected: { armed: null, moves: [], rests: START },
  },
  {
    name: "the URL names a node that is no model: nothing is pending",
    board: { arm: NOTE },
    async script(bench) {
      await bench.frame(16);
    },
    expected: { armed: null, moves: [], rests: START },
  },
  {
    name: "whenRest resolves the frame after the board came to rest",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.whenRest();
      await bench.frame(100, 3);
      await bench.frame(16);
    },
    expected: { armed: ORDER, moves: ["armed"], rests: AT_ORDER },
  },
  {
    name: "whenRest on a board at rest resolves with the next frame",
    async script(bench) {
      await bench.whenRest();
      await bench.frame(16);
    },
    expected: { armed: null, moves: [], rests: START },
  },
];

/** more moves than the rules keep records of */
const MANY_MOVES = 201;

const UNDO_AND_RECORDS: Scenario[] = [
  {
    name: "after the undo of attach and of watch nothing is guarded",
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.frame();
      await bench.undo("attach");
      await bench.wheel("the pane", -100);
      await bench.key("the pane", "Escape");
      await bench.press("the pane");
      await bench.frame(100, 2);
      await bench.press("the armed node's body");
      await bench.wheel("the pane", -100);
      await bench.undo("watch");
      await bench.write(ZOOMED_OUT);
      // no press is held: the press on the armed editor went unheard
      await bench.beforeZoom(true);
    },
    expected: {
      armed: null,
      moves: ["armed"],
      counted: { disarmsBeforeZoom: 1 },
      rests: ZOOMED_OUT,
    },
  },
  {
    name: "a press held when attach is undone stays held: no release is heard any more",
    board: { viewport: AT_ORDER },
    async script(bench) {
      await bench.arm(ORDER, BUTTON);
      await bench.press("the armed node's body");
      await bench.undo("attach");
      await bench.release("pointerup");
      await bench.release("pointercancel");
      await bench.release("blur");
      await bench.beforeZoom(true);
    },
    expected: { armed: ORDER, moves: [], counted: { zoomsRefused: 1 } },
  },
  {
    name: "more than 200 moves: the oldest records go",
    board: { armmotion: 0 },
    brief: true,
    async script(bench) {
      for (let round = 0; round < MANY_MOVES; round++) {
        await bench.arm(round % 2 === 0 ? ORDER : INVOICE, BUTTON);
      }
    },
    expected: {
      armed: ORDER,
      moves: Array.from({ length: 200 }, (): MoveEnd => "armed"),
      counted: { transitions: MANY_MOVES },
      rests: AT_ORDER,
    },
  },
];

export const SCENARIOS: readonly Scenario[] = [
  ...ARMING,
  ...INTERRUPTIONS,
  ...BOX,
  ...MOTIONS,
  ...ZOOM_SEEN_COMING,
  ...ZOOM_NOT_SEEN_COMING,
  ...GOING_BACK,
  ...URL_AND_REST,
  ...UNDO_AND_RECORDS,
];

/**
 * No scenario and in no trace: the check that the bench can show a late disarm at all. Its runtime
 * shows a disarmed node a microtask late, which the rules' look at the page must count.
 */
export const LATE_COMMIT: Scenario = {
  name: "control: a runtime that shows the disarm late is counted",
  board: { viewport: AT_ORDER, lateCommit: true },
  async script(bench) {
    await bench.arm(ORDER, BUTTON);
    await bench.beforeZoom(true);
  },
  expected: { armed: null, moves: [], counted: { disarmsBeforeZoom: 1, lateDisarms: 1 } },
};
