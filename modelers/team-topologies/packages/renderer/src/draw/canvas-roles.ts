/**
 * The role classes of `cd-canvas.css` (guide §10.2) on what the renderer draws in a role instead of
 * a notation colour or one the user set. The attribute keeps the light value, so the light canvas
 * and the export look as before; the class sets the role of the nearest mode carrier, and the SVG
 * export drops it (guide §10.7). Notation fills and strokes and the labels on them stay as they
 * are in both modes (guide §10.6).
 */
export const CANVAS_ROLE_CLASS = {
  /** Strokes that recede: the annotation bracket and its association. */
  strokeKontur: "cd-c-stroke-kontur",
  /** The placeholder of an element the renderer does not know. */
  fillLinie: "cd-c-fill-linie",
} as const;

/**
 * The role a label on the canvas ground follows (guide §10.1): the annotation's text and the flow
 * of change's caption. A label on a notation fill or a fill the user set has none, since those
 * fills stay light in both modes.
 */
export type CanvasTextRole = "text" | "text-leise";

const TEXT_ROLES: Record<CanvasTextRole, { className: string; colour: string }> = {
  text: { className: "cd-c-fill-text", colour: "var(--cd-ui-text)" },
  "text-leise": { className: "cd-c-fill-text-leise", colour: "var(--cd-ui-text-leise)" },
};

/** The class of `cd-canvas.css` that fills an SVG label in its role. */
export function textRoleClass(role: CanvasTextRole): string {
  return TEXT_ROLES[role].className;
}

/** The role as a CSS colour, for the label editor, an HTML field that never reaches an export. */
export function textRoleColour(role: CanvasTextRole): string {
  return TEXT_ROLES[role].colour;
}
