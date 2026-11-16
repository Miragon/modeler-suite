import { useStoreApi } from "@xyflow/react";
import { type RefObject, useEffect, useRef } from "react";
import { useBoardContext } from "../runtime/board-context.js";

// ── the board zoom for CSS ───────────────────────────────────────────────────

/**
 * The board zoom as `--board-zoom` on ONE element (the returned ref), written inside the pan /
 * zoom tick and with no React render: what is styled against it keeps a least size on screen.
 * On a small subtree only: a custom property restyles everything below the element it is set on.
 */
export function useZoomVar<T extends HTMLElement>(): RefObject<T | null> {
  const element = useRef<T>(null);
  const { subscribeViewport } = useBoardContext();
  const flowStore = useStoreApi();
  useEffect(() => {
    let applied = Number.NaN;
    const apply = (zoom: number): void => {
      if (zoom === applied || !element.current) return;
      applied = zoom;
      element.current.style.setProperty("--board-zoom", String(zoom));
    };
    apply(flowStore.getState().transform[2]);
    return subscribeViewport((viewport) => apply(viewport.zoom));
  }, [flowStore, subscribeViewport]);
  return element;
}
