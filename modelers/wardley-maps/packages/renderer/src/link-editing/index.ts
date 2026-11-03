import type { ModuleDeclaration } from "didi";
import WardleyLinkEditing from "./WardleyLinkEditing.js";
import WardleyLinkOpener from "./WardleyLinkOpener.js";

/** Inline link (url) editing for components and submaps, and which links the editor opens. */
export const linkEditingModule: ModuleDeclaration = {
  __init__: ["wardleyLinkEditing"],
  wardleyLinkEditing: ["type", WardleyLinkEditing],
  wardleyLinkOpener: ["type", WardleyLinkOpener],
};

export { default as WardleyLinkEditing, canHaveLink, linkOf } from "./WardleyLinkEditing.js";
export { default as WardleyLinkOpener } from "./WardleyLinkOpener.js";
export { sanitizeLinkUrl, isAllowedLinkUrl, isRelativeLink, safeLinkUrl } from "./link-url.js";
export type { WardleyLinksConfig } from "./link-url.js";
