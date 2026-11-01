import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type DocumentStore from "../document/DocumentStore.js";
import { TEXT_RELAYOUT_EVENT } from "../draw/FontRelayout.js";
import { CHEVRON_RIGHT_NODES, LUCIDE_STROKE_WIDTH } from "../draw/lucide.js";
import { TEXT_REBASED_EVENT, VIEW_CHANGED_EVENT, type C4Views } from "../services.js";
import { fitCrumbs, type CrumbWidths } from "./breadcrumbFit.js";
import { breadcrumbPath, crumbText, type Crumb } from "./breadcrumbPath.js";
import "./breadcrumbs.css";

export const BREADCRUMBS_CLASS = "c4-breadcrumbs";
/** The landmark's name (WAI-ARIA's breadcrumb pattern). */
export const BREADCRUMBS_LABEL = "Breadcrumb";
/** Beside the view shown while it is a draft: the words of the views dialog. */
export const DRAFT_NOTE = "Not in the file yet";

/** An import, a view switch, and every edit and its undo: a rename or a written draft. */
const UPDATE_EVENTS = [
  "import.done",
  VIEW_CHANGED_EVENT,
  "commandStack.changed",
  TEXT_REBASED_EVENT,
];

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
/** The sizes of breadcrumbs.css: the separator, a crumb's padding, the bar's padding, the note's. */
const SEPARATOR_SIZE = 16;
const CRUMB_PADDING = 12;
const BAR_PADDING = 4;
const NOTE_PADDING = 8;
/** A cut name keeps a letter and its ellipsis, never a cut glyph (2em of the 13px text). */
const NAME_MIN = 26;
/** Less than this is no cut: layout rounds to 1/64 of a pixel. */
const SUBPIXEL = 0.02;
/** The narrowest the breadcrumb gets; narrower, it steps aside. */
const MIN_WIDTH = 120;
/** Between the path and what stands after it on its line: the shell's gap between islands. */
const TRAILING_GAP = 8;

/**
 * The path from the system landscape down to the view on the canvas, like bpmn-js's drill-down
 * breadcrumb: each view above is a button that opens it, the view shown is plain text. Hidden at
 * a view without a parent, where there is no way up. It lives in diagram-js's container after the
 * `<svg>`, so the tab order is the shell's (palette, canvas) and its buttons follow the canvas,
 * and it is HTML, so no export draws it.
 */
export default class Breadcrumbs {
  static $inject = ["eventBus", "canvas", "c4Views", "c4Document"];

  readonly element: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly clearance: ChromeClearance;
  private shown = "";
  private trailing: HTMLElement | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly views: C4Views,
    private readonly store: DocumentStore,
  ) {
    const container = canvas.getContainer();
    const ownerDocument = container.ownerDocument;
    this.element = ownerDocument.createElement("nav");
    this.element.className = BREADCRUMBS_CLASS;
    this.element.setAttribute("aria-label", BREADCRUMBS_LABEL);
    this.element.hidden = true;
    this.list = ownerDocument.createElement("ol");
    this.list.className = `${BREADCRUMBS_CLASS}-list`;
    this.element.append(this.list);
    container.append(this.element);
    this.clearance = new ChromeClearance(this.element, container, () => this.layout());
    this.list.addEventListener("click", (event) => this.onClick(event));
    eventBus.on(UPDATE_EVENTS, () => this.update());
    // The names take their width from Geist once it has arrived.
    eventBus.on(TEXT_RELAYOUT_EVENT, () => this.layout());
    eventBus.on("diagram.destroy", () => this.destroy());
  }

  /** The crumbs of the view shown, the current one last. */
  path(): Crumb[] {
    return breadcrumbPath(
      this.views.catalog(),
      this.views.active(),
      this.store.current().parse.workspace,
    );
  }

  /**
   * An element on the breadcrumb's line right after it (the hint of the relationships the view
   * can't show), inserted after it in the container, so Tab reaches it after the path: the path
   * leaves it room, it goes compact (`data-compact`) before a name is cut, and it is covered
   * (`data-covered`) with the path or where not even its compact form fits.
   */
  setTrailing(element: HTMLElement | undefined): void {
    this.trailing = element;
    if (element) this.element.after(element);
    this.layout();
  }

  /** After the trailing element changed its content or showed. */
  relayout(): void {
    this.layout();
  }

  update(): void {
    const crumbs = this.path();
    const signature = JSON.stringify(crumbs);
    if (signature === this.shown) return;
    this.shown = signature;
    const focused = this.focusedView();
    this.list.replaceChildren(...crumbs.map((crumb, index) => this.item(crumb, index > 0)));
    this.element.hidden = crumbs.length < 2;
    if (focused !== undefined) this.buttonFor(focused)?.focus();
    this.layout();
  }

  /**
   * Off the islands, then as wide as the room left: a path too wide gives way by `fitCrumbs`,
   * the names of the views above first, so the view shown stays whole the longest.
   */
  private layout(): void {
    const trailing = this.trailing && !this.trailing.hidden ? this.trailing : undefined;
    if (this.element.hidden) {
      trailing?.toggleAttribute("data-covered", true);
      return;
    }
    const space = this.clearance.space();
    if (space.end === undefined) this.element.style.removeProperty("max-width");
    else this.element.style.maxWidth = `${Math.floor(space.end)}px`;
    let covered = space.width < MIN_WIDTH;
    const note = this.list.querySelector<HTMLElement>(`.${BREADCRUMBS_CLASS}-note`);
    if (note) note.hidden = false;
    const items = [...this.list.children].map((item) => ({
      name: item.querySelector<HTMLElement>(`.${BREADCRUMBS_CLASS}-name`),
      level: item.querySelector<HTMLElement>(`.${BREADCRUMBS_CLASS}-level`),
      separated: item.querySelector(`.${BREADCRUMBS_CLASS}-separator`) !== null,
      current: item.querySelector('[aria-current="page"]') !== null,
    }));
    const range = this.element.ownerDocument.createRange();
    // The text's own width, to the fraction of a pixel, also while a limit cuts the span.
    const widthOf = (span: HTMLElement | null) => {
      if (!span) return 0;
      range.selectNodeContents(span);
      return range.getBoundingClientRect().width;
    };
    const widths: CrumbWidths[] = items.map((item) => ({
      fixed: (item.separated ? SEPARATOR_SIZE : 0) + CRUMB_PADDING,
      name: widthOf(item.name),
      level: widthOf(item.level),
      current: item.current,
    }));
    const available = space.width - BAR_PADDING;
    // The note is the first to give way: it shows only while every name and level stays whole.
    const noteWidth = note ? widthOf(note) + NOTE_PADDING : 0;
    const whole = (fitted: ReturnType<typeof fitCrumbs>) =>
      fitted?.every(
        (part, index) =>
          part.name >= widths[index]!.name - SUBPIXEL &&
          part.level >= widths[index]!.level - SUBPIXEL,
      ) === true;
    const withNote = widths.map((crumb) =>
      crumb.current ? { ...crumb, fixed: crumb.fixed + noteWidth } : crumb,
    );
    // The note gives way first, then the trailing element's words, then the names.
    const trailingWidth = (compact: boolean) => {
      if (!trailing) return 0;
      trailing.toggleAttribute("data-compact", compact);
      return trailing.getBoundingClientRect().width + TRAILING_GAP;
    };
    let reserve = trailingWidth(false);
    let fit = covered ? undefined : fitCrumbs(withNote, available - reserve, NAME_MIN);
    if (note && !covered && !whole(fit)) {
      note.hidden = true;
      fit = fitCrumbs(widths, available - reserve, NAME_MIN);
    }
    if (trailing && !covered && !whole(fit)) {
      reserve = trailingWidth(true);
      fit = fitCrumbs(widths, available - reserve, NAME_MIN);
    }
    let trailingCovered = false;
    if (trailing && !covered && !fit) {
      trailingCovered = true;
      reserve = 0;
      fit = fitCrumbs(widths, available, NAME_MIN);
    }
    if (!fit) covered = true;
    if (reserve > 0) this.element.style.maxWidth = `${Math.floor(space.width - reserve)}px`;
    items.forEach((item, index) => {
      limit(item.name, fit?.[index]?.name, widths[index]!.name);
      limit(item.level, fit?.[index]?.level, widths[index]!.level);
    });
    this.element.toggleAttribute("data-covered", covered);
    if (trailing) this.placeTrailing(trailing, covered || trailingCovered);
  }

  private placeTrailing(trailing: HTMLElement, covered: boolean): void {
    trailing.toggleAttribute("data-covered", covered);
    if (covered) return;
    const bounds = this.canvas.getContainer().getBoundingClientRect();
    const own = this.element.getBoundingClientRect();
    trailing.style.left = `${Math.ceil(own.right - bounds.left) + TRAILING_GAP}px`;
    trailing.style.top = `${Math.round(own.top - bounds.top)}px`;
  }

  private item(crumb: Crumb, separated: boolean): HTMLLIElement {
    const ownerDocument = this.element.ownerDocument;
    const item = ownerDocument.createElement("li");
    item.className = `${BREADCRUMBS_CLASS}-item`;
    if (separated) item.append(separator(ownerDocument));
    const label = ownerDocument.createElement(crumb.current ? "span" : "button");
    if (label instanceof HTMLButtonElement) {
      label.type = "button";
      label.className = `${BREADCRUMBS_CLASS}-link`;
      label.dataset.view = crumb.key;
    } else {
      label.className = `${BREADCRUMBS_CLASS}-current`;
      label.setAttribute("aria-current", "page");
    }
    const name = ownerDocument.createElement("span");
    name.className = `${BREADCRUMBS_CLASS}-name`;
    name.textContent = crumb.name;
    label.append(name);
    if (crumb.level !== undefined) {
      const level = ownerDocument.createElement("span");
      level.className = `${BREADCRUMBS_CLASS}-level`;
      // The space is part of the text, so the crumb reads and is named "Shop containers".
      level.textContent = crumbText(crumb).slice(crumb.name.length);
      label.append(level);
    }
    item.append(label);
    if (crumb.current && crumb.draft) {
      const note = ownerDocument.createElement("span");
      note.className = `${BREADCRUMBS_CLASS}-note`;
      note.textContent = DRAFT_NOTE;
      item.append(note);
    }
    return item;
  }

  /**
   * The button turns into the current view's text, so the focus goes to the canvas, by pointer
   * and by keyboard alike: from there U goes up again and Tab comes back here.
   */
  private onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>(`button.${BREADCRUMBS_CLASS}-link`);
    const key = button?.dataset.view;
    if (!button || key === undefined || !this.list.contains(button)) return;
    event.preventDefault();
    if (this.views.open(key, { cause: "user" })) this.canvas.focus();
    else this.update();
  }

  private focusedView(): string | undefined {
    const active = this.element.ownerDocument.activeElement;
    return active instanceof HTMLButtonElement && this.list.contains(active)
      ? active.dataset.view
      : undefined;
  }

  private buttonFor(key: string): HTMLButtonElement | undefined {
    return [...this.list.querySelectorAll<HTMLButtonElement>("button[data-view]")].find(
      (button) => button.dataset.view === key,
    );
  }

  private destroy(): void {
    this.clearance.destroy();
    this.element.remove();
    this.trailing = undefined;
  }
}

/** Below its whole width a part is cut there; a whole part keeps no limit. */
function limit(span: HTMLElement | null, width: number | undefined, whole: number): void {
  if (!span) return;
  if (width === undefined || width >= whole - SUBPIXEL) span.style.removeProperty("max-width");
  else span.style.maxWidth = `${Math.max(0, Math.floor(width))}px`;
}

function separator(ownerDocument: Document): SVGSVGElement {
  const svg = ownerDocument.createElementNS(SVG_NAMESPACE, "svg");
  for (const [name, value] of Object.entries({
    class: `${BREADCRUMBS_CLASS}-separator`,
    width: String(SEPARATOR_SIZE),
    height: String(SEPARATOR_SIZE),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(LUCIDE_STROKE_WIDTH),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  })) {
    svg.setAttribute(name, value);
  }
  for (const [tag, attributes] of CHEVRON_RIGHT_NODES) {
    const node = ownerDocument.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}

interface Space {
  /** Where the breadcrumb must end, from its left edge; undefined: at the container's margin. */
  readonly end: number | undefined;
  /** The width it may take. */
  readonly width: number;
}

/**
 * Keeps the breadcrumb off the host chrome's islands at every container size (guide §5.2): it
 * ends 8px before an island beside it (the side inspector, a centred status box) and steps aside,
 * as the shell's own islands do under its bottom sheet (§5.11), while one covers its start (a tall
 * legend or problems list in a low container, the status box of the narrow layout). The islands
 * are what the shell marks `data-chrome` in its root; without a shell nothing is in the way.
 */
class ChromeClearance {
  private root: Element | undefined;
  private readonly observed = new Set<Element>();
  private readonly resizes: ResizeObserver | undefined;
  private readonly mutations: MutationObserver | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly container: HTMLElement,
    onChange: () => void,
  ) {
    const view = container.ownerDocument.defaultView;
    if (!view || typeof view.ResizeObserver !== "function") return;
    this.resizes = new view.ResizeObserver(onChange);
    this.mutations = new view.MutationObserver(onChange);
    this.resizes.observe(container);
  }

  space(): Space {
    this.watchChrome();
    const own = this.element.getBoundingClientRect();
    const bounds = this.container.getBoundingClientRect();
    const tokens = getComputedStyle(this.element);
    const margin = tokenPx(tokens, "--cd-shell-rand", 12);
    const gap = tokenPx(tokens, "--cd-shell-luecke", 8);
    const free = bounds.right - margin;
    let end = free;
    let blocked = false;
    for (const island of this.islands()) {
      if (!isShown(island)) continue;
      const box = island.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom <= own.top || box.top >= own.bottom || box.right <= own.left) continue;
      if (box.left - gap > own.left) end = Math.min(end, box.left - gap);
      else blocked = true;
    }
    const width = blocked ? 0 : end - own.left;
    return { end: end < free ? width : undefined, width };
  }

  destroy(): void {
    this.resizes?.disconnect();
    this.mutations?.disconnect();
    this.observed.clear();
    this.root = undefined;
  }

  /**
   * The shell mounts the canvas after the diagram exists, so its root is found on the way. Every
   * island is watched, a hidden one too: showing it resizes it from nothing.
   */
  private watchChrome(): void {
    if (!this.resizes || !this.mutations) return;
    const root = this.container.closest(".cd-shell") ?? undefined;
    if (root !== this.root) {
      this.mutations.disconnect();
      for (const island of this.observed) this.resizes.unobserve(island);
      this.observed.clear();
      this.root = root;
      // The root's state attributes move islands without resizing them (data-inspector,
      // data-problems, data-palette), and new children may be islands.
      if (root) this.mutations.observe(root, { attributes: true, childList: true });
    }
    for (const island of this.islands()) {
      if (this.observed.has(island)) continue;
      this.observed.add(island);
      this.resizes.observe(island);
    }
  }

  private islands(): Element[] {
    if (!this.root) return [];
    return [...this.root.querySelectorAll("[data-chrome]")].filter(
      (island) => !this.element.contains(island),
    );
  }
}

function isShown(element: Element): boolean {
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ visibilityProperty: true });
  }
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function tokenPx(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(token));
  return Number.isFinite(value) ? value : fallback;
}
