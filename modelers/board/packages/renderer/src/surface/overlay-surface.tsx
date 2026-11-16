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
 * - An editor is host code. What `release()`, `focus()`, `destroy()` or an `onArmedChange`
 *   listener throws is written to the board's log and the surface goes on: the node is armed or
 *   disarmed all the same, and the element of a destroyed editor is removed.
 */
import { useStoreApi } from "@xyflow/react";
import { useCallback, useLayoutEffect, useRef } from "react";

import type { EmbeddedEditor, EmbeddedEditorContext } from "../host/types.js";
import { useBoardContext } from "../runtime/board-context.js";
import type { SurfaceProps } from "../runtime/surface.js";
import { callEditor, contained, type OverlayRuntime, placeHost } from "./place-host.js";

export type { OverlayRuntime };

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * What a host's `open` resolved to is whatever the host returned. An editor has a `ready` to wait
 * for and the two calls the board makes on every editor.
 */
function isEditor(answer: unknown): answer is EmbeddedEditor {
  if (typeof answer !== "object" || answer === null) return false;
  const { ready, release, destroy } = answer as Partial<Record<keyof EmbeddedEditor, unknown>>;
  return (
    typeof (ready as { then?: unknown } | null | undefined)?.then === "function" &&
    typeof release === "function" &&
    typeof destroy === "function"
  );
}

/**
 * Answers true once the component that calls it goes away, with its node or with the whole board.
 * Called before the effect that mounts the editor, so that this cleanup runs first: a new path of
 * the model runs the mount effect's cleanup alone, and there the node stays armed.
 */
function useLeaving(): () => boolean {
  const leaving = useRef(false);
  useLayoutEffect(() => {
    leaving.current = false;
    return () => {
      leaving.current = true;
    };
  }, []);
  return useCallback(() => leaving.current, []);
}

export function OverlaySurface({ nodeId, file, armed, width, height }: SurfaceProps) {
  const { host, store, registerSurface, reportMount, overlayLayer, log } = useBoardContext();
  const flow = useStoreApi();
  const slot = useRef<HTMLDivElement>(null);
  const runtime = useRef<OverlayRuntime | null>(null);
  const latest = useRef({ armed, width, height });
  useLayoutEffect(() => {
    latest.current = { armed, width, height };
  });
  const leaving = useLeaving();

  const place = useCallback(
    (current: OverlayRuntime): void => placeHost(current, overlayLayer(), flow, nodeId, log),
    [flow, nodeId, overlayLayer, log],
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
        for (const listener of [...armedListeners]) {
          contained(log, `${nodeId}: an onArmedChange listener`, () => listener(current.armed));
        }
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
        // nobody's gesture, so not on the history: an undo would send the node to a path that is gone
        if (!cancelled) store.amend((tx) => tx.update(nodeId, { file: to }));
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
      if (!isEditor(editor)) {
        failed(new Error(`${file}: the host returned no editor`));
        return;
      }
      if (cancelled) {
        callEditor(editor, "destroy", nodeId, log);
        return;
      }
      current.editor = editor;
      place(current);
      if (current.armed) callEditor(editor, "focus", nodeId, log);
      editor.ready.then(settleReady, failReady);
    }, failed);

    return () => {
      cancelled = true;
      unregister();
      // The node or the whole board goes while its model is edited: the editor ends what is open
      // first, still armed and still in the layer, as before any other end of the editing
      if (leaving() && current.armed) callEditor(current.editor, "release", nodeId, log);
      callEditor(current.editor, "destroy", nodeId, log);
      element.remove();
      runtime.current = null;
    };
  }, [host, store, nodeId, file, registerSurface, reportMount, place, log, leaving]);

  useLayoutEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.width = width;
    current.height = height;
    if (armed !== current.armed) {
      // while the editor still shows its chrome and has the focus: the sheet hides both with the flag
      if (!armed) callEditor(current.editor, "release", nodeId, log);
      current.armed = armed;
      current.host.dataset.armed = String(armed);
      current.armedChanged();
    }
    place(current);
  }, [place, armed, width, height, nodeId, log]);

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
