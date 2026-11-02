import type { ModuleDeclaration } from "didi";
import CreatePreviewLook from "./CreatePreviewLook.js";
import FramePreview from "./FramePreview.js";

/** The live feedback of a move, create or resize: the frames it changes and the create's look. */
export const framePreviewModule: ModuleDeclaration = {
  __init__: ["c4FramePreview", "c4CreatePreviewLook"],
  c4FramePreview: ["type", FramePreview],
  c4CreatePreviewLook: ["type", CreatePreviewLook],
};

export {
  default as FramePreview,
  FRAME_PREVIEW_CLASS,
  FRAME_PREVIEW_ITEM_CLASS,
  FRAME_PREVIEW_LAYER,
  FRAME_WARNING_CLASS,
  STALE_FRAME_CLASS,
} from "./FramePreview.js";
export { FRAME_CAPTION_CLASS, FRAME_WARNING_CHIP_CLASS, overlapText } from "./frameCaption.js";
export { default as CreatePreviewLook, CREATE_PREVIEW_CLASS } from "./CreatePreviewLook.js";
export { createdParentId, framingBoundaries, membersWithCreated } from "./createdMembers.js";
