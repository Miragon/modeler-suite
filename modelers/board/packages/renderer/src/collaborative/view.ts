/**
 * A part of the contract factory (collaborative.tsx): the view of a board, and the state the
 * parts of one board share.
 */
import { absoluteBoxes } from "@miragon/board-schema-model";
import type { ElementBounds, FreeAreaInsets } from "@miragon/modeler-api";
import { getViewportForBounds, type ReactFlowInstance } from "@xyflow/react";
import type { Root } from "react-dom/client";

import type { Viewport } from "../arming/types.js";
import type { BoardFlowEdge, BoardFlowNode } from "../flow/flow-types.js";
import { FIT_PADDING } from "../runtime/board-context.js";
import type { BoardStore } from "../store/board-store.js";
import type { BoardModelerOptions } from "./api.js";

/** the board's zoom range (board.tsx) */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** an import waits this long for a canvas that was attached and never appeared, then resolves all the same */
const MOUNT_TIMEOUT_MS = 10_000;

/** What the parts of one board share: where it is mounted, its view and whether it still lives. */
export interface BoardSession {
  flow: ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null;
  /** the view asked for last, while React Flow has none to ask (before the canvas exists, after it went) */
  view: Viewport;
  /** the element the board was attached to */
  host: Element | null;
  element: HTMLDivElement | null;
  root: Root | null;
  destroyed: boolean;
  /** the text the change event compared last */
  lastText: string;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** a view a host hands in: three finite numbers, the zoom inside the board's range; anything else is ignored */
export function asViewport(state: unknown): Viewport | undefined {
  if (state === null || typeof state !== "object") return undefined;
  const { x, y, zoom } = state as Record<string, unknown>;
  if (!isNumber(x) || !isNumber(y) || !isNumber(zoom) || zoom <= 0) return undefined;
  return { x, y, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) };
}

const NO_INSETS: FreeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface ViewControl {
  contentBounds(): ElementBounds | undefined;
  fitted(): Viewport;
  setView(next: Viewport): void;
  rendered(): Promise<void>;
  bringIntoView(box: ElementBounds): void;
}

/** `mounted` settles once the canvas exists, or once the board went before its canvas did */
export function createViewControl(
  session: Pick<BoardSession, "flow" | "view" | "host">,
  store: BoardStore,
  options: Pick<BoardModelerOptions, "freeArea">,
  mounted: Promise<void>,
): ViewControl {
  // ── the view (L5): React Flow's viewport, never part of the document ──
  const contentBounds = (): ElementBounds | undefined => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const box of absoluteBoxes(store.getSnapshot()).values()) {
      left = Math.min(left, box.x);
      top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width);
      bottom = Math.max(bottom, box.y + box.height);
    }
    return left <= right && top <= bottom
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : undefined;
  };
  // The host's free area is host code, and an import fits after it wrote: a call that fails is
  // reported once and answered with the insets the host gave last, so no import rejects with a
  // document it already replaced (L7)
  let lastInsets = NO_INSETS;
  let insetsFailed = false;
  const hostInsets = (): FreeAreaInsets => {
    try {
      lastInsets = options.freeArea?.insets?.() ?? NO_INSETS;
    } catch (error) {
      if (!insetsFailed) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[board]", `options.freeArea.insets() failed: ${message}`, error);
      }
      insetsFailed = true;
    }
    return lastInsets;
  };
  /** the content in the host's box, from the document alone: the same text in the same box gives the same view */
  const fitted = (): Viewport => {
    const bounds = contentBounds();
    const width = session.host?.clientWidth ?? 0;
    const height = session.host?.clientHeight ?? 0;
    if (!bounds || width === 0 || height === 0) return { x: 0, y: 0, zoom: 1 };
    const insets = hostInsets();
    const free = {
      width: width - insets.left - insets.right,
      height: height - insets.top - insets.bottom,
    };
    if (free.width <= 0 || free.height <= 0) return { x: 0, y: 0, zoom: 1 };
    const inFree = getViewportForBounds(
      bounds,
      free.width,
      free.height,
      MIN_ZOOM,
      MAX_ZOOM,
      FIT_PADDING,
    );
    return { x: inFree.x + insets.left, y: inFree.y + insets.top, zoom: inFree.zoom };
  };
  const setView = (next: Viewport): void => {
    session.view = next;
    // without a duration React Flow applies it before this call returns
    if (session.flow) void session.flow.setViewport(next);
  };
  /** React committed what the document holds now */
  const rendered = async (): Promise<void> => {
    if (session.host && !session.flow) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        mounted,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, MOUNT_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  /** the element in the host's box: left alone when it is in view, centred when it fits, else fitted */
  const bringIntoView = (box: ElementBounds): void => {
    const width = session.host?.clientWidth ?? 0;
    const height = session.host?.clientHeight ?? 0;
    if (width === 0 || height === 0) return;
    const now = session.flow ? session.flow.getViewport() : session.view;
    const shown = {
      x: -now.x / now.zoom,
      y: -now.y / now.zoom,
      width: width / now.zoom,
      height: height / now.zoom,
    };
    const inside =
      box.x >= shown.x &&
      box.y >= shown.y &&
      box.x + box.width <= shown.x + shown.width &&
      box.y + box.height <= shown.y + shown.height;
    if (inside) return;
    if (box.width <= shown.width && box.height <= shown.height) {
      setView({
        x: width / 2 - (box.x + box.width / 2) * now.zoom,
        y: height / 2 - (box.y + box.height / 2) * now.zoom,
        zoom: now.zoom,
      });
    } else setView(getViewportForBounds(box, width, height, MIN_ZOOM, MAX_ZOOM, FIT_PADDING));
  };
  return { contentBounds, fitted, setView, rendered, bringIntoView };
}
