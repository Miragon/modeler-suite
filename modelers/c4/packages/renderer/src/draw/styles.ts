import { fest, hell } from "../theme/cd-tokens.generated.json";

/**
 * The role classes the canvas draws with (SPEC 6.4, guide §10.2) and the light value each one
 * carries as a presentation attribute. The class switches the role per mode; the export strips the
 * classes (guide §10.7), and the attribute keeps the light colour, so a class without its attribute
 * would export as SVG's default black fill or no stroke at all.
 */
export const ROLE_LIGHT = {
  "cd-c-fill-plot": { attribute: "fill", value: hell["--cd-ui-plot"] },
  "cd-c-fill-text": { attribute: "fill", value: hell["--cd-ui-text"] },
  "cd-c-fill-text-leise": { attribute: "fill", value: hell["--cd-ui-text-leise"] },
  "cd-c-fill-flaeche-hoch": { attribute: "fill", value: hell["--cd-ui-flaeche-hoch"] },
  "cd-c-stroke-text": { attribute: "stroke", value: hell["--cd-ui-text"] },
  "cd-c-stroke-kontur": { attribute: "stroke", value: hell["--cd-ui-kontur"] },
  "cd-c-stroke-linie": { attribute: "stroke", value: hell["--cd-ui-linie"] },
} as const satisfies Record<string, { attribute: "fill" | "stroke"; value: string }>;

export type RoleClass = keyof typeof ROLE_LIGHT;
export type FillRole = {
  [Role in RoleClass]: (typeof ROLE_LIGHT)[Role]["attribute"] extends "fill" ? Role : never;
}[RoleClass];
export type StrokeRole = Exclude<RoleClass, FillRole>;

/** Class and light attribute together, never one without the other. */
export function applyRole(node: SVGElement, role: RoleClass): void {
  node.classList.add(role);
  node.setAttribute(ROLE_LIGHT[role].attribute, ROLE_LIGHT[role].value);
}

/**
 * A paint is a role (the default look, which follows the mode) or a colour the author set in the
 * DSL, which stays as stored in every mode and gets no class (guide §10.6).
 */
export type Paint<Role extends RoleClass = RoleClass> =
  { readonly role: Role } | { readonly colour: string };

/** The author's colour when set, else the role. */
export function paintOf<Role extends RoleClass>(
  colour: string | undefined,
  role: Role,
): Paint<Role> {
  return colour === undefined ? { role } : { colour };
}

export function applyPaint(
  node: SVGElement,
  attribute: "fill" | "stroke",
  paint: Paint<FillRole> | Paint<StrokeRole>,
): void {
  if ("colour" in paint) {
    node.setAttribute(attribute, paint.colour);
    return;
  }
  if (ROLE_LIGHT[paint.role].attribute !== attribute) {
    throw new Error(`The role ${paint.role} paints no ${attribute}.`);
  }
  applyRole(node, paint.role);
}

/** The light value a paint shows, for previews and measurements. */
export function paintValue(paint: Paint): string {
  return "colour" in paint ? paint.colour : ROLE_LIGHT[paint.role].value;
}

/**
 * Text on a fill the author set is black or white, whichever has more contrast (guide §10.6). The
 * style resolver already picks it; this covers a resolved style that left the text open.
 */
export const SELF_SET_TEXT = {
  dark: fest["--cd-schwarz"],
  light: fest["--cd-weiss"],
} as const;

/**
 * Canvas colours for hosts: the light roles of the vendored tokens (guide §10.1), as SVG
 * presentation values, so a PNG export gets the canvas ground of the drawing.
 */
export const COLORS = {
  ink: hell["--cd-ui-text"],
  fill: hell["--cd-ui-plot"],
  paper: hell["--cd-ui-grund"],
} as const;

/** SVG text does not inherit the container's font, so every label names the family (guide §4). */
export const FONT = {
  family: "'Geist Variable', 'Geist', ui-sans-serif, system-ui, sans-serif",
  size: 13,
  lineHeight: 1.25,
} as const;
