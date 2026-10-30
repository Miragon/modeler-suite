/**
 * In-place editing via diagram-js-direct-editing (the bpmn.io mechanism):
 * double-click a context or relationship — or use the context pad's rename
 * action — and the name becomes editable directly inside the element, at the
 * spot and size it is rendered (Shift+Enter inserts a line break the renderer
 * preserves). The owning-team caption edits the same way: the pad's team
 * action (or a double-click on the caption) opens the box right over it.
 * Enter/blur commits through `cmModeling` (undoable), Escape cancels, and
 * starting a drag completes the edit. A pan or zoom keeps the box open and
 * moves it with its element. The edited text is hidden behind an element
 * marker while the box is open so nothing doubles up. Neither an import nor
 * a view change commits an open edit: an import takes it down before and
 * reopens it on the element with the same id afterwards, with the text typed
 * so far.
 */

import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, ShapeLike } from "diagram-js/lib/model/Types";
import { contextNameColour, contextTeamColour } from "../draw/contextColours.js";
import { CONTEXT_NAME_TOP, CONTEXT_TEAM_RESERVE, FONT } from "../draw/styles.js";
import { isCmContext, isCmElement, type CmContext, type CmElement } from "../model/di-types.js";
import type CmModeling from "../modeling/CmModeling.js";
import { READ_ONLY_CHANGED_EVENT, type CmReadOnly } from "../read-only/index.js";
import { isKeyOnHiddenTarget } from "../keyboard/CmKeyboard.js";

type EditMode = "name" | "team";

/** Hide the rendered text being edited: `.cm-name` resp. `.cm-team` (CSS). */
const MARKERS: Record<EditMode, string> = {
  name: "cm-direct-editing",
  team: "cm-direct-editing-team",
};

/** Mirrors the renderer: label wrap inset (10px each side). */
const LABEL_INSET_X = 10;
/** The team caption band at the bottom of the box (renderer: centre at h-12). */
const TEAM_BAND_HEIGHT = 20;
const TEAM_BAND_BOTTOM_GAP = 2;

// The service surface of the (untyped, plain-JS) diagram-js-direct-editing
// package — typed locally so nothing untyped leaks into the published d.ts.
interface DirectEditingContext {
  bounds: { x: number; y: number; width: number; height: number };
  text: string;
  style?: Record<string, string | number>;
  options?: { centerVertically?: boolean; autoResize?: boolean; resizable?: boolean };
}

interface DirectEditingService {
  registerProvider(provider: {
    activate(element: Element): DirectEditingContext | undefined;
    update(element: Element, newText: string): void;
  }): void;
  activate(element: Element): boolean;
  isActive(element?: Element): boolean;
  cancel(): void;
  complete(): void;
  getValue(): string;
  /** The text box's parent element of the edit open right now. */
  $textbox?: HTMLElement;
  /** The text box, which binds `keyHandler` to its field on every activation. */
  _textbox?: { keyHandler: (event: KeyboardEvent) => void };
}

/**
 * The library takes every key of its box (Enter saves, Escape cancels, each one stopped), also one
 * the browser still sends to a box the host made inert or hid: such a key goes to the page instead.
 */
function leaveKeysOnHiddenBoxToPage(directEditing: DirectEditingService): void {
  const textbox = directEditing._textbox;
  if (!textbox) return;
  const handleKey = textbox.keyHandler;
  textbox.keyHandler = (event) => {
    if (!isKeyOnHiddenTarget(event)) handleKey(event);
  };
}

/** An open edit taken down for an import: its element, what it edits, the text typed so far. */
interface SuspendedEdit {
  elementId: string;
  mode: EditMode;
  text: string;
}

export default class CmLabelEditing {
  static $inject = [
    "eventBus",
    "canvas",
    "directEditing",
    "cmModeling",
    "elementRegistry",
    "cmReadOnly",
    "selection",
  ];

  /** Which property the CURRENT activation edits (set right before activate). */
  private mode: EditMode = "name";
  private activeMarker?: { element: Element; marker: string };
  private suspended?: SuspendedEdit;
  private resumeTimer?: ReturnType<typeof setTimeout>;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly directEditing: DirectEditingService,
    private readonly modeling: CmModeling,
    private readonly elementRegistry: ElementRegistry,
    private readonly readOnly: Pick<CmReadOnly, "isReadOnly">,
    private readonly selection: Selection,
  ) {
    // Registered as a plain object: the provider contract claims the method
    // name `activate` for context creation, while this service keeps
    // `activate(element)` as the public "start editing" API.
    directEditing.registerProvider({
      activate: (element) => this.activationContext(element),
      update: (element, newText) => this.commit(element, newText),
    });
    leaveKeysOnHiddenBoxToPage(directEditing);

    eventBus.on(
      "element.dblclick",
      (event: { element?: unknown; originalEvent?: { clientY?: number } }) => {
        const element = event.element;
        if (!isCmElement(element)) return;
        // A double-click on the team caption band edits the team, not the name.
        this.mode =
          isCmContext(element) && element.team && this.isInTeamBand(element, event.originalEvent)
            ? "team"
            : "name";
        directEditing.activate(element as Element);
      },
    );

    // Only the user's own gestures commit (Enter, blur, a drag): diagram-js cannot tell a wheel
    // zoom from a host's setViewState or fit, and a commit there would write half-typed text into
    // the document every peer shares.
    eventBus.on("drag.init", () => directEditing.complete());
    eventBus.on("canvas.viewbox.changed", () => this.placeOpenEdit());

    eventBus.on("directEditing.activate", (event: { active?: { element?: Element } }) => {
      const element = event.active?.element;
      if (!element) return;
      const marker = MARKERS[this.mode];
      canvas.addMarker(element as unknown as ShapeLike, marker);
      this.activeMarker = { element, marker };
      // The box is transparent over the context's fill, so the text keeps the colour the canvas
      // draws it in there: white on a dark fill the author set.
      const textbox = directEditing.$textbox;
      if (isCmContext(element) && textbox) {
        textbox.style.color =
          this.mode === "team" ? contextTeamColour(element) : contextNameColour(element);
      }
    });
    eventBus.on(["directEditing.complete", "directEditing.cancel"], () => {
      const active = this.activeMarker;
      if (active) canvas.removeMarker(active.element as unknown as ShapeLike, active.marker);
      this.activeMarker = undefined;
    });
    eventBus.on("diagram.destroy", () => {
      clearTimeout(this.resumeTimer);
      this.suspended = undefined;
    });
    // A read-only canvas has no label editor (guide §13.5), also not on a double-click.
    eventBus.on("directEditing.activate.allowed", 2000, () =>
      this.readOnly.isReadOnly() ? false : undefined,
    );
    eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (event.readOnly) directEditing.cancel();
    });
  }

  /**
   * Takes an open edit down WITHOUT committing it, for an import that replaces the elements: a
   * later commit (Enter, blur) would land on a removed shape and be wiped with the history.
   * `resumeAfterImport` brings the editor back with the typed text.
   */
  suspend(): void {
    clearTimeout(this.resumeTimer);
    const element = this.activeMarker?.element;
    if (!this.directEditing.isActive() || !element) return;
    this.suspended = {
      elementId: element.id,
      mode: this.mode,
      text: this.directEditing.getValue(),
    };
    this.directEditing.cancel();
  }

  /**
   * Reopens a suspended edit on the element with the same id, if the imported document still has
   * it, and selects that element while nothing is selected, as before the import (a keyboard create
   * leaves its context selected with the editor open). Deferred to the next task, after the host has
   * restored its viewbox and selection around the import, so the editor opens where the element
   * ends up.
   */
  resumeAfterImport(): void {
    clearTimeout(this.resumeTimer);
    if (!this.suspended) return;
    this.resumeTimer = setTimeout(() => {
      const edit = this.suspended;
      this.suspended = undefined;
      if (edit && !this.directEditing.isActive()) this.resume(edit);
    }, 0);
  }

  /** The edit open right now (its element and the uncommitted text), for hosts and tests. */
  openEdit(): { elementId: string; text: string } | undefined {
    const element = this.activeMarker?.element;
    if (!this.directEditing.isActive() || !element) return undefined;
    return { elementId: element.id, text: this.directEditing.getValue() };
  }

  /** The open box follows its element through a pan or zoom: same text, caret and focus. */
  private placeOpenEdit(): void {
    const element = this.activeMarker?.element;
    const textbox = this.directEditing.$textbox;
    if (!this.directEditing.isActive() || !element || !textbox) return;
    const context = this.activationContext(element);
    if (!context) return;
    const { x, y, width, height } = context.bounds;
    Object.assign(textbox.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    const content = textbox.querySelector<HTMLElement>("[contenteditable]");
    const fontSize = context.style?.fontSize;
    if (content && fontSize !== undefined) content.style.fontSize = String(fontSize);
  }

  private resume(edit: SuspendedEdit): void {
    const element = this.elementRegistry.get(edit.elementId);
    if (!isCmElement(element)) return;
    if (edit.mode === "team" && !isCmContext(element)) return;
    if (this.readOnly.isReadOnly()) return;
    if (this.selection.get().length === 0) this.selection.select(element as Element);
    this.mode = edit.mode;
    if (!this.directEditing.activate(element as Element)) return;
    const content = this.directEditing.$textbox?.querySelector<HTMLElement>("[contenteditable]");
    if (!content) return;
    content.innerText = edit.text;
    placeCaretAtEnd(content);
  }

  /** Start in-place editing of the element's name (context pad, hosts). */
  activate(element: CmElement): void {
    this.mode = "name";
    this.directEditing.activate(element as Element);
  }

  /** Start in-place editing of the owning-team caption at the box bottom. */
  activateTeam(context: CmContext): void {
    this.mode = "team";
    this.directEditing.activate(context as unknown as Element);
  }

  cancel(): void {
    this.directEditing.cancel();
  }

  private isInTeamBand(context: CmContext, originalEvent?: { clientY?: number }): boolean {
    if (typeof originalEvent?.clientY !== "number") return false;
    const zoom = this.canvas.zoom();
    const bbox = this.canvas.getAbsoluteBBox(context as unknown as ShapeLike);
    const containerTop = this.canvas.getContainer().getBoundingClientRect().top;
    const y = originalEvent.clientY - containerTop;
    return y >= bbox.y + bbox.height - (TEAM_BAND_HEIGHT + TEAM_BAND_BOTTOM_GAP) * zoom;
  }

  private activationContext(element: Element): DirectEditingContext | undefined {
    if (!isCmElement(element)) return undefined;
    if (this.mode === "team" && !isCmContext(element)) this.mode = "name";
    const zoom = this.canvas.zoom();
    const bbox = this.canvas.getAbsoluteBBox(element as unknown as ShapeLike);

    if (this.mode === "team") {
      const context = element as CmContext;
      // Right over the caption at the box bottom, in the caption's type size.
      return {
        bounds: {
          x: bbox.x + LABEL_INSET_X * zoom,
          y: bbox.y + bbox.height - (TEAM_BAND_HEIGHT + TEAM_BAND_BOTTOM_GAP) * zoom,
          width: bbox.width - 2 * LABEL_INSET_X * zoom,
          height: TEAM_BAND_HEIGHT * zoom,
        },
        text: context.team ?? "",
        style: {
          fontFamily: FONT.family,
          fontSize: `${FONT.small * zoom}px`,
          fontWeight: 400,
          lineHeight: 1.2,
          backgroundColor: "transparent",
          border: "1px dashed var(--cd-ui-interaktion)",
          textAlign: "center",
        },
        options: { centerVertically: true },
      };
    }

    const style: Record<string, string | number> = {
      fontFamily: FONT.family,
      fontSize: `${FONT.label * zoom}px`,
      fontWeight: 650,
      lineHeight: 1.2,
      // In-place illusion: the element's own fill stays visible, a dashed
      // accent frame signals the edit state (the rendered name is hidden).
      backgroundColor: "transparent",
      border: "1px dashed var(--cd-ui-interaktion)",
      textAlign: "center",
    };

    if (isCmContext(element)) {
      // The renderer anchors the name at the fixed top offset below the type
      // header — mirror that band exactly so the text does not jump. The 1px
      // dashed border (box-sizing: border-box) pushes the text down — offset
      // the box up by it.
      const reserve = element.team ? CONTEXT_TEAM_RESERVE * zoom : 0;
      return {
        bounds: {
          x: bbox.x + LABEL_INSET_X * zoom,
          y: bbox.y + CONTEXT_NAME_TOP * zoom - 1,
          width: bbox.width - 2 * LABEL_INSET_X * zoom,
          height: bbox.height - CONTEXT_NAME_TOP * zoom - reserve,
        },
        text: element.cmLabel ?? "",
        style,
      };
    }

    // Relationship: a compact box centred on the line (the canvas shows the
    // label only in the hover tooltip, so the box needs its own paper).
    const width = 160 * zoom;
    const height = 44 * zoom;
    return {
      bounds: {
        x: bbox.x + bbox.width / 2 - width / 2,
        y: bbox.y + bbox.height / 2 - height / 2,
        width,
        height,
      },
      text: (element as CmElement).cmLabel ?? "",
      style: { ...style, backgroundColor: "var(--cd-ui-flaeche-hoch)" },
      options: { centerVertically: true },
    };
  }

  private commit(element: Element, newText: string): void {
    const value = newText.trim();
    // DirectEditing also calls update() on pure bounds jitter — don't push a
    // no-op command (an empty undo step) when nothing changed.
    if (this.mode === "team") {
      const context = element as unknown as CmContext;
      if (value === (context.team ?? "")) return;
      this.modeling.setTeam(context, value || undefined);
      return;
    }
    if (value === ((element as CmElement).cmLabel ?? "")) return;
    this.modeling.updateLabel(element as CmElement, value);
  }
}

function placeCaretAtEnd(field: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
