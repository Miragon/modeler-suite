/**
 * The canvas classes that switch a colour with the mode of the nearest `data-cd-theme` carrier
 * (guide §10.2). The renderer keeps drawing the light values as attributes; a class names the role
 * that `cd-canvas.css` resolves in the current mode, one class per property and never a fill class
 * on an open path. A sticky is paper and keeps its look in both modes (guide §10.6), so only what
 * lies on the board itself takes a class: arrows, their annotations, drawings without a colour of
 * their own and the draw tool's handles.
 */
export const CANVAS_ROLE = {
  /** Default drawing ink and the draw tool's lines and handle rims: black light, white dark. */
  strokeText: "cd-c-stroke-text",
  /** Arrows (guide §10.1, edges): `kontur` in both modes, the text colour in high contrast. */
  strokeKontur: "cd-c-stroke-kontur",
  /** Arrow annotations, drawn on the board: `text-leise`. */
  fillTextLeise: "cd-c-fill-text-leise",
  /** The draw tool's handles, filled with the board's ground. */
  fillGrund: "cd-c-fill-grund",
  /** A second path under a stroke the user coloured that falls below 3:1 on the dark plot. */
  underlay: "cd-c-unterleger",
} as const;

/**
 * The arrowhead's fill takes `kontur` like the arrow's line, so the two agree in high contrast.
 * `cd-canvas.css` has no fill class for `kontur`, so `event-storming.css` maps this class to the
 * role, and the export drops it with the `cd-c-*` classes.
 */
export const ARROWHEAD_CLASS = "event-storming-arrowhead";

/** Adds canvas classes to an element the renderer or a tool just drew, and returns it. */
export function withCanvasRoles<Drawn extends SVGElement>(
  element: Drawn,
  ...roles: readonly string[]
): Drawn {
  element.classList.add(...roles);
  return element;
}

/** The `cd-c-*` prefix of `cd-canvas.css`. */
const CANVAS_ROLE_PREFIX = "cd-c-";

/** Whether a class switches a colour with the mode: the export leaves every such class out. */
export function isModeClass(name: string): boolean {
  return name.startsWith(CANVAS_ROLE_PREFIX) || name === ARROWHEAD_CLASS;
}

/** The underlay is 2px wider than the stroke on it, a 1px rim on either side (guide §10.6). */
export const UNDERLAY_EXTRA_WIDTH = 2;
