import type { AppearanceSurface, AppearanceTheme } from '@miragon/modeler-api';
import { THEMES } from '../themes.js';

const [FALLBACK_THEME = 'light'] = THEMES;

interface UntypedRequest {
  theme?: unknown;
  contrast?: unknown;
}

/**
 * The contract's `appearance` (1.5) on the element the renderer draws into: `data-cd-theme` and,
 * for high contrast, `data-cd-kontrast="hoch"` there, so the vendored token CSS resolves the roles
 * on the diagram and not from the page around it (guide §13.3). A theme `THEMES` does not list
 * draws its first one. Only the roles change: the canvas keeps its light SVG attributes, so every
 * export stays as it was, and the document, the history, the view and the selection stay too.
 */
export function appearanceOf(root: HTMLElement, destroyed: () => boolean): AppearanceSurface {
  return {
    themes: THEMES,
    set(request) {
      if (destroyed()) return;
      const { theme, contrast } = fieldsOf(request);
      root.setAttribute('data-cd-theme', isTheme(theme) ? theme : FALLBACK_THEME);
      if (contrast === 'high') root.setAttribute('data-cd-kontrast', 'hoch');
      else root.removeAttribute('data-cd-kontrast');
    },
  };
}

function isTheme(value: unknown): value is AppearanceTheme {
  return (THEMES as readonly unknown[]).includes(value);
}

/** An untyped host may pass anything: what is no object names no theme and no contrast. */
function fieldsOf(request: unknown): UntypedRequest {
  return typeof request === 'object' && request !== null ? (request as UntypedRequest) : {};
}
