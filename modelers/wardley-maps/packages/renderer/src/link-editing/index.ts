import type { ModuleDeclaration } from "didi";
import WardleyLinkEditing from "./WardleyLinkEditing.js";

/** Inline link (url) editing for components and submaps. */
export const linkEditingModule: ModuleDeclaration = {
  __init__: ["wardleyLinkEditing"],
  wardleyLinkEditing: ["type", WardleyLinkEditing],
};

export { default as WardleyLinkEditing, canHaveLink, linkOf } from "./WardleyLinkEditing.js";
export { sanitizeLinkUrl, isAllowedLinkUrl, isRelativeLink, safeLinkUrl } from "./link-url.js";
export type { WardleyLinksConfig } from "./link-url.js";
