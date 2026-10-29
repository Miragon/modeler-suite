/**
 * The modes the map can be drawn in, for the theme bridge in the extension host and for the
 * webview, which must agree: the renderer's `CONTEXT_MAPS_THEMES`, light only until the Miragon
 * modelers switch to dark together (guide §13.3), so the webview stays light in every VS Code theme
 * instead of a half-dark chrome. Taken from the renderer's source file, since its entry would bring
 * diagram-js and its stylesheet into the extension host's bundle.
 */
export { CONTEXT_MAPS_THEMES as WEBVIEW_THEMES } from "../../../packages/renderer/src/theme/themes.js";
