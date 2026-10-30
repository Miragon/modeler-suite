import { decideKey, isTextField, type ChromeKey, type ShellHost } from "../core/index.js";

export interface KeyListenerContext {
  host: ShellHost;
  ownerDocument: Document;
  /** Where dialogs and popovers count: the document in an own document, else the shell root. */
  dialogScope: ParentNode;
  /** A node inside the shell root that lies neither on the canvas nor in the palette. */
  isChrome(node: Node): boolean;
  menuOpen(): boolean;
  /** The web app's start screen shows: the zoom keys belong to the browser (`KeyContext.startScreen`). */
  startScreen?: (() => boolean) | undefined;
  closeMenu(): void;
  hideTooltip(): void;
  run(key: ChromeKey): void;
}

// A dialog a modeler hides through CSS (a class with display: none) is closed as well.
function isShown(element: Element): boolean {
  if (element.localName === "dialog" && !element.hasAttribute("open")) return false;
  if (element.closest("[hidden]")) return false;
  return (
    typeof element.checkVisibility !== "function" ||
    element.checkVisibility({ visibilityProperty: true })
  );
}

function isModal(element: Element): boolean {
  if (element.getAttribute("aria-modal") === "true") return true;
  try {
    return element.matches(":modal");
  } catch {
    return false;
  }
}

function openDialogs(scope: ParentNode): Element[] {
  return [...scope.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog')].filter(
    isShown,
  );
}

/** A shown modal dialog in `scope`, by the keys' own test (the drop zone forbids drops meanwhile). */
export function isModalOpen(scope: ParentNode): boolean {
  return openDialogs(scope).some(isModal);
}

/**
 * Keeps the `keyup` of an Escape that is the chrome's (one a layer took: the menu, a popover, a
 * dialog; one aimed at the chrome) from the page: diagram-js's dragging cancels the drag a tool
 * armed from the palette waits with on any Escape `keyup` on the document, whatever its target
 * (guide §5.4). The next press of Escape lets its own `keyup` through, in case the window lost the
 * focus before this press was released.
 */
export function stopEscapeKeyup(ownerDocument: Document): void {
  const onKeyup = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    release();
  };
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.repeat) release();
  };
  function release(): void {
    ownerDocument.removeEventListener("keyup", onKeyup, true);
    ownerDocument.removeEventListener("keydown", onKeydown, true);
  }
  ownerDocument.addEventListener("keyup", onKeyup, true);
  ownerDocument.addEventListener("keydown", onKeydown, true);
}

function isNode(target: EventTarget | null): target is Node {
  return typeof (target as Partial<Node> | null)?.nodeType === "number";
}

/**
 * An Escape pressed in an open dialog or popover, or while a modal one makes the page behind it
 * inert, is that layer's and never the canvas's (guide §5.4), also when a field in it takes the
 * key. A modeler's own dialog ("Map title…") leaves Escape to the browser, so the shell keeps its
 * `keyup` from the page for it.
 */
function isLayerEscape(event: KeyboardEvent, dialogs: readonly Element[]): boolean {
  if (event.key !== "Escape") return false;
  const target = event.target;
  return dialogs.some((dialog) => isModal(dialog) || (isNode(target) && dialog.contains(target)));
}

/**
 * Only an Escape on the canvas or in the palette puts down a tool the palette armed, as canvas keys
 * act only on the focused canvas: one aimed at the rest of the chrome (the menu trigger, the zoom
 * panel, the problems pill) is never the canvas's, also when it closes nothing.
 */
function isChromeEscape(event: KeyboardEvent, context: KeyListenerContext): boolean {
  return event.key === "Escape" && isNode(event.target) && context.isChrome(event.target);
}

/** The shell's one `keydown` listener (bubble phase): applies `decideKey` (guide §5.8, §13.5). */
export function createKeyListener(context: KeyListenerContext): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Escape") context.hideTooltip();
    const dialogs = openDialogs(context.dialogScope);
    if (isLayerEscape(event, dialogs) || isChromeEscape(event, context)) {
      stopEscapeKeyup(context.ownerDocument);
    }
    const decision = decideKey(event, {
      host: context.host,
      inTextField: isTextField(event.target),
      menuOpen: context.menuOpen(),
      dialogOpen: dialogs.length > 0,
      modalOpen: dialogs.some(isModal),
      defaultPrevented: event.defaultPrevented,
      startScreen: context.startScreen?.() ?? false,
    });
    if (decision.preventDefault) event.preventDefault();
    if (decision.stopPropagation) event.stopPropagation();
    if (decision.action === "closeMenu") context.closeMenu();
    else if (decision.action) context.run(decision.action);
  };
}
