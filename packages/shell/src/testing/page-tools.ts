import type { Size } from "../core/index.js";
import type { PageLike } from "./page.js";

/*
 * Everything here that is handed to `page.evaluate` runs in the browser: Playwright serializes the
 * function source, so these functions must not reference anything outside their own body. They
 * only collect facts; every judgement happens in Node (`checks.ts`, `geometry.ts`), where it is
 * unit-tested. `installPageTools` puts the shared helpers and the recorders under one page global.
 */

/** A box relative to the shell root's padding box (where `position: absolute` islands anchor). */
export interface RelativeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A `keydown` that reached the kit's listener on `window` (bubble phase), where VS Code's host page listens. */
export interface RecordedKey {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/** The facts the kit reads about one element. */
export interface ElementFacts {
  tag: string;
  description: string;
  attributes: Record<string, string>;
  text: string;
  visible: boolean;
  /** The native `disabled` property (a disabled `<button>` loses focus, `aria-disabled` keeps it). */
  disabled: boolean;
}

/** The helpers and recorders `installPageTools` keeps under the page global. */
export interface PageTools {
  /** `keydown`s that reached `window`, where VS Code's host page listens. */
  keys: RecordedKey[];
  /**
   * `keydown`s seen on `document` after every listener registered before the kit's (the shell's,
   * the modeler's), so `defaultPrevented` is final even where the shell stops the key.
   */
  documentKeys: RecordedKey[];
  errors: string[];
  injected: Element[];
  cleanups: Array<() => void>;
  armedRoot?: HTMLElement;
  /** Clicks a kit listener counted on a control (the web app's primary action). */
  clicks: number;
  /** Changes of the document's mode the kit records while it switches the web app's appearance. */
  modeWatch?: ModeWatch | undefined;
  /** `newState` of every `beforetoggle` of the web app's toast stack since the kit started listening. */
  toastToggles?: string[] | undefined;
  /** Animations the `reducedMotion` case saw running while it walked the modeler. */
  motionWatch?: MotionWatch | undefined;
  /** The views the canvas showed, frame by frame, while the `reducedMotion` case clicked Fit. */
  viewWatch?: ViewWatch | undefined;
  frame(): Promise<void>;
  settle(): Promise<void>;
  visible(element: Element): boolean;
  container(root: HTMLElement): Size;
  box(element: Element, root: HTMLElement): RelativeBox;
  describe(element: Element): string;
  facts(element: Element): ElementFacts;
  /**
   * The accessible name of a control whose role takes its name from content (a button, a menu
   * item), by this subset of accname 1.2: the elements `aria-labelledby` names, else a non-empty
   * `aria-label`, else the text of its content, else `title`. The content leaves out
   * `aria-hidden="true"`, `hidden` and `display: none` subtrees and text under `visibility: hidden`;
   * a rendered descendant's `aria-label` (an `<img>`'s `alt`) stands for its own content, and a
   * descendant that is not `display: inline` is read apart from its neighbours. Not covered: CSS
   * generated content (`::before`, `::after`), and an element CSS shows despite its `hidden`
   * attribute still counts as hidden. Whitespace collapsed and trimmed.
   */
  accessibleName(element: Element): string;
  /**
   * The accessible description from `aria-describedby`: the text of the elements it names, read as
   * `accessibleName` reads content, an element named there counting even when it is hidden itself.
   */
  accessibleDescription(element: Element): string;
}

export type ToolWindow = Window & { __modelerShellConformance?: PageTools };

/** One change of `<html>`'s mode or of its meta tags, with the animation frame it landed in. */
export interface ModeChange {
  part: "theme" | "kontrast" | "color-scheme" | "theme-color" | "no-transition";
  value: string | null;
  frame: number;
}

export interface ModeWatch {
  changes: ModeChange[];
  stop(): void;
}

/** A transition or an animation that moves: one a style sets, or one the page saw running. */
export interface MotionRecord {
  /** The animated element, with `::before` or `::after` for a pseudo-element. */
  description: string;
  /** A CSS `transition`, a CSS `animation`, or a `script` animation (`element.animate()`). */
  kind: "transition" | "animation" | "script";
  /** The transitioned property or the `@keyframes` name; empty for a script animation. */
  name: string;
  /** How long it runs, in ms; `Infinity` for an endless one. */
  durationMs: number;
}

export interface MotionWatch {
  records(): MotionRecord[];
  stop(): void;
}

export interface ViewWatch {
  /** The viewport layer's matrix (`LabelEditorFacts.view`) whenever a frame showed a new one. */
  views: string[];
  stop(): void;
}

/** Installs the in-page helpers once per document (idempotent; a navigation drops them). */
export const installPageTools = (_: null): void => {
  const scope = window as ToolWindow;
  if (scope.__modelerShellConformance) return;
  const modifierKeys = ["Control", "Meta", "Shift", "Alt", "AltGraph", "CapsLock", "Fn"];
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const borders = (element: Element) => {
    const style = getComputedStyle(element);
    return {
      left: parseFloat(style.borderLeftWidth) || 0,
      top: parseFloat(style.borderTopWidth) || 0,
      right: parseFloat(style.borderRightWidth) || 0,
      bottom: parseFloat(style.borderBottomWidth) || 0,
    };
  };
  const visible = (element: Element): boolean => {
    if (!element.isConnected) return false;
    if (typeof element.checkVisibility === "function") {
      if (!element.checkVisibility({ visibilityProperty: true })) return false;
    } else {
      if (element.closest("[hidden]")) return false;
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (getComputedStyle(node).display === "none") return false;
      }
      if (getComputedStyle(element).visibility === "hidden") return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const describe = (element: Element): string => {
    const id = element.id ? `#${element.id}` : "";
    const classes = [...element.classList]
      .slice(0, 3)
      .map((name) => `.${name}`)
      .join("");
    const chrome = element.getAttribute("data-chrome");
    return `${element.tagName.toLowerCase()}${id}${classes}${chrome ? `[data-chrome="${chrome}"]` : ""}`;
  };
  const hiddenSubtree = (element: Element): boolean =>
    element.getAttribute("aria-hidden") === "true" ||
    element.hasAttribute("hidden") ||
    getComputedStyle(element).display === "none";
  const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();
  const contentText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      // visibility inherits, but a descendant may turn it back on, so it is read per text node
      const parent = node.parentElement;
      return parent && getComputedStyle(parent).visibility === "hidden"
        ? ""
        : (node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as Element;
    if (hiddenSubtree(element)) return "";
    const style = getComputedStyle(element);
    const rendered = style.visibility !== "hidden";
    const alternative =
      (rendered && element.getAttribute("aria-label")?.trim()) ||
      (rendered && element.localName === "img" && element.getAttribute("alt")) ||
      [...element.childNodes].map(contentText).join("");
    // Chrome reads anything but an inline box (a block, a flex item, an inline-block, display:
    // contents) apart from its neighbours; an engine that computes no display reads as inline
    return ["", "inline"].includes(style.display) ? alternative : ` ${alternative} `;
  };
  const ownName = (element: Element): string =>
    collapse(element.getAttribute("aria-label") ?? "") ||
    collapse([...element.childNodes].map(contentText).join(""));
  const referenced = (element: Element, attribute: string): Element[] =>
    (element.getAttribute(attribute) ?? "")
      .split(/\s+/)
      .map((id) => (id ? document.getElementById(id) : null))
      .filter((target): target is HTMLElement => target !== null);
  const accessibleName = (element: Element): string =>
    collapse(referenced(element, "aria-labelledby").map(ownName).join(" ")) ||
    ownName(element) ||
    collapse(element.getAttribute("title") ?? "");
  const accessibleDescription = (element: Element): string =>
    collapse(referenced(element, "aria-describedby").map(ownName).join(" "));
  const tools: PageTools = {
    keys: [],
    documentKeys: [],
    errors: [],
    injected: [],
    cleanups: [],
    clicks: 0,
    frame,
    async settle() {
      await frame();
      await frame();
      const running =
        typeof document.getAnimations === "function"
          ? document.getAnimations().filter((animation) => {
              const end = animation.effect?.getComputedTiming().endTime;
              return (
                animation.playState === "running" && typeof end === "number" && Number.isFinite(end)
              );
            })
          : [];
      if (running.length > 0) {
        await Promise.race([
          Promise.allSettled(running.map((animation) => animation.finished)),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]);
      }
      await frame();
    },
    visible,
    container(root) {
      const rect = root.getBoundingClientRect();
      const border = borders(root);
      return {
        width: rect.width - border.left - border.right,
        height: rect.height - border.top - border.bottom,
      };
    },
    box(element, root) {
      const rect = element.getBoundingClientRect();
      const origin = root.getBoundingClientRect();
      const border = borders(root);
      return {
        left: rect.left - origin.left - border.left,
        top: rect.top - origin.top - border.top,
        width: rect.width,
        height: rect.height,
      };
    },
    describe,
    facts(element) {
      const attributes: Record<string, string> = {};
      for (const name of element.getAttributeNames())
        attributes[name] = element.getAttribute(name) ?? "";
      return {
        tag: element.tagName.toLowerCase(),
        description: describe(element),
        attributes,
        text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
        visible: visible(element),
        disabled: Boolean((element as HTMLButtonElement).disabled),
      };
    },
    accessibleName,
    accessibleDescription,
  };
  const recorder = (into: RecordedKey[]) => (event: KeyboardEvent) => {
    if (modifierKeys.includes(event.key)) return;
    into.push({
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      defaultPrevented: event.defaultPrevented,
    });
  };
  document.addEventListener("keydown", recorder(tools.documentKeys));
  window.addEventListener("keydown", recorder(tools.keys));
  window.addEventListener("error", (event) => {
    tools.errors.push(event.message || String(event.error));
  });
  window.addEventListener("unhandledrejection", (event) => {
    tools.errors.push(`unhandled rejection: ${String(event.reason)}`);
  });
  scope.__modelerShellConformance = tools;
};

/**
 * The helpers are still in the page: the document they went into is still the page's, which a
 * navigation that changes only the URL fragment keeps.
 */
export const pageToolsKeptProbe = (_: null): boolean =>
  (window as ToolWindow).__modelerShellConformance !== undefined;

/** Runs `pageFunction` in the page after making sure the helpers are installed. */
export async function inPage<Arg, Result>(
  page: PageLike,
  pageFunction: (arg: Arg) => Result | Promise<Result>,
  arg: Arg,
): Promise<Result> {
  await page.evaluate(installPageTools, null);
  return page.evaluate(pageFunction, arg);
}

/** Two frames plus every finite running animation (pop-ins, slide-ins), capped at 2s. */
export const settleInPage = (_: null): Promise<void> =>
  (window as ToolWindow).__modelerShellConformance!.settle();

export function settle(page: PageLike): Promise<void> {
  return inPage(page, settleInPage, null);
}

/** The controls the kit hovers, clicks or focuses, found inside the shell root. */
export type ChromeTarget =
  | "menu"
  | "palette-entry"
  | "palette-tab-stop"
  | "zoom-out"
  | "zoom-actual"
  | "zoom-in"
  | "zoom-fit"
  | "canvas"
  | "primary"
  | "pill";

export const CHROME_TARGET_SELECTORS: Readonly<Record<ChromeTarget, string>> = {
  menu: '[data-chrome="menu"]',
  "palette-entry": '[data-chrome="palette"] [data-action]',
  "palette-tab-stop": '[data-chrome="palette"] [data-action][tabindex="0"]',
  "zoom-out": '[data-chrome="zoom"] [data-zoom="out"]',
  "zoom-actual": '[data-chrome="zoom"] [data-zoom="actual"]',
  "zoom-in": '[data-chrome="zoom"] [data-zoom="in"]',
  "zoom-fit": '[data-chrome="zoom"] [data-zoom="fit"]',
  canvas: ".djs-container > svg",
  primary: '[data-chrome="primary"]',
  pill: '[data-chrome="problems"]',
};

export interface TargetFacts {
  /** Viewport coordinates of the centre, for `page.mouse`. */
  client: { x: number; y: number };
  box: RelativeBox;
  /** `aria-label`, else the text. */
  label: string;
}

/** The first visible match of `selector` inside the root; `null` when there is none. */
export const targetProbe = ({
  root,
  selector,
}: {
  root: string;
  selector: string;
}): TargetFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const element = [...rootElement.querySelectorAll(selector)].find((candidate) =>
    tools.visible(candidate),
  );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    client: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    box: tools.box(element, rootElement),
    label: (element.getAttribute("aria-label") ?? element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  };
};

export async function findTarget(
  page: PageLike,
  root: string,
  target: ChromeTarget,
): Promise<TargetFacts | null> {
  return inPage(page, targetProbe, { root, selector: CHROME_TARGET_SELECTORS[target] });
}

/** The document's language, which decides whether names compare with the default messages. */
export const documentLangProbe = (_: null): string => document.documentElement.lang;

/** Viewport centre of the visible item `menuId` of the open menu, for `page.mouse`. */
export const menuItemProbe = ({
  root,
  menuId,
}: {
  root: string;
  menuId: string;
}): { x: number; y: number } | null => {
  const item = document
    .querySelector(root)
    ?.querySelector(`[role="menu"] [data-menu-id="${menuId}"]`);
  if (!item) return null;
  const rect = item.getBoundingClientRect();
  return rect.width > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
};

/** Focuses the first match of `selector` inside the root; the description of the focused element. */
export const focusProbe = ({
  root,
  selector,
}: {
  root: string;
  selector: string;
}): string | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const element = document.querySelector(root)?.querySelector<HTMLElement | SVGElement>(selector);
  if (!element) return null;
  element.focus();
  return document.activeElement === element ? tools.describe(element) : null;
};

export async function focusTarget(
  page: PageLike,
  root: string,
  target: ChromeTarget,
): Promise<string | null> {
  return inPage(page, focusProbe, { root, selector: CHROME_TARGET_SELECTORS[target] });
}

/** A visible popup with `role` inside the root (the dropdown, the chrome tooltip). */
export interface OverlayFacts {
  box: RelativeBox;
  text: string;
  /** How many visible elements carry the role. */
  count: number;
  id: string;
}

export const overlayProbe = ({
  root,
  role,
}: {
  root: string;
  role: string;
}): OverlayFacts | null => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (!rootElement) return null;
  const shown = [...rootElement.querySelectorAll(`[role="${role}"]`)].filter((element) =>
    tools.visible(element),
  );
  const first = shown[0];
  if (!first) return null;
  return {
    box: tools.box(first, rootElement),
    text: (first.textContent ?? "").replace(/\s+/g, " ").trim(),
    count: shown.length,
    id: first.id,
  };
};

export async function findOverlay(
  page: PageLike,
  root: string,
  role: "menu" | "tooltip",
): Promise<OverlayFacts | null> {
  return inPage(page, overlayProbe, { root, role });
}

export interface PressFacts {
  /** The readout as a whole percentage; `null` without a readout. */
  zoom: number | null;
  keys: RecordedKey[];
  documentKeys: RecordedKey[];
}

/** After a key press: settles, then reads the readout and takes the keys `window` and `document` saw. */
export const afterPressProbe = async ({ root }: { root: string }): Promise<PressFacts> => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  await tools.settle();
  const readout = document
    .querySelector(root)
    ?.querySelector('[data-chrome="zoom"] [data-zoom="actual"]')?.textContent;
  const digits = (readout ?? "").replace(/[^0-9]/g, "");
  return {
    zoom: digits ? Number(digits) : null,
    keys: tools.keys.splice(0),
    documentKeys: tools.documentKeys.splice(0),
  };
};

/** Drops what `window` saw so far. */
export const clearKeysProbe = (_: null): void => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  tools.keys.splice(0);
  tools.documentKeys.splice(0);
};

export type InjectedKind =
  | "input"
  | "textarea"
  | "contenteditable"
  | "editcontext"
  | "monaco"
  | "modal"
  | "popover"
  | "dialog"
  | "modal-dialog"
  | "focus-target";

/** The browser has `EditContext` (Chromium), so an `editcontext` stand-in can be injected. */
export const editContextProbe = (_: null): boolean =>
  typeof (window as { EditContext?: unknown }).EditContext === "function";

/**
 * Adds a stand-in for what modelers render inside the shell (text fields: an input, a textarea, an
 * editable label, an element editing through an `EditContext`, an element inside a Monaco editor; a
 * modal dialog and a popover by their ARIA roles, a `<dialog>` opened with `show()` or
 * `showModal()`, a plain focus target), inside the root or, once it is gone, the body; focuses it.
 * `false` for an `editcontext` stand-in in a browser without `EditContext`.
 */
export const injectProbe = ({ root, kind }: { root: string; kind: InjectedKind }): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const parent = document.querySelector(root) ?? tools.armedRoot ?? document.body;
  const host = parent.isConnected ? parent : document.body;
  const element =
    kind === "input" || kind === "textarea"
      ? document.createElement(kind)
      : kind === "dialog" || kind === "modal-dialog"
        ? document.createElement("dialog")
        : (document.createElement("div") as HTMLElement);
  element.setAttribute("data-modeler-shell-conformance", kind);
  element.style.cssText = "position:absolute;left:0;top:0;width:40px;height:20px;";
  if (kind === "modal" || kind === "popover") {
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "Conformance stand-in");
    if (kind === "modal") element.setAttribute("aria-modal", "true");
  }
  if (kind === "editcontext") {
    const EditContext = (window as { EditContext?: new () => object }).EditContext;
    if (!EditContext) return false;
    (element as HTMLElement & { editContext: object | null }).editContext = new EditContext();
  }
  // Monaco focuses an element of its own inside .monaco-editor, neither an input nor contenteditable.
  const focused = kind === "monaco" ? element.appendChild(document.createElement("div")) : element;
  if (kind === "monaco") element.className = "monaco-editor";
  if (kind === "contenteditable") element.setAttribute("contenteditable", "true");
  else if (kind !== "input" && kind !== "textarea") focused.tabIndex = -1;
  host.append(element);
  tools.injected.push(element);
  if (element instanceof HTMLDialogElement) {
    if (kind === "modal-dialog") element.showModal();
    else element.show();
  }
  focused.focus();
  return document.activeElement === focused;
};

export const removeInjectedProbe = (_: null): void => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  for (const element of tools.injected.splice(0)) element.remove();
  for (const cleanup of tools.cleanups.splice(0)) cleanup();
};

/**
 * Activates the first match of `selector` inside the root with `HTMLElement.click()`: its action
 * runs as on a click, but no pointer moves the focus (`detail` is 0, as for Enter or Space).
 */
export const scriptedClickProbe = ({
  root,
  selector,
}: {
  root: string;
  selector: string;
}): boolean => {
  const element = document.querySelector(root)?.querySelector<HTMLElement>(selector);
  if (!element) return false;
  element.click();
  return true;
};

/** A key the kit delivers to the canvas `<svg>` without focusing it. */
export interface CanvasKey {
  key: string;
  code: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

/** Dispatches `keydown` and `keyup` of `key` at the canvas `<svg>`; the focus stays where it is. */
export const canvasKeyProbe = ({ root, key }: { root: string; key: CanvasKey }): boolean => {
  const svg = document.querySelector(root)?.querySelector(".djs-container > svg");
  if (!svg) return false;
  const init: KeyboardEventInit = {
    key: key.key,
    code: key.code,
    ctrlKey: key.ctrlKey === true,
    shiftKey: key.shiftKey === true,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  svg.dispatchEvent(new KeyboardEvent("keydown", init));
  svg.dispatchEvent(new KeyboardEvent("keyup", init));
  return true;
};

/** Makes the canvas `<svg>` handle `key` (`preventDefault`), as a modeler's own canvas binding would. */
export const canvasHandlesProbe = ({ root, key }: { root: string; key: string }): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const svg = document.querySelector(root)?.querySelector(".djs-container > svg");
  if (!svg) return false;
  const listener = (event: Event) => {
    if ((event as KeyboardEvent).key === key) event.preventDefault();
  };
  svg.addEventListener("keydown", listener);
  tools.cleanups.push(() => svg.removeEventListener("keydown", listener));
  return true;
};

/** Remembers the root right before `destroy` (its class is gone afterwards) and clears the recorders. */
export const armCleanupProbe = ({ root }: { root: string }): boolean => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const rootElement = document.querySelector<HTMLElement>(root);
  if (rootElement) tools.armedRoot = rootElement;
  tools.errors.splice(0);
  tools.keys.splice(0);
  tools.documentKeys.splice(0);
  return Boolean(rootElement);
};

/** What the shell left behind after `destroy`. */
export interface LeftoverFacts {
  /** Elements (other than `<html>`) with a `cd-shell*` class. */
  classedElements: string[];
  /** `cd-shell*` classes on `<html>`. */
  documentClasses: string[];
  /** Elements still carrying `data-chrome`. */
  chromeElements: string[];
  /** The remembered root's `class` and attributes. */
  rootClasses: string[];
  rootAttributes: string[];
  errors: string[];
}

export const leftoverProbe = (_: null): LeftoverFacts => {
  const tools = (window as ToolWindow).__modelerShellConformance!;
  const ours = (element: Element) => element.hasAttribute("data-modeler-shell-conformance");
  const shellClass = (name: string) => name.startsWith("cd-shell");
  const root = tools.armedRoot;
  return {
    classedElements: [...document.querySelectorAll("[class]")]
      .filter((element) => element !== document.documentElement && !ours(element))
      .filter((element) => [...element.classList].some(shellClass))
      .map((element) => tools.describe(element)),
    documentClasses: [...document.documentElement.classList].filter(shellClass),
    chromeElements: [...document.querySelectorAll("[data-chrome]")].map((element) =>
      tools.describe(element),
    ),
    rootClasses: root ? [...root.classList].filter(shellClass) : [],
    rootAttributes: root ? root.getAttributeNames() : [],
    errors: [...tools.errors],
  };
};

/** Puts a foreign page's `<html>` in a mode, as a themed host page around an embedded modeler. */
export const hostPageModeProbe = ({
  theme,
  kontrast,
}: {
  theme: string;
  kontrast: string | null;
}): void => {
  const html = document.documentElement;
  html.setAttribute("data-cd-theme", theme);
  if (kontrast) html.setAttribute("data-cd-kontrast", kontrast);
  else html.removeAttribute("data-cd-kontrast");
};
