import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { Element } from "diagram-js/lib/model/Types";
import {
  TAPE_COLORS,
  colorName,
  findSticky,
  readableTextColor,
  tapeColor,
} from "@miragon/business-model-canvas-schema-model";
import { COLORS } from "../draw/styles.js";
import { isKeyOnHiddenTarget } from "../keyboard/CanvasKeys.js";
import { isStickyShape } from "../model/di-types.js";
import type CanvasModeling from "../modeling/CanvasModeling.js";

export const COLOR_POPUP_ID = "bmc-color";

/** Marks the sticky's own colour: accent and a trailing check (CSS). */
const ACTIVE_ENTRY = "bmc-popup-active";

/** An empty image slot, so "No colour" lines up with the swatches. */
const NO_IMAGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="18" aria-hidden="true" focusable="false"></svg>';

interface PopupMenuEntry {
  label: string;
  imageHtml?: string;
  className?: string;
  action: () => void;
}

/** A tape colour, with a check when it is the sticky's. */
function swatch(tape: string, checked: boolean): string {
  const check = checked
    ? `<path d="M4.5 8.5 7 11l4.5-5" fill="none" stroke="${readableTextColor(tape, COLORS.ink, COLORS.white)}" ` +
      `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  return (
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">` +
    `<rect x="1" y="1" width="14" height="14" rx="3" fill="${tape}"/>${check}</svg>`
  );
}

/**
 * The sticky's tape: one of the palette's colours, or none. What a colour stands for is the
 * team's to decide, a customer segment, a theme or an owner.
 */
export default class ColorPopupProvider {
  static $inject = ["popupMenu", "canvasModeling"];

  constructor(
    popupMenu: PopupMenu,
    private readonly modeling: CanvasModeling,
  ) {
    popupMenu.registerProvider(COLOR_POPUP_ID, this);
    const trigger = popupMenu.trigger.bind(popupMenu);
    popupMenu.trigger = (event, entry, action) =>
      isKeyOnHiddenTarget(event) ? undefined : trigger(event, entry, action);
  }

  getPopupMenuEntries(target: Element | Element[]): Record<string, PopupMenuEntry> {
    const element = Array.isArray(target) ? target[0] : target;
    if (!isStickyShape(element)) return {};
    const placed = findSticky(this.modeling.document(), element.id);
    if (!placed) return {};
    const { sticky } = placed;
    const current = tapeColor(sticky.color)?.toUpperCase();
    const entries: Record<string, PopupMenuEntry> = {};
    for (const color of TAPE_COLORS) {
      const chosen = current === color.tape.toUpperCase();
      entries[`color-${colorName(color)}`] = {
        label: color.name,
        imageHtml: swatch(color.tape, chosen),
        ...(chosen ? { className: ACTIVE_ENTRY } : {}),
        action: () => this.modeling.setColor(sticky.id, colorName(color)),
      };
    }
    if (sticky.color !== undefined) {
      entries["color-none"] = {
        label: "No colour",
        imageHtml: NO_IMAGE,
        action: () => this.modeling.setColor(sticky.id, undefined),
      };
    }
    return entries;
  }
}
