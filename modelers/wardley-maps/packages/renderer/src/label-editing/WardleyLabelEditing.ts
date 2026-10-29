import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Injector } from "didi";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from "../model/di-types.js";
import type WardleyModeling from "../modeling/WardleyModeling.js";
import type WardleyElementFactory from "../model/WardleyElementFactory.js";
import { FONT, NOTE_LINE_HEIGHT } from "../draw/styles.js";
import { nameLineGrowth, type LineGrowth } from "../draw/index.js";
import { createFieldError } from "./fieldError.js";
import { isReadOnly } from "../read-only/index.js";
import {
  focusCanvasWithoutRing,
  lastInteractionWasPointer,
  trackInputModality,
} from "../a11y/index.js";

/** How an edit ends: Enter/Cmd+Enter (can be refused) or focus leaving the field (cannot). */
type CommitTrigger = "enter" | "outside";

interface ActiveEdit {
  elementId: string;
  field: HTMLInputElement | HTMLTextAreaElement;
  /** Saves the current value and closes (for Enter, blur, click outside). */
  commit: (trigger: CommitTrigger) => void;
  /** Discards and closes (only for Escape). */
  cleanup: () => void;
  /** Places the field over its element again after the view changed. */
  relayout: () => void;
  connection?: boolean;
}

/** Text selection (caret when start = end) inside an editor field. */
export interface FieldSelection {
  start: number;
  end: number;
}

/** Snapshot of an open name editor (hosts use it to survive a re-import). */
export interface ActiveLabelEdit {
  elementId: string;
  value: string;
  /** Where the caret or text selection was. */
  selection?: FieldSelection;
  /** A link annotation or flow value editor instead of a name editor. */
  connection?: boolean;
}

export interface ActivateOptions {
  /** Initial field content instead of the element's current label (e.g. restoring an edit). */
  value?: string;
  /** Caret or selection to restore; without it the whole text is selected. */
  selection?: FieldSelection;
}

/**
 * A field the user opens selects its whole text; a field reopened by a re-import keeps the caret
 * and selection the user had, so the next key does not replace what was typed.
 */
export function focusField(
  field: HTMLInputElement | HTMLTextAreaElement,
  options: ActivateOptions,
): void {
  field.focus();
  if (options.selection) {
    const length = field.value.length;
    field.setSelectionRange(
      Math.min(options.selection.start, length),
      Math.min(options.selection.end, length),
    );
  } else {
    field.select();
  }
}

/** Fired when a name was changed to a free variant because the requested one is taken. */
export interface LabelDeduplicatedEvent {
  element: WardleyShape;
  requested: string;
  applied: string;
}

/** Contract with the renderer: the element's primary name <text> carries this class. */
const NAME_LABEL_CLASS = "wardley-name-label";
/** Canvas marker while editing — CSS hides the name label so the field replaces it. */
const EDITING_MARKER = "wardley-label-editing";

/** Regions are unlabelled like in OWM (title = kind) and drawings have no text at all. */
const NOT_EDITABLE: ReadonlySet<string> = new Set(["attitude", "drawing"]);

/** Below diagram-js's own `shape.changed` listener, which redraws the element. */
const AFTER_REDRAW_PRIORITY = 500;

const FIELD_PADDING_X = 6;
const FIELD_PADDING_Y = 2;
const FIELD_BORDER = 1.5;
const FIELD_LINE_HEIGHT = 1.25;
const MIN_FONT_SIZE = 11;
const CAPTION_GAP = 4;
const CARET_ROOM = 2;

/**
 * Enter and Escape that confirm or cancel an IME candidate belong to the composition. `isComposing`
 * alone misses Safari: it sends the confirming Enter after `compositionend`, with `isComposing`
 * false and the `keyCode` 229 that every engine gives a key the IME took.
 */
function isImeCompositionKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export const NOTE_EDIT_HINT = "Cmd/Ctrl+Enter to save · Esc to cancel";

export function duplicateNameMessage(name: string): string {
  return `“${name}” already exists. Names must be unique because links refer to them.`;
}

/** U+2216, the look-alike of `\`, as U+2215 is the DSL's look-alike of `/`. */
const SET_MINUS = "∖";

/**
 * Defuses DSL metacharacters in labels: in the OWM DSL, names double as references —
 * `->`, `;` and square brackets would corrupt edge/coordinate lines on re-import. Line breaks stay
 * (the DSL writes them as `\n`); leading and trailing ones go with the other whitespace. A name's
 * backslash before "n" (`C:\new`) would read back as a line break and could then collide with a
 * name that holds a real one, so it becomes a look-alike. Notes and annotations keep it: nothing
 * refers to them, so a break there only changes how they look.
 */
function sanitizeLabel(raw: string, isName: boolean): string {
  const label = raw
    .replace(/\r\n?/g, "\n")
    .replace(/->/g, "→") // -> would be the edge operator
    .replace(/;/g, ",") // ; separates link annotations
    .replace(/\[/g, "(") // [..] would be a coordinate tuple
    .replace(/\]/g, ")")
    .trim();
  return isName ? label.replace(/\\(?=n)/g, SET_MINUS) : label;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

function measureTextWidth(text: string, font: string, fontSizePx: number): number {
  if (measureContext === undefined)
    measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * fontSizePx * 0.6;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/** Screen geometry of the label being replaced, relative to the canvas container. */
interface LabelGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  centered: boolean;
  /** Lines the label is drawn with. */
  lineCount: number;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  fontFamily: string;
}

/**
 * Custom inline label editing as an HTML overlay (deliberately not diagram-js direct-editing, §8.5).
 * The field sits exactly over the label it replaces (which is hidden meanwhile), scales with the
 * zoom and grows with its content. Commit goes through `wardleyModeling.updateLabel` ->
 * commandStack (undo, P4). Notes are edited in a `<textarea>` over the note itself (Enter = line
 * break, Cmd/Ctrl+Enter or click outside = save); every other name in a `<textarea>` over its label
 * (Enter = save, Shift+Enter = line break). Escape always discards.
 */
export default class WardleyLabelEditing {
  static $inject = [
    "eventBus",
    "canvas",
    "elementRegistry",
    "wardleyModeling",
    "wardleyElementFactory",
    "injector",
  ];

  private active: ActiveEdit | null = null;
  private relayoutPending = false;
  private readonly contextPad: ContextPad | null;
  private readonly selection: Selection | null;
  private readonly locked: () => boolean;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly modeling: WardleyModeling,
    private readonly factory: WardleyElementFactory,
    injector: Injector,
  ) {
    trackInputModality();
    this.contextPad = injector.get<ContextPad | null>("contextPad", false) ?? null;
    this.selection = injector.get<Selection | null>("selection", false) ?? null;
    this.locked = () => isReadOnly(injector);

    eventBus.on("element.dblclick", (event: { element?: unknown }) => {
      if (isWardleyShape(event.element)) this.activate(event.element);
      else if (isWardleyConnection(event.element)) this.activateConnection(event.element);
    });
    // Click or drag outside the field = SAVE (not discard). Only Escape discards.
    eventBus.on(["element.mousedown", "drag.init"], () => this.active?.commit("outside"));
    // A view change is no gesture of the user's: a host restores the view after a peer's re-import
    // and refits when its chrome changes, and committing then would write the half-typed name into
    // the shared document (modeler-api L5). The field follows the element instead.
    eventBus.on("canvas.viewbox.changing", () => this.relayoutAfterViewChange());
    eventBus.on("canvas.viewbox.changed", () => this.active?.relayout());
    // A redraw of the edited element (a host resizing the map while the field is open) moves it
    // without a view change; the priority waits for the redraw.
    eventBus.on(
      ["shape.changed", "connection.changed"],
      AFTER_REDRAW_PRIORITY,
      (event: { element?: { id?: string } }) => {
        if (this.active && event.element?.id === this.active.elementId) this.active.relayout();
      },
    );
    // The edited element vanished (delete, re-import): nothing left to save into.
    eventBus.on(["shape.remove", "connection.remove"], (event: { element?: { id?: string } }) => {
      if (this.active && event.element?.id === this.active.elementId) this.cancel();
    });
    eventBus.on("diagram.destroy", () => this.cancel());
  }

  /**
   * Opens the in-place name editor for `element` (no-op for regions and drawings, and for an
   * element an import has replaced).
   */
  activate(element: WardleyShape, options: ActivateOptions = {}): void {
    if (!isWardleyShape(element) || NOT_EDITABLE.has(element.wardleyType) || this.locked()) return;
    // A caller of the Modeler's own `importDSL` or `importMap` that re-imports from the change
    // listener of a create with the pointer has replaced the new shape by the time the editor opens
    // after the drop (the collaborative `importText` waits for the drop instead), and a name typed
    // into it would commit onto the removed shape.
    if (this.elementRegistry.get(element.id) !== element) return;
    this.active?.commit("outside");

    const container = this.canvas.getContainer();
    const isNote = element.wardleyType === "note";
    const openedByPointer = lastInteractionWasPointer();
    const requiresUniqueName = this.factory.isLinkable(element.wardleyType);
    const labels = this.nameLabelElements(element);
    const classedByFallback = [...labels.classedByFallback];
    let geometry = this.labelGeometry(element, labels.labelElements);
    const growthOf = (): LineGrowth =>
      isNote ? "centered" : nameLineGrowth(element, this.elementRegistry);
    let growth = growthOf();

    const lineHeightOf = (fontSize: number) =>
      Math.max(fontSize * FIELD_LINE_HEIGHT, isNote ? NOTE_LINE_HEIGHT * this.canvas.zoom() : 0);
    let lineHeight = lineHeightOf(geometry.fontSize);
    const field = createNameField(
      isNote,
      options.value ?? element.wardleyLabel ?? "",
      geometry,
      lineHeight,
    );
    const hint = isNote ? createCaption("wardley-label-hint", NOTE_EDIT_HINT) : undefined;

    const layout = () => {
      const { left, top, width, height } = fieldBox(
        field.value,
        geometry,
        lineHeight,
        isNote,
        growth,
      );
      Object.assign(field.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      // A new line made the field scroll to the caret before it grew to hold it.
      field.scrollTop = 0;
      let captionTop = top + height + CAPTION_GAP;
      for (const caption of [error.caption, hint]) {
        if (!caption) continue;
        caption.style.left = `${left}px`;
        caption.style.top = `${captionTop}px`;
        captionTop += caption.offsetHeight + CAPTION_GAP;
      }
    };

    const error = createFieldError(container, field, `wardley-label-error-${element.id}`, () =>
      layout(),
    );
    const showDuplicateError = (requested: string) => {
      error.show(duplicateNameMessage(requested));
      field.select();
    };
    const clearError = () => error.clear();

    this.contextPad?.close();
    this.canvas.addMarker(element, EDITING_MARKER);
    container.appendChild(field);
    if (hint) container.appendChild(hint);
    layout();
    focusField(field, options);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener("keydown", onKey as EventListener);
      field.removeEventListener("blur", onBlur);
      field.removeEventListener("input", onInput);
      field.remove();
      hint?.remove();
      error.clear();
      this.canvas.removeMarker(element, EDITING_MARKER);
      for (const text of classedByFallback) {
        text.classList.remove(NAME_LABEL_CLASS);
        if (!text.classList.length) text.removeAttribute("class");
      }
      this.active = null;
    };
    const commit = (trigger: CommitTrigger) => {
      if (done) return;
      // Enforce metacharacter protection also on RENAME — the DSL references elements by their
      // name; unescaped `->`, `;` or brackets would corrupt edge/coordinate lines on re-import.
      const requested = sanitizeLabel(field.value, requiresUniqueName);
      if (!requested || requested === element.wardleyLabel) {
        cleanup();
        return;
      }
      // Duplicate names would collapse nodes on the DSL round-trip (arrows disappear). On Enter the
      // user can still fix it, so refuse; when focus leaves, fall back to a free variant and tell
      // the host. Notes and other unreferenced elements may repeat (e.g. several "Risk" hints).
      const applied = requiresUniqueName
        ? this.factory.uniqueLabel(requested, element.id)
        : requested;
      if (applied !== requested && trigger === "enter") {
        showDuplicateError(requested);
        return;
      }
      cleanup();
      this.modeling.updateLabel(element, applied);
      if (applied !== requested) {
        this.eventBus.fire("wardley.label.deduplicated", {
          element,
          requested,
          applied,
        } satisfies LabelDeduplicatedEvent);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (isImeCompositionKey(e)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        this.returnToCanvas(element, openedByPointer);
        return;
      }
      if (e.key === "Enter") {
        // Note: save only with Cmd/Ctrl -> otherwise line break. Others: Enter saves, Shift+Enter
        // breaks the line.
        if (isNote ? !(e.metaKey || e.ctrlKey) : e.shiftKey) return;
        e.preventDefault();
        commit("enter");
        if (done) this.returnToCanvas(element, openedByPointer);
      }
    };
    const onInput = () => {
      clearError();
      layout();
    };
    const onBlur = () => commit("outside");
    field.addEventListener("keydown", onKey as EventListener);
    field.addEventListener("blur", onBlur);
    field.addEventListener("input", onInput);

    const relayout = () => {
      if (done) return;
      // A redraw replaces the label nodes, and a detached node measures as an empty box at 0,0.
      const current = this.nameLabelElements(element);
      classedByFallback.push(...current.classedByFallback);
      geometry = this.labelGeometry(element, current.labelElements);
      growth = growthOf();
      lineHeight = lineHeightOf(geometry.fontSize);
      Object.assign(field.style, {
        fontSize: `${geometry.fontSize}px`,
        lineHeight: `${lineHeight}px`,
      });
      layout();
    };

    this.active = { elementId: element.id, field, commit, cleanup, relayout };
  }

  /**
   * Inline editing for connections: a flow edits its value (`+'value'>`), a dependency its
   * `; annotation` text. An empty input clears the field. Undo-safe via updateProperties.
   */
  activateConnection(conn: WardleyConnection, options: ActivateOptions = {}): void {
    if (this.locked()) return;
    this.active?.commit("outside");

    const container = this.canvas.getContainer();
    if (conn.waypoints.length < 1) return;
    const isFlow = conn.wardleyType === "flow";
    const openedByPointer = lastInteractionWasPointer();

    const field = document.createElement("input");
    field.type = "text";
    field.className = "wardley-label-input";
    field.placeholder = isFlow ? "flow value (e.g. $0.10)" : "link annotation";
    field.value = options.value ?? (isFlow ? conn.flowValue : conn.linkLabel) ?? "";
    field.style.position = "absolute";
    const place = () => {
      // Read afresh: a redraw of the connection replaces its waypoints.
      const first = conn.waypoints[0];
      const last = conn.waypoints[conn.waypoints.length - 1];
      if (!first || !last) return;
      const scale = this.canvas.zoom();
      const viewbox = this.canvas.viewbox();
      field.style.left = `${((first.x + last.x) / 2 - 60 - viewbox.x) * scale}px`;
      field.style.top = `${((first.y + last.y) / 2 - 26 - viewbox.y) * scale}px`;
    };
    place();
    container.appendChild(field);
    focusField(field, options);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener("keydown", onKey as EventListener);
      field.removeEventListener("blur", onBlur);
      field.remove();
      this.active = null;
    };
    const commit = () => {
      if (done) return;
      // Defuse DSL metacharacters: `'` delimits the flow value, `;` starts the annotation.
      const value = field.value.replace(/'/g, "’").replace(/;/g, ",").trim();
      const current = (isFlow ? conn.flowValue : conn.linkLabel) ?? "";
      cleanup();
      if (value === current) return;
      // Keep the businessObject in sync — the exporter prefers it for imported edges.
      const bo = conn.businessObject;
      const nextBo = bo
        ? isFlow
          ? { ...bo, ...(value ? { flowValue: value } : {}) }
          : { ...bo, ...(value ? { label: value } : {}) }
        : undefined;
      if (nextBo && !value) {
        if (isFlow) delete (nextBo as { flowValue?: string }).flowValue;
        else delete (nextBo as { label?: string }).label;
      }
      this.modeling.updateProperties(conn, {
        [isFlow ? "flowValue" : "linkLabel"]: value || undefined,
        ...(nextBo ? { businessObject: nextBo } : {}),
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        this.returnToCanvas(conn, openedByPointer);
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit();
        this.returnToCanvas(conn, openedByPointer);
      }
    };
    const onBlur = () => commit();
    field.addEventListener("keydown", onKey as EventListener);
    field.addEventListener("blur", onBlur);

    const relayout = () => {
      if (!done) place();
    };
    this.active = { elementId: conn.id, field, commit, cleanup, relayout, connection: true };
  }

  /** Discards the open edit (if any) without saving. */
  cancel(): void {
    this.active?.cleanup();
  }

  /** `canvas.viewbox.changing` fires before the change, and `changed` waits 300ms under `deferUpdate`. */
  private relayoutAfterViewChange(): void {
    if (!this.active || this.relayoutPending) return;
    this.relayoutPending = true;
    queueMicrotask(() => {
      this.relayoutPending = false;
      this.active?.relayout();
    });
  }

  /**
   * Saves the open edit (if any) as if focus had left the field, e.g. before the host saves or
   * exports the map, so the file contains the text the user sees.
   */
  commitActiveEdit(): void {
    this.active?.commit("outside");
  }

  /** The open editor's element and current (unsaved) text, or null when nothing is edited. */
  getActiveEdit(): ActiveLabelEdit | null {
    if (!this.active) return null;
    const { elementId, field, connection } = this.active;
    return {
      elementId,
      value: field.value,
      selection: { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 },
      ...(connection ? { connection } : {}),
    };
  }

  /**
   * After Enter/Escape the removed field leaves focus on <body>; hand it back to the canvas so
   * keyboard users keep their place, and bring back the context pad a name editor had closed.
   */
  private returnToCanvas(
    element: WardleyShape | WardleyConnection,
    openedByPointer: boolean,
  ): void {
    // A name typed after a click or placement must not leave a keyboard focus ring around the
    // whole viewport; an editor opened from the keyboard (F2, Enter) keeps the visible ring. Right
    // away, not on the next task: the canvas takes keys only while it has the focus, so the next
    // key (N for a note after naming a component) would otherwise go to <body>.
    if (openedByPointer) focusCanvasWithoutRing(this.canvas);
    else this.canvas.focus();
    const selected = this.selection?.get() ?? [];
    if (selected.length === 1 && selected[0] === element) this.contextPad?.open(element);
  }

  /**
   * The <text> nodes showing the element's name. Falls back to matching by content when the
   * renderer does not mark them; the LAST match skips a component's movement target label, which
   * is drawn first and may repeat the name. Fallback matches carry the class only while editing so
   * the CSS hides them.
   */
  private nameLabelElements(element: WardleyShape): {
    labelElements: SVGTextElement[];
    classedByFallback: SVGTextElement[];
  } {
    const gfx = this.canvas.getGraphics(element);
    if (!gfx) return { labelElements: [], classedByFallback: [] };
    const marked = [...gfx.querySelectorAll<SVGTextElement>(`.${NAME_LABEL_CLASS}`)];
    if (marked.length) return { labelElements: marked, classedByFallback: [] };
    const texts = [...gfx.querySelectorAll<SVGTextElement>("text")].filter(
      (text) => !text.closest(".wardley-movement"),
    );
    // The lines of a name are tspans of one text, whose content joins them without a break.
    const drawnLabel = (element.wardleyLabel ?? "").split("\n").join("");
    const matched =
      element.wardleyType === "note"
        ? texts
        : texts.filter((text) => text.textContent === drawnLabel).slice(-1);
    for (const text of matched) text.classList.add(NAME_LABEL_CLASS);
    return { labelElements: matched, classedByFallback: matched };
  }

  private labelGeometry(element: WardleyShape, labelElements: SVGTextElement[]): LabelGeometry {
    const scale = this.canvas.zoom();
    const viewbox = this.canvas.viewbox();
    const containerRect = this.canvas.getContainer().getBoundingClientRect();
    const reference = labelElements[0];
    // tiny-svg writes presentation attributes such as font-size or text-anchor as inline styles,
    // so only the computed style knows them.
    const referenceStyle = reference ? getComputedStyle(reference) : undefined;
    const fontSize = Math.max(
      MIN_FONT_SIZE,
      (Number.parseFloat(referenceStyle?.fontSize ?? "") || FONT.label) * scale,
    );
    const typography = {
      fontSize,
      fontWeight: referenceStyle?.fontWeight || "normal",
      fontStyle: referenceStyle?.fontStyle || "normal",
      fontFamily: referenceStyle?.fontFamily || FONT.family,
    };

    if (element.wardleyType === "note") {
      return {
        left: (element.x - viewbox.x) * scale,
        top: (element.y - viewbox.y) * scale,
        width: element.width * scale,
        height: element.height * scale,
        centered: true,
        lineCount: Math.max(1, labelElements.length),
        ...typography,
      };
    }
    if (reference) {
      const boxes = labelElements.map((text) => text.getBoundingClientRect());
      const left = Math.min(...boxes.map((box) => box.left));
      const top = Math.min(...boxes.map((box) => box.top));
      return {
        left: left - containerRect.left,
        top: top - containerRect.top,
        width: Math.max(...boxes.map((box) => box.right)) - left,
        height: Math.max(...boxes.map((box) => box.bottom)) - top,
        centered: referenceStyle?.textAnchor === "middle",
        lineCount: Math.max(1, reference.querySelectorAll("tspan").length),
        ...typography,
      };
    }
    // No visible label (e.g. a pipeline whose name is shown by its same-named component).
    return {
      left: (element.x + element.width + 6 - viewbox.x) * scale,
      top: (element.y + element.height / 2 - viewbox.y) * scale - fontSize / 2,
      width: 0,
      height: fontSize,
      centered: false,
      lineCount: 1,
      ...typography,
    };
  }
}

function createNameField(
  isNote: boolean,
  value: string,
  geometry: LabelGeometry,
  lineHeight: number,
): HTMLTextAreaElement {
  const field = document.createElement("textarea");
  field.className = "wardley-label-input wardley-label-input--name wardley-label-textarea";
  field.value = value;
  field.rows = 1;
  field.setAttribute("aria-label", isNote ? "Note text" : "Name");
  field.spellcheck = false;
  field.wrap = "off";
  Object.assign(field.style, {
    position: "absolute",
    fontFamily: geometry.fontFamily,
    fontSize: `${geometry.fontSize}px`,
    fontWeight: geometry.fontWeight,
    fontStyle: geometry.fontStyle,
    lineHeight: `${lineHeight}px`,
    padding: `${FIELD_PADDING_Y}px ${FIELD_PADDING_X}px`,
    textAlign: geometry.centered ? "center" : "left",
  });
  return field;
}

/**
 * Field box over the label: as wide as its content (never narrower than a note's own box), centred
 * on centred labels, otherwise starting where the label text starts. New lines spread as the saved
 * label's will: around the label's middle, upward with the field's last line kept on the label's
 * last, or downward with its first line kept on the label's first.
 */
function fieldBox(
  value: string,
  geometry: LabelGeometry,
  lineHeight: number,
  isNote: boolean,
  growth: LineGrowth,
): { left: number; top: number; width: number; height: number } {
  const font = `${geometry.fontStyle} ${geometry.fontWeight} ${geometry.fontSize}px ${geometry.fontFamily}`;
  const chrome = 2 * (FIELD_PADDING_X + FIELD_BORDER) + CARET_ROOM;
  const lines = (value || " ").split("\n");
  const textWidth = Math.max(
    ...lines.map((line) => measureTextWidth(line, font, geometry.fontSize)),
  );
  const width = Math.max(
    textWidth + chrome,
    geometry.fontSize * 2 + chrome,
    isNote ? geometry.width : 0,
  );
  const chromeHeight = 2 * (FIELD_PADDING_Y + FIELD_BORDER);
  const height = Math.max(lines.length * lineHeight + chromeHeight, isNote ? geometry.height : 0);
  const left = geometry.centered
    ? geometry.left + geometry.width / 2 - width / 2
    : geometry.left - FIELD_PADDING_X - FIELD_BORDER;
  const labelMiddle = geometry.top + geometry.height / 2;
  const drawnLinesHeight = geometry.lineCount * lineHeight + chromeHeight;
  const top =
    growth === "up"
      ? labelMiddle + drawnLinesHeight / 2 - height
      : growth === "down"
        ? labelMiddle - drawnLinesHeight / 2
        : labelMiddle - height / 2;
  return { left, top, width, height };
}

function createCaption(className: string, text: string): HTMLElement {
  const caption = document.createElement("div");
  caption.className = `wardley-label-caption ${className}`;
  caption.textContent = text;
  return caption;
}
