/**
 * The modes the map can be drawn in: the renderer's `CONTEXT_MAPS_THEMES`, light only until the
 * joint dark-mode release of the modelers. A light-only web app writes `data-cd-theme="light"`
 * statically and shows no Appearance group (guide §13.3). Taken from the renderer's source file,
 * since the Vite config reads it in Node, where the renderer's entry (diagram-js, its stylesheet)
 * does not load.
 */
export { CONTEXT_MAPS_THEMES as THEMES } from "../../../packages/renderer/src/theme/themes.js";
