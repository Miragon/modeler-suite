/**
 * A model in a node, edited in place by an editor the host hands in: the node asks the host for
 * the editor of its file (`host.models.open`), gives it an element to fill, and moves that
 * element into the board's screen-space layer while the node is armed. The layer is a child of
 * the board outside its scaled viewport, so no ancestor of the armed editor carries a transform:
 * pointer math is exact and `position: fixed` popups work unpatched.
 *
 * - No view controller. The arm rules arm a node at board zoom exactly 1 and disarm it before a
 *   board zoom, so the armed host has the size of its preview and the editor's own view (its
 *   first fit, then whatever the person did) is never rescaled. With the rules off (`armzoom` off)
 *   this surface is not defined away from zoom 1: the host follows the node's rectangle and the
 *   picture in it is not brought in scale.
 * - Keys. An editor that binds its chrome keys on the document asks `context.armed()` whether
 *   they are its own: the answer is "this node is armed", so of N mounted editors only the armed
 *   one takes them.
 * - Ready and release are the editor's own (`EmbeddedEditor.ready`, `release()`): the board
 *   reads nothing off an editor's DOM.
 */
import { useStoreApi } from "@xyflow/react";
import { useCallback, useLayoutEffect, useRef } from "react";

import type { EmbeddedEditor, EmbeddedEditorContext } from "../host/types.js";
import { useBoardContext } from "../runtime/board-context.js";
import type { SurfaceProps } from "../runtime/surface.js";

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

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

// eslint-disable-next-line max-lines-per-function -- port: split by P3
export function OverlaySurface({ nodeId, file, armed, width, height }: SurfaceProps) {
  const { host, store, registerSurface, reportMount, overlayLayer } = useBoardContext();
  const flow = useStoreApi();
  const slot = useRef<HTMLDivElement>(null);
  const runtime = useRef<OverlayRuntime | null>(null);
  const latest = useRef({ armed, width, height });
  useLayoutEffect(() => {
    latest.current = { armed, width, height };
  });

  /** the host where the state of now wants it: in the layer over the node body, or back in the node */
  const place = useCallback(
    (current: OverlayRuntime): void => {
      const { host, home } = current;
      const layer = overlayLayer();
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
    },
    [flow, nodeId, overlayLayer],
  );

  useLayoutEffect(() => {
    const parent = slot.current;
    if (!parent) return;
    const element = document.createElement("div");
    element.className = "board-engine";
    element.dataset.strategy = "overlay";
    element.dataset.armed = String(latest.current.armed);
    element.dataset.layout = "preview";
    parent.appendChild(element);

    const armedListeners = new Set<(armed: boolean) => void>();
    const current: OverlayRuntime = {
      nodeId,
      strategy: "overlay",
      host: element,
      home: parent,
      editor: null,
      armed: latest.current.armed,
      zoom: 1,
      width: latest.current.width,
      height: latest.current.height,
      placed: null,
      armedChanged: () => {
        for (const listener of [...armedListeners]) listener(current.armed);
      },
    };
    runtime.current = current;

    let cancelled = false;
    let settleReady!: () => void;
    let failReady!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      settleReady = resolve;
      failReady = reject;
    });
    const context: EmbeddedEditorContext = {
      nodeId,
      path: file,
      element,
      armed: () => current.armed,
      onArmedChange: (listener) => {
        armedListeners.add(listener);
        return () => void armedListeners.delete(listener);
      },
      // The model was renamed or moved: the board names it by its path, so the node follows. The new
      // `file` comes back as this component's prop, and the editor is mounted anew on it. Every
      // client that has the board open writes the same value
      relocate: (to) => {
        if (!cancelled) store.gesture((tx) => tx.update(nodeId, { file: to }));
      },
    };
    let opened: Promise<EmbeddedEditor | undefined>;
    try {
      opened = Promise.resolve(host.models?.open(context));
    } catch (error) {
      opened = Promise.reject(error);
    }
    reportMount(nodeId);
    const unregister = registerSurface(nodeId, {
      ready,
      get engine() {
        return current;
      },
      whenInteractive: () => ready.then(nextFrame, () => undefined),
    });

    const failed = (error: unknown): void => {
      if (cancelled) return;
      element.classList.add("board-engine--failed");
      element.textContent = error instanceof Error ? error.message : String(error);
      failReady(error);
    };
    opened.then((editor) => {
      if (editor === undefined) {
        failed(new Error(`${file} cannot be shown here`));
        return;
      }
      if (cancelled) {
        editor.destroy();
        return;
      }
      current.editor = editor;
      place(current);
      if (current.armed) editor.focus?.();
      editor.ready.then(settleReady, failReady);
    }, failed);

    return () => {
      cancelled = true;
      unregister();
      current.editor?.destroy();
      element.remove();
      runtime.current = null;
    };
  }, [host, store, nodeId, file, registerSurface, reportMount, place]);

  useLayoutEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.width = width;
    current.height = height;
    if (armed !== current.armed) {
      // while the editor still shows its chrome and has the focus: the sheet hides both with the flag
      if (!armed) current.editor?.release();
      current.armed = armed;
      current.host.dataset.armed = String(armed);
      current.armedChanged();
    }
    place(current);
  }, [place, armed, width, height]);

  useLayoutEffect(() => {
    // Every update of React Flow's store, synchronously: a pan (a new transform) and a move or
    // resize of the node (new internals). No render, and no write when nothing moved
    const off = flow.subscribe(() => {
      const current = runtime.current;
      if (current?.armed) place(current);
    });
    // the layer is attached by the board's first commit, which may come after this surface's
    const late = requestAnimationFrame(() => {
      const current = runtime.current;
      if (current?.armed) place(current);
    });
    return () => {
      off();
      cancelAnimationFrame(late);
    };
  }, [flow, place]);

  return (
    <div className="board-surface" data-surface="overlay">
      <div ref={slot} className="board-surface__slot" />
      {/* what stays in the node while its editor is in the layer above it */}
      {armed && (
        <div className="board-surface__placeholder">Editing in the layer above the board</div>
      )}
    </div>
  );
}
