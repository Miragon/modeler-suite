import type Canvas from "diagram-js/lib/core/Canvas";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import { canvasSvg } from "./canvas-focus.js";

/**
 * Whether the board may look at this keydown at all: a synthetic `keydown` can come without a key,
 * a listener closer to the target (a menu, a dialog, a host's chrome) may have handled it already,
 * and a key typed while an input method composes belongs to the composition.
 */
export function isUnhandledKey(event: KeyboardEvent): boolean {
  return typeof event.key === "string" && !event.defaultPrevented && !event.isComposing;
}

/**
 * Whether the key is aimed at the canvas: its target is the canvas `<svg>` or lies inside it, the
 * element diagram-js 15 binds its own keyboard to. `<body>` does not count: right after a load,
 * after a click on page text or while a host hides the canvas, a key there is the page's. Nor does
 * a canvas inside an `inert` subtree or below an ancestor with `display: none` or
 * `visibility: hidden`: Chromium moves the focus off an element the host made inert or hid only at
 * its next rendering update, so until then the key still reaches the `<svg>`.
 */
export function targetsCanvas(event: Event, canvas: Pick<Canvas, "getContainer">): boolean {
  const svg = canvasSvg(canvas);
  const target = event.target;
  return (
    svg !== null &&
    target instanceof Element &&
    svg.contains(target) &&
    target.closest("[inert]") === null &&
    isRendered(svg)
  );
}

/**
 * Whether a key reaches an element the host made inert or hid, before the browser moved the focus
 * off it. The board's own chrome (the label editors, the colour picker, the popup menu) leaves such
 * a key to the page, as the canvas does. The colour picker's swatches ask it of their click too:
 * Enter on a focused button still clicks it once the host hid it.
 */
export function isKeyOnHiddenTarget(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && (target.closest("[inert]") !== null || !isRendered(target));
}

const menusLeavingHiddenKeys = new WeakSet<object>();

/**
 * diagram-js's popup menu runs its selected entry on Enter, also on one the browser still sends to
 * a menu the host made inert or hid: such a key picks nothing and goes on to the page unprevented.
 */
export function leaveKeysOnHiddenMenuToPage(popupMenu: Pick<PopupMenu, "trigger">): void {
  if (menusLeavingHiddenKeys.has(popupMenu)) return;
  menusLeavingHiddenKeys.add(popupMenu);
  const trigger = popupMenu.trigger.bind(popupMenu);
  popupMenu.trigger = (event, entry, action) =>
    isKeyOnHiddenTarget(event) ? undefined : trigger(event, entry, action);
}

/**
 * `opacity: 0` keeps the focus and the keys. Without `checkVisibility` (Safari before 17.4) the
 * browser's focus fixup alone has to do.
 */
export function isRendered(element: Element): boolean {
  return (
    typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true })
  );
}
