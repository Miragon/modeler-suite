import { vi } from "vitest";

import type { ZoomTarget } from "../../src/core/index.js";
import { mountShell } from "../../src/dom/mount.js";
import type {
  PaletteReadOnlyState,
  PaletteRegistration,
  ShellHandle,
  ShellOptions,
  TooltipContent,
} from "../../src/dom/types.js";

/** happy-dom has no layout: boxes are set per element. */
export function setBox(
  element: Element,
  box: { left: number; top: number; width: number; height: number },
): void {
  const rect = {
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    right: box.left + box.width,
    bottom: box.top + box.height,
  };
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ ...rect, toJSON: () => rect }),
  });
}

export function setContainerSize(root: HTMLElement, width: number, height: number): void {
  Object.defineProperty(root, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: height });
  setBox(root, { left: 0, top: 0, width, height });
}

export class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  static resize(element: Element): void {
    for (const observer of FakeResizeObserver.instances) {
      if (observer.observed.has(element)) {
        observer.callback([], observer as unknown as ResizeObserver);
      }
    }
  }
}

export interface FakeZoomTarget extends ZoomTarget {
  current: number;
  fittable: boolean;
  readonly calls: string[];
  /** Calls every `onChange` listener, as the viewport does after a viewbox change. */
  change(next?: number): void;
  readonly listeners: Set<() => void>;
}

export function fakeZoomTarget(zoom = 1): FakeZoomTarget {
  const listeners = new Set<() => void>();
  const target: FakeZoomTarget = {
    current: zoom,
    fittable: true,
    calls: [],
    listeners,
    zoom: vi.fn(() => target.current),
    stepZoom: (direction) => {
      target.calls.push(`step:${direction}`);
    },
    zoomToActual: () => {
      target.calls.push("actual");
    },
    fit: () => {
      target.calls.push("fit");
    },
    canFit: () => target.fittable,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change(next) {
      if (next !== undefined) target.current = next;
      for (const listener of listeners) listener();
    },
  };
  return target;
}

export interface FakePalette extends PaletteRegistration {
  readonly readOnlyCalls: PaletteReadOnlyState[];
  entry(action: string, content: TooltipContent | null): HTMLElement;
}

export function fakePalette(ownerDocument: Document = document): FakePalette {
  const element = ownerDocument.createElement("div");
  element.className = "djs-palette";
  element.dataset.chrome = "palette";
  const contents = new Map<string, TooltipContent | null>();
  const readOnlyCalls: PaletteReadOnlyState[] = [];
  return {
    element,
    readOnlyCalls,
    entryTooltip: (entry) => contents.get(entry.dataset.action ?? "") ?? null,
    setReadOnly: (state) => {
      readOnlyCalls.push({ ...state });
    },
    entry(action, content) {
      const entry = ownerDocument.createElement("div");
      entry.className = "entry";
      entry.dataset.action = action;
      entry.tabIndex = 0;
      contents.set(action, content);
      element.append(entry);
      return entry;
    },
  };
}

const mounted: ShellHandle[] = [];

/** `mountShell` on a fresh, sized root in the body; `cleanup()` destroys it. */
export function mount(
  options: Partial<ShellOptions> = {},
  size: { width: number; height: number } = { width: 1280, height: 900 },
): { shell: ShellHandle; root: HTMLElement } {
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  setContainerSize(root, size.width, size.height);
  const shell = mountShell(root, { host: "ide", platform: "mac", lang: "en", ...options });
  mounted.push(shell);
  return { shell, root };
}

export function installFakes(): void {
  FakeResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
}

export function cleanup(): void {
  for (const shell of mounted.splice(0)) shell.destroy();
  document.body.replaceChildren();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("lang");
  vi.unstubAllGlobals();
  vi.useRealTimers();
}

export function keydown(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

export function keyup(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/**
 * The keys of the `keyup`s that reach a listener on `document` in the bubble phase, where
 * diagram-js's dragging cancels a waiting drag on Escape.
 */
export function documentKeyups(): { seen: string[]; dispose(): void } {
  const seen: string[] = [];
  const listener = (event: KeyboardEvent) => seen.push(event.key);
  document.addEventListener("keyup", listener);
  return { seen, dispose: () => document.removeEventListener("keyup", listener) };
}

export function pointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: type !== "pointerenter" && type !== "pointerleave",
    cancelable: true,
    pointerType: "mouse",
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

/** A click as a pointer gives it (`detail` 1) or as Enter, Space and `element.click()` do (`detail` 0). */
export function click(target: EventTarget, detail: number): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, detail });
  target.dispatchEvent(event);
  return event;
}

/** A canvas slot as diagram-js fills it: `.djs-container` around a focusable `<svg>`. */
export function canvasWithSvg(): { canvas: HTMLElement; svg: SVGSVGElement } {
  const canvas = document.createElement("div");
  const container = document.createElement("div");
  container.className = "djs-container";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("tabindex", "0");
  container.append(svg);
  canvas.append(container);
  return { canvas, svg };
}

/** A zoom target whose `focus` puts the focus on `svg`, as the adapter's `canvas.focus()` does. */
export function focusingZoomTarget(svg: SVGElement, zoom = 1): FakeZoomTarget {
  const target = fakeZoomTarget(zoom);
  target.focus = () => {
    target.calls.push("focus");
    svg.focus();
  };
  return target;
}

export function chrome(root: HTMLElement, name: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-chrome="${name}"]`);
  if (!element) throw new Error(`no [data-chrome="${name}"]`);
  return element;
}
