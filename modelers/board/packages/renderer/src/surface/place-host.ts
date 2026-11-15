/**
 * Where the element of a model's editor stands: in its node while the model is a preview, in the
 * board's screen-space layer over the node body while the node is armed. The overlay surface
 * (overlay-surface.tsx) calls this from its effects and from every tick of React Flow's store.
 */
import type { FlowStore } from "../arming/arming-api.js";
import type { EmbeddedEditor } from "../host/types.js";

/** the nearest device pixel: a box on a fractional CSS px is drawn blurred */
function snap(value: number): number {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
}

/** what `hooks.engine(nodeId)` hands a script for such a node */
export interface OverlayRuntime {
  readonly nodeId: string;
  readonly strategy: "overlay";
  /** the editor's host element: in the node (preview) or, armed, in the board's layer */
  readonly host: HTMLDivElement;
  /** the element in the node body the host was created in */
  readonly home: HTMLDivElement;
  /** the host's editor; null until `open` handed it over */
  editor: EmbeddedEditor | null;
  armed: boolean;
  /** container px per flow unit of the editor's view: always 1, the view is never rescaled */
  readonly zoom: 1;
  /** the node body in flow units */
  width: number;
  height: number;
  /** set while the host is in the layer: the node body's place inside the node, and the last rectangle written */
  placed: { bodyLeft: number; bodyTop: number; rect: string } | null;
  /** tells the editor that the node was armed or disarmed */
  armedChanged(): void;
}

/** the host where the state of now wants it: in the layer over the node body, or back in the node */
export function placeHost(
  current: OverlayRuntime,
  layer: HTMLElement | null,
  flow: Pick<FlowStore, "getState">,
  nodeId: string,
): void {
  const { host, home } = current;
  if (current.armed && layer) {
    if (host.parentElement !== layer) {
      // layout px ignore every transform: read once per arming, before the host leaves the node
      const body = home.closest<HTMLElement>(".board-node__body");
      current.placed = {
        bodyLeft: body?.offsetLeft ?? 0,
        bodyTop: body?.offsetTop ?? 0,
        rect: "",
      };
      layer.appendChild(host);
      host.dataset.layout = "overlay";
      // the move took the focus from whatever had it inside
      current.editor?.focus?.();
    }
    const { placed } = current;
    const state = flow.getState();
    const node = state.nodeLookup.get(nodeId);
    if (!placed || !node) return;
    const [x, y, zoom] = state.transform;
    const origin = node.internals.positionAbsolute;
    const left = snap(x + (origin.x + placed.bodyLeft) * zoom);
    const top = snap(y + (origin.y + placed.bodyTop) * zoom);
    const boxWidth = snap(x + (origin.x + placed.bodyLeft + current.width) * zoom) - left;
    const boxHeight = snap(y + (origin.y + placed.bodyTop + current.height) * zoom) - top;
    const rect = `${left},${top},${boxWidth},${boxHeight}`;
    if (rect === placed.rect) return;
    placed.rect = rect;
    const { style } = host;
    style.left = `${left}px`;
    style.top = `${top}px`;
    style.width = `${boxWidth}px`;
    style.height = `${boxHeight}px`;
    return;
  }
  if (host.parentElement !== home) {
    home.appendChild(host);
    host.dataset.layout = "preview";
    const { style } = host;
    style.left = "";
    style.top = "";
    style.width = "";
    style.height = "";
  }
  current.placed = null;
}
