/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vendoredTokens from "../../src/theme/cd-tokens.generated.json";

/**
 * The role classes as the stylesheets declare them, read from `cd-canvas.css` and
 * `assets/context-maps.css` rather than from the renderer, so a test resolves a class to the colour
 * the browser gives it in each mode without the renderer's own word for it.
 */

export type Paint = "fill" | "stroke";
export type Mode = "hell" | "dunkel";

export interface RoleRule {
  readonly paint: Paint;
  /** The `--cd-ui-*` role the class draws its paint in. */
  readonly role: string;
}

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const STYLESHEETS = [
  readSource("../../src/theme/cd-canvas.css"),
  readSource("../../src/assets/context-maps.css"),
];

const ROLE_RULE =
  /\.(c[dm]-c-[\w-]+)\s*\{\s*(fill|stroke)\s*:\s*var\((--cd-ui-[\w-]+)\)\s*!important;\s*\}/g;

export const ROLE_RULES: ReadonlyMap<string, RoleRule> = new Map(
  STYLESHEETS.flatMap((source) =>
    [...source.matchAll(ROLE_RULE)].map(
      (match) => [match[1]!, { paint: match[2] as Paint, role: match[3]! }] as const,
    ),
  ),
);

export const TOKENS = vendoredTokens as unknown as Record<Mode, Record<string, string>>;

export const UNDERLAY_CLASS = "cd-c-unterleger";

/** The role a `cd-c-unterleger` shows in under a dark carrier; it is `none` everywhere else. */
export const UNDERLAY_ROLE_IN_DARK = (() => {
  const role = /\[data-cd-theme="dark"\]\s*\{[^}]*--cdc-unterleger:\s*var\((--cd-ui-[\w-]+)\)/.exec(
    STYLESHEETS[0]!,
  )?.[1];
  if (!role) throw new Error("cd-canvas.css sets no underlay role for dark");
  return role;
})();

/**
 * The colour an element of a preview's markup shows for `paint` in `mode`: its role class's role,
 * else its attribute, else its parent's (SVG inherits paint).
 */
export function paintIn(element: Element, paint: Paint, mode: Mode): string | undefined {
  if (paint === "stroke" && element.classList.contains(UNDERLAY_CLASS)) {
    return mode === "dunkel" ? TOKENS.dunkel[UNDERLAY_ROLE_IN_DARK] : "none";
  }
  for (const name of element.classList) {
    const rule = ROLE_RULES.get(name);
    if (rule?.paint === paint) return TOKENS[mode][rule.role];
  }
  const own = element.getAttribute(paint);
  if (own !== null) return own;
  return element.parentElement ? paintIn(element.parentElement, paint, mode) : undefined;
}
