import Diagram from "diagram-js";
import type ElementFactory from "diagram-js/lib/core/ElementFactory";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import type DefaultRenderer from "diagram-js/lib/draw/DefaultRenderer";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type { ContextPadEntries } from "diagram-js/lib/features/context-pad/ContextPadProvider";
import CreateModule from "diagram-js/lib/features/create";
import type Create from "diagram-js/lib/features/create/Create";
import EditorActionsModule from "diagram-js/lib/features/editor-actions";
import HandToolModule from "diagram-js/lib/features/hand-tool";
import type HandTool from "diagram-js/lib/features/hand-tool/HandTool";
import KeyboardModule from "diagram-js/lib/features/keyboard";
import type Keyboard from "diagram-js/lib/features/keyboard/Keyboard";
import { isCmd, isKey } from "diagram-js/lib/features/keyboard/KeyboardUtil";
import LassoToolModule from "diagram-js/lib/features/lasso-tool";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import ModelingModule from "diagram-js/lib/features/modeling";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import MoveModule from "diagram-js/lib/features/move";
import OutlineModule from "diagram-js/lib/features/outline";
import PaletteModule from "diagram-js/lib/features/palette";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type { PaletteEntries } from "diagram-js/lib/features/palette/PaletteProvider";
import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import type Rules from "diagram-js/lib/features/rules/Rules";
import SelectionModule from "diagram-js/lib/features/selection";
import type Selection from "diagram-js/lib/features/selection/Selection";
import MoveCanvasModule from "diagram-js/lib/navigation/movecanvas";
import ZoomScrollModule from "diagram-js/lib/navigation/zoomscroll";
import type { Element, Parent, Shape } from "diagram-js/lib/model/Types";
import type { Injector, ModuleDeclaration } from "didi";

import { PALETTE_TOOL_ICON, iconMarkup, type Bounds, type Point } from "../src/index.js";
import { shellModule, type CollaborativeModelerLike } from "../src/diagram-js.js";

/**
 * Faults the kit's saboteur specs switch on at runtime (`window.__demo.flaws`), each breaking one
 * rule a conformance case must catch.
 */
export interface DemoFlaws {
  /** Enter or Space on a creating palette entry adds nothing (case `create`). */
  noKeyboardCreate: boolean;
  /** The read-only lock leaves the canvas editable: context pad, move, delete (case `readOnly`). */
  canvasUnlocked: boolean;
  /** Cmd/Ctrl+A on the canvas does nothing, so VS Code runs its own Select All (case `keys`). */
  noSelectAll: boolean;
  /**
   * The label editor commits on every view change (`canvas.viewbox.changing`), as the renderers
   * built against contract 1.1 did (case `labelEditor`).
   */
  commitLabelOnViewChange: boolean;
  /** The label editor closes without a commit on every view change, dropping the typed text (case `labelEditor`). */
  closeLabelOnViewChange: boolean;
  /**
   * The context pad's note prompt follows a pan or zoom instead of closing, so it stays above the
   * palette (case `overlayLayers`, guide §5.13).
   */
  notePromptFollowsView: boolean;
  /**
   * The note prompt only hides while the view changes and shows again once
   * `canvas.viewbox.changed` arrives, 300ms late under `deferUpdate` (case `overlayLayers`, guide
   * §5.13).
   */
  notePromptHidesWhileViewChanges: boolean;
  /**
   * "Export as PNG" probes for eval with `new Function`, as zod 4 does without `jitless`, which
   * the webview CSP refuses and reports (case `csp`).
   */
  evalUnderCsp: boolean;
  /** "Keyboard shortcuts…" throws an uncaught error a moment after its click (case `csp`). */
  throwFromDialog: boolean;
}

/** What the demo modeler reads from the page around it, at the moment it needs it. */
export interface DemoHooks {
  readonly flaws: DemoFlaws;
  /** `shell.isReadOnly()`. */
  isReadOnly(): boolean;
  /** `viewport.freeRectCenter()`. */
  freeRectCenter(): Point | undefined;
  /**
   * Further creating entries in a group of their own, so the palette is as wide as a notation's
   * (Event Storming's sticky types) and the web app's top row gets tight above 760px.
   */
  readonly extraShapes?: number;
}

/** Guide §5.5: a keyboard-created element moves 24px diagonally off an element already centred there. */
const KEYBOARD_CREATE_OFFSET = 24;
const KEYBOARD_CREATE_ATTEMPTS = 20;

function isCanvasLocked(hooks: DemoHooks): boolean {
  return hooks.isReadOnly() && !hooks.flaws.canvasUnlocked;
}

class DemoPaletteProvider {
  static $inject = [
    "palette",
    "create",
    "elementFactory",
    "lassoTool",
    "handTool",
    "modeling",
    "rules",
    "selection",
    "canvas",
    "elementRegistry",
    "demoHooks",
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly elementFactory: ElementFactory,
    private readonly lassoTool: LassoTool,
    private readonly handTool: HandTool,
    private readonly modeling: Modeling,
    private readonly rules: Rules,
    private readonly selection: Selection,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly hooks: DemoHooks,
  ) {
    palette.registerProvider(this);
  }

  getPaletteEntries(): PaletteEntries {
    const startCreate = (width: number, height: number) => (event: Event) =>
      this.create.start(event, this.elementFactory.createShape({ width, height }));
    // The shell activates an entry from the keyboard with a synthetic click: `detail` is 0.
    const clickCreate = (width: number, height: number) => (event: Event) => {
      if ((event as MouseEvent).detail === 0) this.createAtFreeRectCenter(width, height);
      else startCreate(width, height)(event);
    };
    return {
      "lasso-tool": {
        group: "tools",
        title: "Lasso",
        shortcut: "L",
        html: `<div class="entry">${iconMarkup("square-dashed-mouse-pointer", PALETTE_TOOL_ICON)}</div>`,
        action: { click: (event: Event) => this.lassoTool.activateSelection(event as MouseEvent) },
      },
      "hand-tool": {
        group: "tools",
        title: "Hand",
        shortcut: "H",
        html: `<div class="entry">${iconMarkup("hand", PALETTE_TOOL_ICON)}</div>`,
        action: { click: (event: Event) => this.handTool.activateHand(event) },
      },
      "create.box": {
        group: "shapes",
        title: "Box",
        className: "demo-entry-box",
        action: { dragstart: startCreate(120, 80), click: clickCreate(120, 80) },
      },
      "create.wide-box": {
        group: "shapes",
        title: "Wide box",
        className: "demo-entry-wide-box",
        action: { dragstart: startCreate(200, 80), click: clickCreate(200, 80) },
      },
      ...Object.fromEntries(
        Array.from({ length: this.hooks.extraShapes ?? 0 }, (_, index) => [
          `create.sticky-${index + 1}`,
          {
            group: "stickies",
            title: `Sticky ${index + 1}`,
            className: "demo-entry-box",
            action: { dragstart: startCreate(120, 80), click: clickCreate(120, 80) },
          },
        ]),
      ),
    };
  }

  /** Guide §5.5: in the centre of the free rectangle, selected, with the focus on the canvas. */
  private createAtFreeRectCenter(width: number, height: number): void {
    if (this.hooks.flaws.noKeyboardCreate) return;
    const centre = this.hooks.freeRectCenter();
    if (!centre) return;
    const root = this.canvas.getRootElement() as Parent;
    const shape = this.elementFactory.createShape({ width, height });
    const position = this.freePosition(centre);
    if (this.rules.allowed("shape.create", { shape, position, target: root }) === false) return;
    this.modeling.createShape(shape, position, root);
    this.selection.select(shape);
    this.canvas.focus();
  }

  private freePosition(centre: Point): Point {
    const centres = this.elementRegistry
      .filter((element): element is Shape => "parent" in element && Boolean(element.parent))
      .filter((shape) => !("waypoints" in shape))
      .map((shape) => ({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }));
    let position = centre;
    for (let attempt = 0; attempt < KEYBOARD_CREATE_ATTEMPTS; attempt++) {
      const occupied = centres.some(
        (other) => Math.abs(other.x - position.x) < 1 && Math.abs(other.y - position.y) < 1,
      );
      if (!occupied) break;
      position = { x: position.x + KEYBOARD_CREATE_OFFSET, y: position.y + KEYBOARD_CREATE_OFFSET };
    }
    return position;
  }
}

/** Guide §13.5: a read-only canvas creates, moves, resizes and deletes nothing. */
class DemoRules extends RuleProvider {
  static override $inject = ["eventBus", "demoHooks"];

  constructor(
    eventBus: EventBus,
    private readonly hooks: DemoHooks,
  ) {
    super(eventBus);
  }

  override init(): void {
    this.addRule(
      ["shape.create", "elements.create", "elements.move", "shape.move"],
      (context: { target?: Element | null }) =>
        !isCanvasLocked(this.hooks) && (!context.target || !context.target.parent),
    );
    this.addRule(["shape.resize", "elements.delete"], () => !isCanvasLocked(this.hooks));
  }
}

/** How late diagram-js fires `canvas.viewbox.changed` under `deferUpdate`. */
const DEFERRED_VIEWBOX_CHANGED_MS = 300;

interface NotePrompt {
  element: HTMLElement;
  anchor: Element;
  /** Hidden while the view changes (flaw `notePromptHidesWhileViewChanges`). */
  hidden: boolean;
  showAgain?: ReturnType<typeof setTimeout> | undefined;
}

/**
 * A Note entry and a Delete entry; a locked canvas opens no context pad at all (guide §13.5). The
 * note prompt is a popup above the palette that closes on a pan or zoom (guide §5.13).
 */
class DemoContextPadProvider {
  static $inject = ["contextPad", "modeling", "rules", "eventBus", "canvas", "demoHooks"];

  private notePrompt: NotePrompt | undefined;

  constructor(
    contextPad: ContextPad,
    private readonly modeling: Modeling,
    private readonly rules: Rules,
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly hooks: DemoHooks,
  ) {
    contextPad.registerProvider(this);
    eventBus.on("contextPad.open.allowed", () => (isCanvasLocked(this.hooks) ? false : undefined));
    eventBus.on("canvas.viewbox.changing", () => {
      const { flaws } = this.hooks;
      if (flaws.notePromptHidesWhileViewChanges) this.hideNotePromptWhileViewChanges();
      else if (!flaws.notePromptFollowsView) this.closeNotePrompt();
    });
    eventBus.on("canvas.viewbox.changed", () => this.placeNotePrompt());
    eventBus.on(["selection.changed", "element.mousedown", "diagram.destroy"], () =>
      this.closeNotePrompt(),
    );
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    return {
      note: {
        group: "edit",
        title: "Note…",
        html: `<div class="entry">${iconMarkup("plus")}</div>`,
        action: { click: (event: Event) => this.openNotePrompt(event) },
      },
      ...this.deleteEntry([element]),
    };
  }

  getMultiElementContextPadEntries(elements: Element[]): ContextPadEntries {
    return this.deleteEntry(elements);
  }

  private openNotePrompt(event: Event): void {
    this.closeNotePrompt();
    const anchor = ((event as Event & { delegateTarget?: Element }).delegateTarget ??
      event.target) as Element;
    const element = document.createElement("div");
    element.className = "demo-note-prompt";
    const field = document.createElement("textarea");
    field.setAttribute("aria-label", "Note");
    field.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      this.closeNotePrompt();
    });
    field.addEventListener("blur", () => {
      if (!this.notePrompt?.hidden) this.closeNotePrompt();
    });
    element.append(field);
    this.canvas.getContainer().append(element);
    this.notePrompt = { element, anchor, hidden: false };
    this.placeNotePrompt();
    field.focus();
  }

  /** Beside its pad entry, which moves with the element. */
  private placeNotePrompt(): void {
    if (!this.notePrompt) return;
    const { element, anchor } = this.notePrompt;
    const container = this.canvas.getContainer().getBoundingClientRect();
    const entry = anchor.getBoundingClientRect();
    element.style.left = `${entry.right - container.left + 8}px`;
    element.style.top = `${entry.top - container.top}px`;
  }

  /** The flaw: a deferred `canvas.viewbox.changed` shows the prompt again, 300ms after the change. */
  private hideNotePromptWhileViewChanges(): void {
    const prompt = this.notePrompt;
    if (!prompt) return;
    prompt.hidden = true;
    prompt.element.style.display = "none";
    clearTimeout(prompt.showAgain);
    prompt.showAgain = setTimeout(() => {
      prompt.hidden = false;
      prompt.element.style.display = "";
      this.placeNotePrompt();
      prompt.element.querySelector("textarea")?.focus();
    }, DEFERRED_VIEWBOX_CHANGED_MS);
  }

  private closeNotePrompt(): void {
    const prompt = this.notePrompt;
    if (!prompt) return;
    this.notePrompt = undefined;
    clearTimeout(prompt.showAgain);
    const hadFocus = prompt.element.contains(document.activeElement);
    prompt.element.remove();
    if (hadFocus) this.canvas.focus();
  }

  private deleteEntry(elements: Element[]): ContextPadEntries {
    return {
      delete: {
        group: "edit",
        title: "Delete",
        html: `<div class="entry">${iconMarkup("x")}</div>`,
        action: {
          click: () => {
            if (this.rules.allowed("elements.delete", { elements }) === false) return;
            this.modeling.removeElements([...elements]);
          },
        },
      },
    };
  }
}

/** diagram-js 15 binds no select all; the canvas takes Cmd/Ctrl+A so the host never sees it. */
class DemoSelectAll {
  static $inject = ["keyboard", "selection", "elementRegistry", "canvas", "demoHooks"];

  constructor(
    keyboard: Keyboard,
    selection: Selection,
    elementRegistry: ElementRegistry,
    canvas: Canvas,
    hooks: DemoHooks,
  ) {
    keyboard.addListener((context: { keyEvent: KeyboardEvent }) => {
      const event = context.keyEvent;
      if (hooks.flaws.noSelectAll || event.shiftKey || !isCmd(event) || !isKey(["a", "A"], event))
        return;
      const root = canvas.getRootElement();
      selection.select(elementRegistry.filter((element) => element !== root));
      return true;
    });
  }
}

/** A demo box with the label the label editor writes. */
type LabelledShape = Shape & { demoLabel?: string | undefined };

const UPDATE_LABEL = "demo.label.update";

/** Diagram units; the editor scales it with the zoom, so it covers the label it replaces. */
const LABEL_FONT_SIZE = 13;

function isBox(element: unknown): element is LabelledShape {
  return (
    typeof element === "object" &&
    element !== null &&
    "parent" in element &&
    Boolean(element.parent) &&
    !("waypoints" in element)
  );
}

interface UpdateLabelContext {
  shape: LabelledShape;
  label: string;
  oldLabel?: string | undefined;
}

/** One undoable command per committed label: the demo's document change. */
class UpdateLabelHandler {
  static $inject: string[] = [];

  execute(context: UpdateLabelContext): Element[] {
    context.oldLabel = context.shape.demoLabel;
    context.shape.demoLabel = context.label;
    return [context.shape];
  }

  revert(context: UpdateLabelContext): Element[] {
    context.shape.demoLabel = context.oldLabel;
    return [context.shape];
  }
}

/** The box as diagram-js draws it, its label in the middle. */
class DemoLabelRenderer extends BaseRenderer {
  static $inject = ["eventBus", "defaultRenderer"];

  constructor(
    eventBus: EventBus,
    private readonly defaultRenderer: DefaultRenderer,
  ) {
    super(eventBus, 1500);
  }

  override canRender(element: Element): boolean {
    return isBox(element) && Boolean(element.demoLabel);
  }

  override drawShape(visuals: SVGElement, shape: LabelledShape): SVGElement {
    const box = this.defaultRenderer.drawShape(visuals, shape);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "demo-label");
    text.setAttribute("x", String(shape.width / 2));
    text.setAttribute("y", String(shape.height / 2));
    text.setAttribute("font-size", String(LABEL_FONT_SIZE));
    text.textContent = shape.demoLabel ?? "";
    visuals.append(text);
    return box;
  }

  override getShapePath(shape: Shape): string {
    return this.defaultRenderer.getShapePath(shape);
  }
}

/**
 * In-place label editing the way the renderers of contract 1.2 do it: only the user's gestures
 * commit (Enter, leaving the field, a click or drag on the canvas), a view change keeps the field
 * open and moves it along (L5), a read-only canvas opens none (guide §13.5).
 */
class DemoLabelEditing {
  static $inject = ["canvas", "eventBus", "commandStack", "injector", "demoHooks"];

  private field: HTMLTextAreaElement | undefined;
  private shape: LabelledShape | undefined;

  constructor(
    private readonly canvas: Canvas,
    eventBus: EventBus,
    private readonly commandStack: CommandStack,
    private readonly injector: Injector,
    private readonly hooks: DemoHooks,
  ) {
    commandStack.registerHandler(UPDATE_LABEL, UpdateLabelHandler);
    eventBus.on("element.dblclick", (event: { element?: unknown }) => {
      if (isBox(event.element)) this.activate(event.element);
    });
    eventBus.on(["element.mousedown", "drag.init"], () => this.complete());
    eventBus.on("canvas.viewbox.changing", () => {
      if (this.hooks.flaws.commitLabelOnViewChange) this.complete();
      else if (this.hooks.flaws.closeLabelOnViewChange) this.cancel();
    });
    eventBus.on("canvas.viewbox.changed", () => this.place());
    eventBus.on("shape.remove", (event: { element?: unknown }) => {
      if (event.element === this.shape) this.cancel();
    });
    eventBus.on("diagram.destroy", () => this.cancel());
  }

  private activate(shape: LabelledShape): void {
    if (isCanvasLocked(this.hooks)) return;
    this.complete();
    this.injector.get<ContextPad | null>("contextPad", false)?.close();
    const field = document.createElement("textarea");
    field.className = "demo-label-editor";
    field.setAttribute("aria-label", "Label");
    field.value = shape.demoLabel ?? "";
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.complete();
        this.canvas.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.cancel();
        this.canvas.focus();
      }
    });
    field.addEventListener("blur", () => {
      if (this.field === field) this.complete();
    });
    this.field = field;
    this.shape = shape;
    this.place();
    this.canvas.getContainer().append(field);
    field.focus();
    field.select();
  }

  private complete(): void {
    const { field, shape } = this;
    if (!field || !shape) return;
    this.close();
    const label = field.value.replace(/\s+/g, " ").trim();
    if (label !== (shape.demoLabel ?? "")) {
      this.commandStack.execute(UPDATE_LABEL, { shape, label } satisfies UpdateLabelContext);
    }
  }

  private cancel(): void {
    this.close();
  }

  private close(): void {
    const field = this.field;
    this.field = undefined;
    this.shape = undefined;
    field?.remove();
  }

  private place(): void {
    const { field, shape } = this;
    if (!field || !shape) return;
    const box = this.canvas.getAbsoluteBBox(shape);
    Object.assign(field.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      fontSize: `${LABEL_FONT_SIZE * this.canvas.zoom()}px`,
    });
  }
}

/** Counts the commands that changed the diagram (create, move, delete, a label): its document changes. */
export function countDocumentChanges(diagram: Diagram): () => number {
  let changes = 0;
  diagram.get<EventBus>("eventBus").on("commandStack.changed", () => {
    changes += 1;
  });
  return () => changes;
}

/** A minimal diagram-js modeler with palette, built before the shell is mounted. */
export function createDemoDiagram(container: HTMLElement, hooks: DemoHooks): Diagram {
  const demoModule: ModuleDeclaration = {
    __init__: [
      "demoPaletteProvider",
      "demoRules",
      "demoContextPadProvider",
      "demoSelectAll",
      "demoLabelRenderer",
      "demoLabelEditing",
    ],
    demoHooks: ["value", hooks],
    demoPaletteProvider: ["type", DemoPaletteProvider],
    demoRules: ["type", DemoRules],
    demoContextPadProvider: ["type", DemoContextPadProvider],
    demoSelectAll: ["type", DemoSelectAll],
    demoLabelRenderer: ["type", DemoLabelRenderer],
    demoLabelEditing: ["type", DemoLabelEditing],
  };
  return new Diagram({
    canvas: { container },
    modules: [
      SelectionModule,
      ZoomScrollModule,
      MoveCanvasModule,
      KeyboardModule,
      EditorActionsModule,
      ModelingModule,
      CreateModule,
      MoveModule,
      OutlineModule,
      LassoToolModule,
      HandToolModule,
      PaletteModule,
      ContextPadModule,
      demoModule,
      shellModule,
    ],
  });
}

/** Adds a few boxes, standing in for an import: inside the import events a renderer fires. */
export function addSampleShapes(diagram: Diagram): void {
  const canvas = diagram.get<Canvas>("canvas");
  const modeling = diagram.get<Modeling>("modeling");
  const elementFactory = diagram.get<ElementFactory>("elementFactory");
  const eventBus = diagram.get<EventBus>("eventBus");
  const root = canvas.getRootElement() as Parent;
  eventBus.fire("import.render.start", {});
  for (const [x, y] of [
    [100, 100],
    [400, 160],
    [700, 320],
  ] as const) {
    modeling.createShape(elementFactory.createShape({ width: 160, height: 100 }), { x, y }, root);
  }
  eventBus.fire("import.done", { warnings: [] });
}

/**
 * The demo's stand-in for a renderer's contract instance (`createCollaborativeModeler(…)`): the
 * `contentBounds()` of `@miragon/modeler-api` 1.3, which `connectDiagramJs` fits to by default.
 */
export function createDemoModeler(diagram: Diagram): CollaborativeModelerLike {
  return { contentBounds: () => demoContentBounds(diagram) };
}

/** Bounds of every shape; `undefined` for an empty diagram. */
export function demoContentBounds(diagram: Diagram): Bounds | undefined {
  const shapes = diagram
    .get<ElementRegistry>("elementRegistry")
    .getAll()
    .filter(
      (element): element is typeof element & Bounds =>
        "parent" in element && Boolean(element.parent) && !("waypoints" in element),
    );
  if (shapes.length === 0) return undefined;
  const left = Math.min(...shapes.map((shape) => shape.x));
  const top = Math.min(...shapes.map((shape) => shape.y));
  const right = Math.max(...shapes.map((shape) => shape.x + shape.width));
  const bottom = Math.max(...shapes.map((shape) => shape.y + shape.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
