/**
 * Miragon design tokens — the single source of truth for every non-notation colour the renderer
 * draws into SVG.
 *
 * Values mirror the Miragon design system: the `miragon-brand:modeler-tool-design` skill in
 * `Miragon/corporate-identity`, whose files are vendored unchanged next to this module
 * (`cd-tokens.generated.css`, `cd-tokens.generated.json`, `cd-canvas.css`; design system 1.27.0,
 * token files unchanged since 1.12.0).
 * Re-copy them from the skill to update; never fork the hex values by hand. SVG attributes need
 * literal values (exports carry presentation attributes, never `var()`), so `draw/styles.ts`
 * derives its colours from `MIRAGON`; the in-canvas chrome in `assets/context-maps.css` reads the
 * `--cd-ui-*` roles directly. `test/theme.sync.test.ts` fails if a value here drifts from the
 * vendored files.
 *
 * Pure data — no DOM, no imports. The subdomain-type fills and relationship-pattern strokes are the
 * official Context Maps notation and live in `schema-model/notation.ts`; they are NOT part of this
 * brand ramp. The renderer draws light only (the modelers switch to dark together, guide §13.3).
 */

/** Raw Miragon brand ramp and status layer — the `fest` values of `cd-tokens.generated.json`. */
export const MIRAGON = {
  /** Primary: surfaces, buttons, links, selection, backgrounds. */
  blau: "#335DE5",
  /** Deeper blue for links / accent text on white (WCAG AA, ~5.5:1). */
  blauLink: "#2B50D4",
  /** Lightened blue for accents on dark surfaces (unused here — the canvas is light-only). */
  blauHell: "#6B8AFF",
  /** Accent: key visual, highlights, the brand gradient. Bright — a fill, never text on white. */
  gruen: "#00E676",
  /** Calm neutral surface (warm off-white) — the paper surround. */
  grau: "#F9F7F7",
  /** Text on light; not pure black. */
  schwarz: "#1D1D1D",
  weiss: "#FFFFFF",
  /** Fixed light neutral for lines and borders on a light stage. */
  linie: "#E6E2E2",
  /** Non-text elements that need 3:1 on a light stage: input borders, edges, contours. */
  kontur: "#8F8A8A",
  /** Secondary text, at least 4.5:1 on `weiss` and on `grau`. */
  textLeise: "#6B6666",
  /**
   * Status layer (guide §3.3): fills, borders, icons and dots; as text on white only `danger` and
   * `info` reach AA.
   */
  success: "#00E676",
  warning: "#FFB000",
  danger: "#CD1839",
  info: "#335DE5",
  /** Signature brand gradient — brand moments only. Use verbatim. */
  gradientBrand: "linear-gradient(120deg, #335DE5 30%, #00E676)",
} as const;

/**
 * Every fixed `--cd-*` token this repo mirrors, mapped to the value it MUST hold in the vendored
 * files (`fest` in the JSON, `:root` in the CSS).
 */
export const CD_TOKENS: Record<string, string> = {
  "--cd-blau": MIRAGON.blau,
  "--cd-gruen": MIRAGON.gruen,
  "--cd-grau": MIRAGON.grau,
  "--cd-schwarz": MIRAGON.schwarz,
  "--cd-weiss": MIRAGON.weiss,
  "--cd-blau-link": MIRAGON.blauLink,
  "--cd-blau-hell": MIRAGON.blauHell,
  "--cd-linie": MIRAGON.linie,
  "--cd-kontur": MIRAGON.kontur,
  "--cd-text-leise": MIRAGON.textLeise,
  "--cd-success": MIRAGON.success,
  "--cd-warning": MIRAGON.warning,
  "--cd-danger": MIRAGON.danger,
  "--cd-info": MIRAGON.info,
  "--cd-gradient-brand": MIRAGON.gradientBrand,
};
