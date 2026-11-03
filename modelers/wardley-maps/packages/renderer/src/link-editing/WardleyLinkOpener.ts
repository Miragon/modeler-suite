import type { WardleyShape } from "../model/di-types.js";
import { canHaveLink, linkOf } from "./WardleyLinkEditing.js";
import { isRelativeLink, safeLinkUrl, type WardleyLinksConfig } from "./link-url.js";

/**
 * Which links of the map this editor can open, and how. The context pad offers "Open link" and the
 * canvas marks the element for exactly these links, so the mark never promises what the pad can't
 * do. Shared maps can carry any address, so only allowlisted ones ever open.
 */
export default class WardleyLinkOpener {
  static $inject = ["config.wardleyLinks"];

  constructor(private readonly config: WardleyLinksConfig | undefined) {}

  /**
   * The element's address when this editor can open it: an allowlisted address with a scheme, or a
   * relative one when the host follows relative links, since the browser would resolve it against
   * the page instead of the map's file.
   */
  openableLink(shape: WardleyShape): string | undefined {
    if (!canHaveLink(shape)) return undefined;
    const address = safeLinkUrl(linkOf(shape));
    if (address === undefined) return undefined;
    return isRelativeLink(address) && !this.config?.openRelative ? undefined : address;
  }

  /**
   * Opens an address `openableLink` returned: a relative one through the host, any other in a new
   * tab unless the host opens it itself.
   */
  open(address: string): void {
    if (isRelativeLink(address)) {
      this.config?.openRelative?.(address);
    } else if (this.config?.openExternal) {
      this.config.openExternal(address);
    } else {
      window.open(address, "_blank", "noopener,noreferrer");
    }
  }
}
