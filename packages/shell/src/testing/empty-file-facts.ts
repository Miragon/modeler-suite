import type { RelativeBox, ToolWindow } from "./page-tools.js";

/*
 * The in-page side of the `emptyFile` case. Like every probe these run in the browser through
 * `page.evaluate`, so they reference nothing outside their own body.
 */

/** The empty-file hint and what competes with it in the middle (guide §8, §13.5). */
export interface EmptyHintFacts {
  /** `.cd-shell-hint` is in the root and visible. */
  visible: boolean;
  /** The text of its line, `.cd-shell-hint-text`. */
  text: string;
  /** The box around its visible children (line and button), relative to the root's padding box. */
  content: RelativeBox | null;
  /** The accessible names of its visible buttons and links ("Insert example"). */
  actions: string[];
  /** The web app's start screen card is visible. */
  startScreen: boolean;
}

export const emptyHintProbe = ({ root }: { root: string }): EmptyHintFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const card = rootElement.querySelector('[data-chrome="empty-state"]');
  const startScreen = card !== null && tools.visible(card);
  const hint = rootElement.querySelector(".cd-shell-hint");
  if (!hint || !tools.visible(hint)) {
    return { visible: false, text: "", content: null, actions: [], startScreen };
  }
  const boxes = [...hint.children]
    .filter((child) => tools.visible(child))
    .map((child) => tools.box(child, rootElement));
  const content =
    boxes.length === 0
      ? null
      : boxes.reduce((union, box) => {
          const left = Math.min(union.left, box.left);
          const top = Math.min(union.top, box.top);
          return {
            left,
            top,
            width: Math.max(union.left + union.width, box.left + box.width) - left,
            height: Math.max(union.top + union.height, box.top + box.height) - top,
          };
        });
  return {
    visible: true,
    text: (hint.querySelector(".cd-shell-hint-text")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
    content,
    actions: [...hint.querySelectorAll("button, a[href]")]
      .filter((control) => tools.visible(control))
      .map((control) => tools.accessibleName(control)),
    startScreen,
  };
};

/** The view an empty document opened with (guide §5.9). */
export interface EmptyViewFacts {
  /** The readout as a whole percentage; `null` without a readout. */
  zoom: number | null;
  /** `[data-zoom="fit"]` is `aria-disabled="true"`: the content bounds are empty, nothing to fit. */
  fitDisabled: boolean;
  /** The matrix of the diagram-js viewport layer, rounded to 1/1000; `null` without a canvas. */
  view: string | null;
}

export const emptyViewProbe = ({ root }: { root: string }): EmptyViewFacts | null => {
  const rootElement = document.querySelector(root);
  if (!rootElement) return null;
  const readout = rootElement.querySelector('[data-chrome="zoom"] [data-zoom="actual"]');
  const digits = (readout?.textContent ?? "").replace(/[^0-9]/g, "");
  const fit = rootElement.querySelector('[data-chrome="zoom"] [data-zoom="fit"]');
  const viewport = rootElement.querySelector<SVGGraphicsElement>(
    ".djs-container > svg > .viewport",
  );
  const matrix = viewport?.transform?.baseVal?.consolidate?.()?.matrix;
  return {
    zoom: digits ? Number(digits) : null,
    fitDisabled: fit?.getAttribute("aria-disabled") === "true",
    view: matrix
      ? [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
          .map((value) => Math.round(value * 1000) / 1000)
          .join(" ")
      : (viewport?.getAttribute("transform") ?? null),
  };
};

/**
 * The box of an element's own bounds, relative to the root's padding box: diagram-js draws its hit
 * area (`.djs-hit`) at `element.width × element.height`, while the visual may reach past them with
 * a label beside the shape. `null` when the element or its hit area is missing.
 */
export const elementBoundsProbe = ({
  root,
  id,
}: {
  root: string;
  id: string;
}): RelativeBox | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  const shape = [...(rootElement?.querySelectorAll(".djs-container .djs-shape") ?? [])].find(
    (element) => element.getAttribute("data-element-id") === id,
  );
  const hit = shape?.querySelector(":scope > .djs-hit");
  if (!rootElement || !hit) return null;
  return tools.box(hit, rootElement);
};
