import type { ModuleDeclaration } from "didi";
import CopyPasteModule from "diagram-js/lib/features/copy-paste";
import VcCopyPaste from "./VcCopyPaste.js";
import VcCopyPasteBehavior from "./VcCopyPasteBehavior.js";

export const vcCopyPasteModule: ModuleDeclaration = {
  __depends__: [CopyPasteModule],
  __init__: ["vcCopyPasteBehavior"],
  copyPaste: ["type", VcCopyPaste],
  vcCopyPasteBehavior: ["type", VcCopyPasteBehavior],
};

export { default as VcCopyPaste, PASTE_OFFSET } from "./VcCopyPaste.js";
export { default as VcCopyPasteBehavior } from "./VcCopyPasteBehavior.js";
