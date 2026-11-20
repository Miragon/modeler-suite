import type { CollaborativeModeler } from "../index.js";
import type { ConformanceHarness } from "./harness.js";

interface AttachedHost {
  /** counts every host attachedHost() made, so a case can tell the ones made during one `create()` */
  serial: number;
  host: HTMLElement;
  wrapper: HTMLElement;
}

let nextSerial = 0;

/**
 * the hosts attachedHost() made that are still in the document: the keys case finds the canvas of
 * the modeler `create()` mounted there, and hides or disables the host the way a host page does
 */
let attachedHosts: AttachedHost[] = [];

/**
 * a host element of the given size, attached to the document — what
 * `create()` should mount into (browser only). The returned element sits
 * INSIDE a sized wrapper: the Miragon renderers restyle the container they
 * are given to 100% × 100%, which then resolves against the wrapper
 */
export function attachedHost(width = 800, height = 600): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:${width}px;height:${height}px;position:absolute;left:0;top:0;overflow:hidden`;
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  wrapper.append(host);
  document.body.append(wrapper);
  attachedHosts = attachedHosts.filter((entry) => entry.wrapper.isConnected);
  attachedHosts.push({ serial: nextSerial++, host, wrapper });
  return host;
}

/**
 * the serial of the next host attachedHost() makes: read before a `create()`, it marks the hosts
 * made during it
 */
export const nextHostSerial = (): number => nextSerial;

/**
 * the one host an instance was mounted into, with the element found in it, or why the kit cannot
 * tell: `canvasElement()` named nothing, the element it named lies in no attachedHost(), or `count`
 * hosts made since the mark hold what the case looks for, where one must
 */
export type HostSearch =
  | { kind: "found"; mount: AttachedHost; element: Element }
  | { kind: "unnamed" }
  | { kind: "outside" }
  | { kind: "not-one"; count: number };

/**
 * the attachedHost() that holds the element `canvasElement` names for `modeler`, or else the one
 * still in the document made at or after `firstSerial` in which `lookFor` finds an element
 */
export function hostMadeSince(
  harness: ConformanceHarness,
  modeler: CollaborativeModeler,
  firstSerial: number,
  lookFor: (host: HTMLElement) => Element | null,
): HostSearch {
  const live = attachedHosts.filter((entry) => entry.wrapper.isConnected);
  if (harness.canvasElement) {
    const named = harness.canvasElement(modeler);
    if (!named) return { kind: "unnamed" };
    const mount = live.find((entry) => entry.host.contains(named));
    return mount === undefined ? { kind: "outside" } : { kind: "found", mount, element: named };
  }
  const made = live.flatMap((mount) => {
    const element = mount.serial >= firstSerial ? lookFor(mount.host) : null;
    return element === null ? [] : [{ mount, element }];
  });
  const [only] = made;
  return only !== undefined && made.length === 1
    ? { kind: "found", ...only }
    : { kind: "not-one", count: made.length };
}
