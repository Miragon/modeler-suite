import type { AppearanceSurface, AppearanceTheme } from "@miragon/modeler-api";
import { VALUE_CHAIN_THEMES } from "./themes.js";

const THEME_ATTRIBUTE = "data-cd-theme";
const CONTRAST_ATTRIBUTE = "data-cd-kontrast";
const HIGH_CONTRAST = "hoch";

/**
 * The contract's `appearance` for one mount. `set` writes the mode on `root`, the element that
 * holds everything the mount draws, so the design tokens and `cd-canvas.css` resolve there and not
 * in the host's page (guide §13.3). The diagram draws light presentation values, and the role
 * classes only reach the live canvas, so no request changes an export. Nothing happens once
 * `isDestroyed()` holds.
 */
export function createAppearance(root: HTMLElement, isDestroyed: () => boolean): AppearanceSurface {
  return {
    themes: VALUE_CHAIN_THEMES,
    set(request) {
      if (isDestroyed()) return;
      root.setAttribute(THEME_ATTRIBUTE, drawnTheme(requested(request, "theme")));
      if (requested(request, "contrast") === "high") {
        root.setAttribute(CONTRAST_ATTRIBUTE, HIGH_CONTRAST);
      } else {
        root.removeAttribute(CONTRAST_ATTRIBUTE);
      }
    },
  };
}

function drawnTheme(theme: unknown): AppearanceTheme {
  return VALUE_CHAIN_THEMES.find((listed) => listed === theme) ?? VALUE_CHAIN_THEMES[0] ?? "light";
}

/** A field of a request from a host that TypeScript does not check: any value, never a throw. */
function requested(request: unknown, field: "theme" | "contrast"): unknown {
  if (typeof request !== "object" || request === null) return undefined;
  try {
    return (request as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}
