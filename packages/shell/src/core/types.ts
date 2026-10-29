/** A point in pixels or diagram coordinates, as the context says. */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A rectangle; content bounds and viewboxes are in diagram coordinates. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A viewbox together with the scale diagram-js shows it at (`canvas.viewbox().scale`). */
export interface ScaledViewbox extends Bounds {
  scale: number;
}

/** Distances in pixels from the edges of the modeler's container. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The host column of guide §5.2: `ide` is a VS Code webview (later IntelliJ), `web` a Miragon web
 * app that owns its page, `embedded` a modeler inside a foreign page (designIQ, modeler-api hosts).
 */
export type ShellHost = "ide" | "web" | "embedded";

/**
 * The `data-chrome` names of the chrome (guide §5.2, §13.4). The web column adds `primary`, `legal`,
 * `toasts`, `empty-state`, `drop-zone` and `problems-popover` (0.2); IDE and embedded hosts never
 * show `primary`, `legal`, `toasts`, `empty-state` and `drop-zone`, the IDE host never
 * `problems-popover`.
 */
export type ChromeIsland =
  | "menu"
  | "palette"
  | "primary"
  | "zoom"
  | "problems"
  | "legend"
  | "inspector"
  | "status"
  | "legal"
  | "toasts"
  | "empty-state"
  | "drop-zone"
  | "problems-popover";

export const CHROME_ISLANDS: readonly ChromeIsland[] = [
  "menu",
  "palette",
  "primary",
  "zoom",
  "problems",
  "legend",
  "inspector",
  "status",
  "legal",
  "toasts",
  "empty-state",
  "drop-zone",
  "problems-popover",
];

/** Where the palette sits: in the top row, or in the second row below it (guide §5.15). */
export type PaletteRow = "top" | "second-row";

/**
 * What the zoom panel and the chrome keys act on. The diagram-js viewport implements it; the DOM
 * shell only talks to this interface.
 */
export interface ZoomTarget {
  /** The current zoom, 1 = 100 % (diagram-js `canvas.zoom()`, rounded to three decimals). */
  zoom(): number;
  /** One step on the zoom raster around the container centre (diagram-js `zoomScroll.stepZoom`). */
  stepZoom(direction: 1 | -1): void;
  /** 100 % around the container centre. Counts as a user move. */
  zoomToActual(): void;
  /** Explicit fit (button, Shift+1, command): animated unless reduced motion, makes the view automatic. */
  fit(): void;
  /** False while there is nothing to fit (the content bounds are empty). */
  canFit(): boolean;
  /**
   * Calls `listener` after every viewbox change and whenever `canFit()` may have changed, possibly
   * several times per frame. Returns the unsubscribe function.
   */
  onChange(listener: () => void): () => void;
  /**
   * Hands the keyboard focus to the canvas (diagram-js `canvas.focus()`), which the shell calls
   * after a pointer click on chrome that acts on the canvas (guide §5.8). Without it the focus stays
   * on the clicked control.
   */
  focus?(): void;
}

/** The persisted view (VS Code `setState`): JSON-serializable. */
export interface ViewportState {
  viewbox: Bounds;
  /** The user zoomed or panned since the last fit; a resize no longer refits. */
  userMoved: boolean;
}
