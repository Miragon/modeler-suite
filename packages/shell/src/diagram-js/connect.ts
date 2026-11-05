import type { Bounds } from "../core/index.js";
import type { ShellHandle } from "../dom/index.js";
import { shellServiceOf } from "./service.js";
import type { DiagramEventListener, EventBusLike, InjectorLike } from "./types.js";
import { DiagramViewport, type Viewport } from "./viewport.js";

/**
 * What `connectDiagramJs` reads of a renderer's `@miragon/modeler-api` contract instance
 * (`createCollaborativeModeler(…)`), typed structurally like the diagram-js services: the content
 * bounds the contract reports since 1.3. `object &` keeps a contract instance from before 1.3, which
 * shares no member with a type of only optional ones, assignable, so a host can pass it next to its
 * own `contentBounds` and drop that fallback once the renderer reports them.
 */
export type CollaborativeModelerLike = object & {
  contentBounds?(): Bounds | undefined;
};

export interface ConnectOptions {
  /**
   * The renderer's contract instance. Its `contentBounds()` (`@miragon/modeler-api` 1.3) is what
   * the viewport fits to unless `contentBounds` is given.
   */
  modeler?: CollaborativeModelerLike | undefined;
  /**
   * Content bounds in diagram coordinates, tight around the content: the fit insets are the only
   * margin (guide §5.9). `undefined` = nothing to fit (empty file). Default: `modeler.contentBounds()`;
   * given, it wins, for a renderer before contract 1.3 or a host that fits to other bounds. One of
   * the two is required.
   */
  contentBounds?: (() => Bounds | undefined) | undefined;
  /**
   * An empty file (guide §13.5: no element, only whitespace, comments or a title), which shows the
   * empty-file hint. Default: `contentBounds()` is empty. A notation whose bounds are never empty
   * (Wardley's plot) passes its own test.
   */
  isEmpty?: (() => boolean) | undefined;
  prefersReducedMotion?: (() => boolean) | undefined;
  /**
   * 0.11: whether the canvas keeps the history and takes Cmd/Ctrl+Z; default everywhere but the
   * `ide` host, where VS Code's document keeps it. An Orca editor's canvas keeps it.
   */
  canvasOwnsHistory?: boolean | undefined;
}

export interface DiagramJsConnection {
  readonly viewport: Viewport;
  /**
   * Unbinds viewport, palette, keys and the hint sync from the shell; destroys neither the diagram
   * nor the shell. Runs by itself on `diagram.destroy`.
   */
  destroy(): void;
}

/** After the viewport's own listeners, so its content state is fresh when the hint reads it. */
const HINT_SYNC_PRIORITY = 500;

/** The host's `contentBounds`, else the contract's; throws when neither is there. */
function contentBoundsOf(options: ConnectOptions): () => Bounds | undefined {
  if (options.contentBounds) return () => options.contentBounds?.();
  const { modeler } = options;
  if (typeof modeler?.contentBounds === "function") return () => modeler.contentBounds?.();
  throw new Error(
    "@miragon/modeler-shell: connectDiagramJs needs the content bounds: pass options.contentBounds, or options.modeler with contentBounds() (@miragon/modeler-api 1.3)",
  );
}

/**
 * Calls `settled` once no font is loading any more and two frames have passed since: the frame
 * that lays out text in the loaded fonts reports the new sizes to every `ResizeObserver` before
 * the second one starts. Returns the function that cancels it.
 */
function whenFontsSettle(fonts: FontFaceSet, settled: () => void): () => void {
  let cancelled = false;
  let frame: number | undefined;
  const afterTwoFrames = (then: () => void): void => {
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        then();
      });
    });
  };
  const waitForFonts = (): void => {
    void fonts.ready.then(() => {
      if (cancelled) return;
      afterTwoFrames(() => {
        if (fonts.status === "loading") waitForFonts();
        else settled();
      });
    });
  };
  waitForFonts();
  return () => {
    cancelled = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}

/**
 * The legend that is open at the start can be measured by the first fit before its font has
 * loaded; the card then settles a pixel or two wider or narrower (Context Maps: about 1.6px) and
 * the content would sit that much off the free rectangle's centre. Until the fonts have loaded, a
 * change of the card's width fits once more (`refitIfOnlyInsetChanged("left")`) while the view and
 * the content bounds are still the fit's and no other inset has changed since. The watch ends after
 * that fit, once the fonts have loaded and the card's size since has been reported, when the legend
 * closes, once the user zooms or pans, and with the connection: every later change keeps the view
 * (guide §5.9). Returns the function that ends it.
 */
function refitWhenLegendSettles(shell: ShellHandle, viewport: DiagramViewport): () => void {
  const legend = shell.legend;
  const fonts = legend?.element.ownerDocument.fonts;
  if (
    !legend?.isOpen() ||
    !fonts ||
    typeof ResizeObserver !== "function" ||
    typeof requestAnimationFrame !== "function"
  ) {
    return () => undefined;
  }
  let stopped = false;
  const observer = new ResizeObserver(() => {
    if (!legend.isOpen() || viewport.refitIfOnlyInsetChanged("left")) stop();
  });
  const unsubscribe = viewport.onChange(() => {
    if (!viewport.isAutomatic()) stop();
  });
  const cancelFontWait = whenFontsSettle(fonts, stop);
  function stop(): void {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    unsubscribe();
    cancelFontWait();
  }
  observer.observe(legend.element);
  return stop;
}

/**
 * Connects a diagram built with `shellModule` to a mounted shell: creates the viewport with
 * `shell.fitInsets` and the content bounds (`options.contentBounds`, else the contract's
 * `options.modeler.contentBounds()`), binds it with `shell.setZoomTarget`, registers the palette
 * (`shell.registerPalette`), keeps the empty-file hint in sync with the diagram (after every
 * `import.done` and `elements.changed`, so the first element created on the canvas hides it),
 * fits once more when an open legend settles after the first fit while its font loads, and calls
 * `canvas.resized()`.
 * Throws when `shellModule` or the content bounds are missing.
 */
export function connectDiagramJs(
  shell: ShellHandle,
  diagram: InjectorLike,
  options: ConnectOptions,
): DiagramJsConnection {
  const service = shellServiceOf(diagram);
  const contentBounds = contentBoundsOf(options);
  const eventBus = diagram.get<EventBusLike>("eventBus");
  const prefersReducedMotion = options.prefersReducedMotion?.bind(options);
  const viewport = new DiagramViewport(diagram, {
    contentBounds,
    insets: () => shell.fitInsets(),
    ...(prefersReducedMotion ? { prefersReducedMotion } : {}),
  });
  shell.setZoomTarget(viewport);
  const detachPalette = service.attachShell(
    shell,
    options.canvasOwnsHistory === undefined ? {} : { canvasOwnsHistory: options.canvasOwnsHistory },
  );
  // The shell has moved the canvas element into its slot; diagram-js caches the old size.
  viewport.resized();

  const isEmpty = options.isEmpty ? () => options.isEmpty?.() === true : () => !viewport.canFit();
  const syncHint: DiagramEventListener = () => shell.setEmptyHint(isEmpty());
  eventBus.on(["import.done", "elements.changed"], HINT_SYNC_PRIORITY, syncHint);
  const stopLegendWatch = refitWhenLegendSettles(shell, viewport);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    eventBus.off(["import.done", "elements.changed"], syncHint);
    eventBus.off("diagram.destroy", destroy);
    stopLegendWatch();
    detachPalette();
    shell.setZoomTarget(null);
    viewport.destroy();
  };
  eventBus.on("diagram.destroy", destroy);
  return { viewport, destroy };
}
