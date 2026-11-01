import type { ModuleDeclaration } from "didi";
import C4HitProvider from "./C4HitProvider.js";
import C4Layers from "./C4Layers.js";
import C4Renderer from "./C4Renderer.js";
import FontRelayout from "./FontRelayout.js";
import SceneLookup from "./SceneLookup.js";

/**
 * The drawing (SPEC 6): `c4Renderer` for element shapes, boundaries and relationships, `c4Layers`
 * for the group frames and the title block, `c4HitProvider` for hit areas, `c4FontRelayout` for the
 * relayout once Geist arrived. Each reads the current scene from `c4Scene` when it draws.
 */
export const drawModule: ModuleDeclaration = {
  __init__: ["c4Renderer", "c4Layers", "c4HitProvider", "c4FontRelayout"],
  c4SceneLookup: ["type", SceneLookup],
  c4Renderer: ["type", C4Renderer],
  c4Layers: ["type", C4Layers],
  c4HitProvider: ["type", C4HitProvider],
  c4FontRelayout: ["type", FontRelayout],
};

export { default as C4Layers } from "./C4Layers.js";
export { default as C4Renderer } from "./C4Renderer.js";
export { default as FontRelayout, TEXT_RELAYOUT_EVENT, fontsReady } from "./FontRelayout.js";
export {
  default as SceneLookup,
  KIND_LABELS,
  defaultElementStyle,
  previewElement,
} from "./SceneLookup.js";
export {
  FRAMES_LAYER,
  FRAMES_LAYER_INDEX,
  TITLE_LAYER,
  TITLE_LAYER_INDEX,
  drawsTitle,
} from "./C4Layers.js";
export { DRILL_CLASS, drillBadgeLayout, type DrillBadgeLayout } from "./drillBadge.js";
export { drawBoundary, drawElement, drawRelationship, shapeOutline } from "./drawItems.js";
export { drawSignature } from "./signature.js";
export {
  PREVIEW_SIZE,
  boundaryPreviewSvg,
  groupPreviewSvg,
  relationshipPreviewSvg,
  shapePreviewSvg,
} from "./preview.js";
export { drawnShape, type DrawnShape } from "./shapes.js";
export {
  COLORS,
  FONT,
  ROLE_LIGHT,
  SELF_SET_TEXT,
  applyRole,
  type FillRole,
  type RoleClass,
  type StrokeRole,
} from "./styles.js";
export { ICONS, paletteEntryHtml } from "./icons.js";
export { LUCIDE, LUCIDE_STROKE_WIDTH, PALETTE_TOOL_ICON, lucideIcon } from "./lucide.js";
