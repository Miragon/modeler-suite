import { BREADCRUMBS_CLASS } from "../navigation/Breadcrumbs.js";

/** The room the fit leaves between the breadcrumb and the content below it. */
export const BREADCRUMB_FIT_GAP = 8;

/** The chrome's fit insets in pixels (a `@miragon/modeler-shell` `Insets` fits). */
export interface FitInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * The chrome's fit insets, the top one kept `BREADCRUMB_FIT_GAP` below the breadcrumb while it
 * shows: it stands on the line the fit keeps free above the content (guide §5.9), so content fitted
 * to that line would touch it. For the apps' viewport and the keyboard create's free area.
 */
export function insetsClearOfBreadcrumb(container: HTMLElement, insets: FitInsets): FitInsets {
  const breadcrumb = container.querySelector<HTMLElement>(`nav.${BREADCRUMBS_CLASS}`);
  if (!breadcrumb || breadcrumb.hidden || breadcrumb.hasAttribute("data-covered")) return insets;
  const box = breadcrumb.getBoundingClientRect();
  if (box.height === 0) return insets;
  const bottom = box.bottom - container.getBoundingClientRect().top;
  return { ...insets, top: Math.max(insets.top, Math.ceil(bottom) + BREADCRUMB_FIT_GAP) };
}
