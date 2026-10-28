import type { FreeArea, FreeAreaInsets } from "@miragon/modeler-api";

/** Margins (screen px) the renderer's own palette needs, without a host's chrome around it. */
const OWN_PALETTE_INSETS: FreeAreaInsets = { top: 84, right: 56, bottom: 56, left: 56 };

/**
 * The margins a host's chrome covers right now. A free area given only by its `center` names no
 * rectangle, so it keeps the room of the renderer's own palette, as no free area does.
 */
export function freeAreaInsets(freeArea: FreeArea | undefined): FreeAreaInsets {
  return freeArea?.insets?.() ?? OWN_PALETTE_INSETS;
}
