import type { ViewKey } from "@miragon/c4-schema-model";
import type { ViewChangeCause } from "@miragon/c4-renderer";
import type { Bounds, ViewportState } from "@miragon/modeler-shell/core";
import type { PersistableView, WebviewStateApi } from "@miragon/modeler-shell/vscode/webview";

/**
 * The modeler's part of the webview state (SPEC 7.3), next to the shell's `modelerShell` part,
 * which it leaves alone: the view the canvas showed last and the place the user left each view at,
 * so a reload or a restored tab comes back to the same view and place.
 */
export const C4_STATE_KEY = "c4";

export interface C4WebviewState {
  readonly activeView?: ViewKey | undefined;
  /** By view key; a `Map`, since a key is the user's text and may be `__proto__`. */
  readonly viewportByView: ReadonlyMap<ViewKey, ViewportState>;
}

/** A workspace has dozens of views at most; the oldest places go first beyond this. */
export const REMEMBERED_VIEWS = 64;

/** A pan, a wheel zoom or a fit animation changes the view on every frame. */
const PERSIST_DELAY_MS = 250;

type StateRecord = Record<string, unknown>;

function isRecord(value: unknown): value is StateRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storedState(api: WebviewStateApi): StateRecord {
  const state = api.getState();
  return isRecord(state) ? state : {};
}

function viewboxFrom(value: unknown): Bounds | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every((number) => typeof number === "number")) return undefined;
  const box = { x, y, width, height } as Bounds;
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return undefined;
  return box.width > 0 && box.height > 0 ? box : undefined;
}

function viewportFrom(value: unknown): ViewportState | undefined {
  if (!isRecord(value) || typeof value.userMoved !== "boolean") return undefined;
  const viewbox = viewboxFrom(value.viewbox);
  return viewbox ? { viewbox, userMoved: value.userMoved } : undefined;
}

/** The modeler's part of `api.getState()`, valid entries only; empty when there is none. */
export function readC4State(api: WebviewStateApi): C4WebviewState {
  const part = storedState(api)[C4_STATE_KEY];
  const viewportByView = new Map<ViewKey, ViewportState>();
  if (!isRecord(part)) return { viewportByView };
  if (isRecord(part.viewportByView)) {
    for (const [key, value] of Object.entries(part.viewportByView)) {
      const viewport = viewportFrom(value);
      if (viewport) viewportByView.set(key, viewport);
    }
  }
  const activeView = typeof part.activeView === "string" ? part.activeView : undefined;
  return { activeView, viewportByView };
}

/** Writes the modeler's part, keeping every other key; nothing when nothing changed. */
export function writeC4State(api: WebviewStateApi, state: C4WebviewState): void {
  const stored = storedState(api);
  const next: StateRecord = {
    ...(state.activeView === undefined ? {} : { activeView: state.activeView }),
    // fromEntries defines own properties, so a key `__proto__` stays a key.
    viewportByView: Object.fromEntries(state.viewportByView),
  };
  if (JSON.stringify(next) === JSON.stringify(stored[C4_STATE_KEY])) return;
  api.setState({ ...stored, [C4_STATE_KEY]: next });
}

/**
 * The place a view was left at, for the first import: the modeler's own entry, else the shell's
 * stored view when it was written for that same view (or by a webview from before the modeler
 * kept its own).
 */
export function storedViewport(
  state: C4WebviewState,
  shellView: ViewportState | undefined,
  view: ViewKey,
): ViewportState | undefined {
  const own = state.viewportByView.get(view);
  if (own) return own;
  return state.activeView === undefined || state.activeView === view ? shellView : undefined;
}

export interface ViewportMemoryOptions {
  readonly viewport: PersistableView;
  /** The view the canvas shows now. */
  activeView(): ViewKey;
  readonly delayMs?: number | undefined;
}

export interface ViewportMemory {
  /** What the webview state held when the memory connected. */
  readonly stored: C4WebviewState;
  /**
   * The place `view` was left at, also in the webview's life before a reload, which the
   * renderer's own memory of this session doesn't reach.
   */
  placeOf(view: ViewKey): ViewportState | undefined;
  /**
   * The canvas switched views (`c4.view.changed`), before the host restores or fits the new one:
   * the outgoing view keeps the place it was left at, a re-keyed one keeps its place under the new
   * key, and a removed one forgets it.
   */
  switched(previous: ViewKey, view: ViewKey, cause: ViewChangeCause): void;
  /** Stops listening and writes a pending change at once. */
  stop(): void;
}

/**
 * Keeps `viewportByView` and `activeView` up to date: the place of the view shown is written once
 * the view has rested for `delayMs`, as the shell's `persistView` does for its own part, so a pan
 * sends one `setState` instead of one per frame.
 */
export function connectViewportMemory(
  api: WebviewStateApi,
  options: ViewportMemoryOptions,
): ViewportMemory {
  const stored = readC4State(api);
  const places = new Map(stored.viewportByView);
  let activeView = stored.activeView;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const remember = (view: ViewKey, state: ViewportState): void => {
    places.delete(view);
    places.set(view, state);
    for (const oldest of places.keys()) {
      if (places.size <= REMEMBERED_VIEWS) break;
      places.delete(oldest);
    }
  };
  const write = (): void => writeC4State(api, { activeView, viewportByView: places });
  const rememberShown = (): void => {
    timer = undefined;
    const view = options.activeView();
    const state = options.viewport.getState();
    if (!state) return;
    activeView = view;
    remember(view, state);
    write();
  };
  const unsubscribe = options.viewport.onChange(() => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(rememberShown, options.delayMs ?? PERSIST_DELAY_MS);
  });

  return {
    stored,
    placeOf: (view) => places.get(view),
    switched(previous, view, cause) {
      if (stopped) return;
      if (cause === "rekey") {
        const place = places.get(previous);
        places.delete(previous);
        if (place) remember(view, place);
      } else if (cause === "removed") {
        places.delete(previous);
      } else {
        const state = options.viewport.getState();
        if (state) remember(previous, state);
      }
      activeView = view;
      write();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      if (timer === undefined) return;
      clearTimeout(timer);
      rememberShown();
    },
  };
}
