import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type { Element } from "diagram-js/lib/model/Types";
import { shapeColors } from "../draw/fill.js";
import { COLOR_OPTIONS, COLORS, ROLE_CLASSES } from "../draw/styles.js";
import { isVcShape } from "../model/di-types.js";
import type VcModeling from "../modeling/VcModeling.js";

export const COLOR_PICKER_PROVIDER_ID = "vc-color-picker";

interface PopupMenuEntry {
  label: string;
  group?: string;
  imageHtml?: string;
  action: () => void;
}

/** The fill as the canvas draws it, inside the ink contour, in the mode the canvas draws. */
function swatch(color: string | undefined): string {
  const colors = shapeColors(color);
  const roles = [ROLE_CLASSES.inkStroke, ...(colors.roles ? [colors.roles.fill] : [])];
  return (
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">` +
    `<rect x="1" y="1" width="14" height="14" rx="2" class="${roles.join(" ")}" ` +
    `fill="${colors.fill}" stroke="${COLORS.ink}" stroke-width="2"/></svg>`
  );
}

export default class VcColorPickerProvider {
  static $inject = ["popupMenu", "vcModeling"];

  constructor(
    popupMenu: PopupMenu,
    private readonly vcModeling: VcModeling,
  ) {
    popupMenu.registerProvider(COLOR_PICKER_PROVIDER_ID, this);
  }

  getPopupMenuEntries(target: Element | Element[]): Record<string, PopupMenuEntry> {
    const element = Array.isArray(target) ? target[0] : target;
    if (!isVcShape(element)) {
      return {};
    }

    const entries: Record<string, PopupMenuEntry> = {};
    for (const option of COLOR_OPTIONS) {
      entries[`color-${option.label.toLowerCase()}`] = {
        label: option.label,
        imageHtml: swatch(option.color),
        action: () => this.vcModeling.setColor(element, option.color),
      };
    }
    return entries;
  }
}
