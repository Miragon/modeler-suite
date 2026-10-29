import type { AppearanceSurface, AppearanceTheme } from "@miragon/modeler-api";
import { TEAM_TOPOLOGIES_THEMES } from "../theme/themes.js";

/**
 * The contract's `appearance` surface: the request becomes the guide's mode attributes on the root
 * of what the renderer draws (§13.3), so the token roles, the canvas classes of `cd-canvas.css` and
 * the renderer's own rules resolve there and not in the host's page. A light-only renderer stays
 * light on a dark page, and a request for normal contrast holds on a high-contrast one.
 */
export function appearanceSurface(root: HTMLElement): AppearanceSurface {
  return {
    themes: TEAM_TOPOLOGIES_THEMES,
    set(request) {
      const { theme, contrast } = readRequest(request);
      root.setAttribute("data-cd-theme", drawnTheme(theme));
      if (contrast === "high") root.setAttribute("data-cd-kontrast", "hoch");
      else root.removeAttribute("data-cd-kontrast");
    },
  };
}

function drawnTheme(requested: unknown): AppearanceTheme {
  const listed = TEAM_TOPOLOGIES_THEMES.find((theme) => theme === requested);
  return listed ?? TEAM_TOPOLOGIES_THEMES[0];
}

/** A host without types may pass anything; what is not a request counts as none. */
function readRequest(request: unknown): { theme?: unknown; contrast?: unknown } {
  const { theme, contrast } =
    typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
  return { theme, contrast };
}
