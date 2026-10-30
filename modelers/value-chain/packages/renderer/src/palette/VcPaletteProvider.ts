import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Palette from "diagram-js/lib/features/palette/Palette";
import type PaletteProvider from "diagram-js/lib/features/palette/PaletteProvider";
import type Create from "diagram-js/lib/features/create/Create";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type HandTool from "diagram-js/lib/features/hand-tool/HandTool";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type SpaceTool from "diagram-js/lib/features/space-tool/SpaceTool";
import type GlobalConnect from "diagram-js/lib/features/global-connect/GlobalConnect";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type ToolManager from "diagram-js/lib/features/tool-manager/ToolManager";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import type { FreeArea, FreeAreaInsets } from "@miragon/modeler-api";
import type { Point } from "@miragon/value-chain-schema-model";
import type VcElementFactory from "../model/VcElementFactory.js";
import { isVcShape, type VcShape } from "../model/di-types.js";
import { ICONS, paletteEntryHtml } from "../draw/icons.js";

interface PaletteEntry {
  group: string;
  html?: string;
  title?: string;
  shortcut?: string;
  action?: Record<string, (event: Event) => void>;
}

export interface VcPaletteConfig {
  /**
   * The canvas area the host's chrome leaves free: Enter or Space on a creating entry places the
   * element in its centre (guide §5.5). Without it, or while its centre is undefined, the element
   * lands in the centre of the visible canvas.
   */
  freeArea?: FreeArea | undefined;
}

interface DirectEditingLike {
  activate(element: Element): boolean;
}

interface EditLock {
  isReadOnly(): boolean;
}

/** Guide §5.5: a keyboard-created element lands this far down-right of one already centred there. */
const KEYBOARD_CREATE_OFFSET = 24;

/**
 * The entries that change the diagram: the edit lock refuses them, and `VcPaletteToolbar` marks them
 * `aria-disabled` under it (guide §13.5). Lasso and Hand stay usable.
 */
export const LOCKED_ENTRIES: ReadonlySet<string> = new Set([
  "space-tool",
  "global-connect-tool",
  "create.step",
  "create.org-unit",
]);

/** Each palette tool's name in diagram-js's tool manager, by the drag that holds it armed. */
const TOOL_BY_ARMED_DRAG: ReadonlyMap<string, string> = new Map([
  ["lasso.selection", "lasso"],
  ["hand", "hand"],
  ["spaceTool.selection", "space"],
  ["global-connect", "global-connect"],
]);

const TOOL_ACTION_SUFFIX = "-tool";

/** The input events at which diagram-js ends a drag; a cancel comes from Escape or from code. */
const DRAG_ENDING_PRESSES: ReadonlySet<string> = new Set(["mousedown", "mouseup", "touchend"]);

/**
 * Where diagram-js's tool manager takes a press as a click on a tool entry, for which it keeps the
 * tool shown armed until that click arms the next one.
 */
const TOOL_ENTRIES_SELECTOR = '.group[data-group="tools"]';

/** The gesture a press with the armed tool starts, by its armed drag: a pan, making space. */
const GESTURE_BY_ARMED_DRAG: ReadonlyMap<string, string> = new Map([
  ["hand", "hand.move"],
  ["spaceTool.selection", "spaceTool"],
]);

/** After the tool manager's own listener of a drag's end (priority 250). */
const AFTER_TOOL_MANAGER = 100;

/**
 * Tools first (Lasso, Hand, Space, Connect), then the creating entries. Tool entry keys end in
 * `-tool` in the group `tools`, so the active tool gets highlighted. Titles and shortcuts are
 * separate fields, so a tooltip shows the key as a chip. A tool entry switches its tool (guide
 * §5.5): Enter or Space on the armed tool puts it down, as on any pressed toggle button, while a
 * pointer's press has already ended the drag that held the tool, so its click arms the tool again.
 */
export default class VcPaletteProvider {
  static $inject = [
    "palette",
    "create",
    "vcElementFactory",
    "handTool",
    "lassoTool",
    "spaceTool",
    "globalConnect",
    "canvas",
    "modeling",
    "selection",
    "elementRegistry",
    "injector",
    "config.vcPalette",
  ];

  private readonly dragging: Dragging;
  private readonly toolManager: ToolManager;
  private stopWaitingForClick: () => void = () => undefined;

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: VcElementFactory,
    private readonly handTool: HandTool,
    private readonly lassoTool: LassoTool,
    private readonly spaceTool: SpaceTool,
    private readonly globalConnect: GlobalConnect,
    private readonly canvas: Canvas,
    private readonly modeling: Modeling,
    private readonly selection: Selection,
    private readonly elementRegistry: ElementRegistry,
    private readonly injector: { get<T>(name: string, strict?: boolean): T | null },
    private readonly config: VcPaletteConfig | undefined,
  ) {
    palette.registerProvider(this as unknown as PaletteProvider);
    this.dragging = injector.get<Dragging>("dragging")!;
    this.toolManager = injector.get<ToolManager>("toolManager")!;
    this.keepPressedToolArmed(injector.get<EventBus>("eventBus")!);
  }

  getPaletteEntries(): Record<string, PaletteEntry> {
    const creator = (action: string, newShape: () => VcShape) => (event: Event) => {
      if (this.lockRefuses(action)) {
        return;
      }
      const shape = newShape();
      if (isKeyboardClick(event)) {
        this.placeInFreeRect(shape);
        return;
      }
      this.create.start(event as MouseEvent, shape as Shape);
    };
    const createStep = creator("create.step", () => this.factory.createNewStep());
    const createOrgUnit = creator("create.org-unit", () => this.factory.createNewOrgUnit());

    return {
      "lasso-tool": {
        group: "tools",
        title: "Lasso",
        shortcut: "L",
        html: paletteEntryHtml(ICONS.lassoTool),
        action: {
          click: this.toolClick("lasso-tool", (event) =>
            this.lassoTool.activateSelection(event, false),
          ),
        },
      },
      "hand-tool": {
        group: "tools",
        title: "Hand",
        shortcut: "H",
        html: paletteEntryHtml(ICONS.handTool),
        action: {
          click: this.toolClick("hand-tool", (event) =>
            this.handTool.activateHand(event, false, false),
          ),
        },
      },
      "space-tool": {
        group: "tools",
        title: "Space",
        shortcut: "S",
        html: paletteEntryHtml(ICONS.spaceTool),
        action: {
          click: this.toolClick("space-tool", (event) =>
            this.spaceTool.activateSelection(event, false, false),
          ),
        },
      },
      "global-connect-tool": {
        group: "tools",
        title: "Connect",
        shortcut: "C",
        html: paletteEntryHtml(ICONS.globalConnect),
        action: {
          click: this.toolClick("global-connect-tool", (event) =>
            this.globalConnect.start(event, false),
          ),
        },
      },
      "create.step": {
        group: "value-chain",
        title: "Step",
        html: paletteEntryHtml(ICONS.createStep, true),
        action: { click: createStep, dragstart: createStep },
      },
      "create.org-unit": {
        group: "value-chain",
        title: "Organizational unit",
        html: paletteEntryHtml(ICONS.createOrgUnit, true),
        action: { click: createOrgUnit, dragstart: createOrgUnit },
      },
    };
  }

  private toolClick(action: string, arm: (event: MouseEvent) => void): (event: Event) => void {
    const tool = action.slice(0, -TOOL_ACTION_SUFFIX.length);
    return (event) => {
      if (this.lockRefuses(action)) return;
      if (this.armedTool() === tool) {
        if (isKeyboardClick(event)) {
          this.dragging.cancel(true);
          return;
        }
      } else if (this.toolManager.isActive(tool)) {
        // The press on this entry ended the drag that held the tool and left the tool shown armed
        // for this click, which the tool manager would take as putting the tool down.
        this.toolManager.setActive(null);
      }
      arm(event as MouseEvent);
    };
  }

  /**
   * diagram-js's tool manager shows a tool armed from its drag's init until that drag ends or is
   * cancelled, but hears the cancel only of a drag the pointer has moved, and an init that arms the
   * tool shown armed shows it put down. So a tool armed from the palette stayed pressed once Escape,
   * the edit lock or Enter on its entry put it down, and Enter on it a second time showed it released
   * while its drag armed it again (#458, #462). It also takes a cancel whose last pointer event lay
   * on the tool entries for a click there, and keeps a tool shown after a press there although the
   * click may arm nothing. And it shows the hand and the space tool released while the pan or the
   * making of space they started runs, and after it, in a listener after the one that arms them
   * again.
   */
  private keepPressedToolArmed(eventBus: EventBus): void {
    for (const [drag, tool] of TOOL_BY_ARMED_DRAG) {
      // A press ends the drag at `<drag>.ended`, where the tool manager decides; it leaves a press on
      // a tool entry to the click that follows, so a switch to another tool shows no gap.
      eventBus.on(`${drag}.cleanup`, (event: { originalEvent?: Event }) => {
        const ending = event.originalEvent;
        if (!ending || !DRAG_ENDING_PRESSES.has(ending.type)) {
          if (this.toolManager.isActive(tool)) this.toolManager.setActive(null);
        } else if (isOnToolEntries(ending)) {
          this.showArmedToolAfterClickOf(ending);
        }
      });
      eventBus.on(`${drag}.canceled`, AFTER_TOOL_MANAGER, () => this.showArmedTool());
    }
    for (const [drag, gesture] of GESTURE_BY_ARMED_DRAG) {
      const tool = TOOL_BY_ARMED_DRAG.get(drag)!;
      eventBus.on(`${drag}.ended`, AFTER_TOOL_MANAGER, () => {
        if (this.dragging.context()?.prefix === gesture) this.toolManager.setActive(tool);
      });
      eventBus.on([`${gesture}.ended`, `${gesture}.canceled`], AFTER_TOOL_MANAGER, () =>
        this.showArmedTool(),
      );
    }
    eventBus.on("diagram.destroy", () => this.stopWaitingForClick());
  }

  /** Shows the tool whose drag waits for its next press, and none while no tool does. */
  private showArmedTool(): void {
    this.toolManager.setActive(this.armedTool() ?? null);
  }

  /**
   * The click of a press on a tool entry arms that entry's tool, unless it never comes (a right
   * press, a release off the entry) or arms nothing (an entry the edit lock refuses). The browser
   * sends the click in the task of the release, so the tool shown is checked in the task after it.
   */
  private showArmedToolAfterClickOf(press: Event): void {
    this.stopWaitingForClick();
    const ownerDocument = (press.target as Node).ownerDocument ?? document;
    const afterClick = () => {
      const timer = setTimeout(() => {
        this.stopWaitingForClick = () => undefined;
        this.showArmedTool();
      });
      this.stopWaitingForClick = () => clearTimeout(timer);
    };
    if (press.type !== "mousedown") {
      afterClick();
      return;
    }
    ownerDocument.addEventListener("mouseup", afterClick, { capture: true, once: true });
    this.stopWaitingForClick = () =>
      ownerDocument.removeEventListener("mouseup", afterClick, { capture: true });
  }

  /** The tool whose drag waits for its next press, if any. */
  private armedTool(): string | undefined {
    const prefix: unknown = this.dragging.context()?.prefix;
    return typeof prefix === "string" ? TOOL_BY_ARMED_DRAG.get(prefix) : undefined;
  }

  private lockRefuses(action: string): boolean {
    return LOCKED_ENTRIES.has(action) && this.editLock()?.isReadOnly() === true;
  }

  /**
   * Enter or Space on a creating entry (guide §5.5): diagram-js's create follows the pointer and
   * never ends without one, so the element goes straight to the centre of the free rectangle,
   * selected, with the focus on the canvas and its label editor open.
   */
  private placeInFreeRect(shape: VcShape): void {
    const centre = this.freeAreaCentre() ?? this.visibleCentre();
    const position = { x: centre.x, y: centre.y };
    while (this.centreTaken(position)) {
      position.x += KEYBOARD_CREATE_OFFSET;
      position.y += KEYBOARD_CREATE_OFFSET;
    }
    const created = this.modeling.createShape(
      shape as Shape,
      position,
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created);
    this.canvas.focus();
    this.injector.get<DirectEditingLike>("directEditing", false)?.activate(created);
  }

  private freeAreaCentre(): Point | undefined {
    const area = this.config?.freeArea;
    if (area?.center) return area.center();
    if (area?.insets) return this.centreWithin(area.insets());
    return undefined;
  }

  /** The centre of the container without `insets`, in diagram coordinates, as a fit centres. */
  private centreWithin(insets: FreeAreaInsets): Point | undefined {
    const { width, height } = this.canvas.getSize();
    if (!(width > 0 && height > 0)) return undefined;
    // An axis the insets leave no room on centres in the whole container instead.
    const middle = (size: number, start: number, end: number): number =>
      start + end < size ? start + (size - start - end) / 2 : size / 2;
    const { x, y, scale } = this.canvas.viewbox();
    return {
      x: x + middle(width, insets.left, insets.right) / scale,
      y: y + middle(height, insets.top, insets.bottom) / scale,
    };
  }

  private visibleCentre(): Point {
    const { x, y, width, height } = this.canvas.viewbox();
    return { x: x + width / 2, y: y + height / 2 };
  }

  private centreTaken(point: Point): boolean {
    return this.elementRegistry
      .filter(isVcShape)
      .some(
        (element) =>
          Math.abs(element.x + element.width / 2 - point.x) < 1 &&
          Math.abs(element.y + element.height / 2 - point.y) < 1,
      );
  }

  private editLock(): EditLock | null {
    return this.injector.get<EditLock>("vcReadOnly", false);
  }
}

/**
 * The click Enter or Space on an entry dispatches (`VcPaletteToolbar`, or the chrome that skins the
 * palette): no pointer, detail 0.
 */
function isKeyboardClick(event: Event): boolean {
  return event.type === "click" && (event as MouseEvent).detail === 0;
}

function isOnToolEntries(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(TOOL_ENTRIES_SELECTOR) !== null;
}
