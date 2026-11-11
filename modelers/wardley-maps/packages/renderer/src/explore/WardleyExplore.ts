import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Outline from "diagram-js/lib/features/outline/Outline";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import type { Injector } from "didi";
import { readBackIds } from "@miragon/wardley-dsl";
import type WardleyExporter from "../io/WardleyExporter.js";
import type WardleyReadOnly from "../read-only/WardleyReadOnly.js";
import { anchorComponentOf, pipelineAnchoredBy } from "../pipeline/index.js";
import { EXPLORE_MARKERS } from "../draw/styles.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
  type WardleyShapeType,
} from "../model/di-types.js";
import {
  chainOf,
  hiddenChainCount,
  hiddenNeighbourCount,
  neighboursOf,
  nodeIds,
  visibleElementIds,
  visibleNodeIds,
  type ExploreDirection,
  type ExploreGraph,
  type ExploreGraphElement,
  type ExploreGraphElementKind,
  type ExploreGraphLink,
} from "./explore-graph.js";

/**
 * Fired with an `ExploreChangedEvent` after every change of explore mode, once the canvas shows
 * it. The renderer's own explore chrome listens above the default priority, so a host listener
 * that destroys the modeler comes last.
 */
export const EXPLORE_CHANGED = "wardley.explore.changed";

/** The diagram-js overlay type of explore mode's chrome on the elements. */
export const EXPLORE_OVERLAY_TYPE = "wardley-explore";

/** `"pick"` until a start component is chosen (or after everything was hidden again). */
export type ExplorePhase = "pick" | "exploring";

/** The payload of `EXPLORE_CHANGED`. */
export interface ExploreChangedEvent {
  active: boolean;
  phase: ExplorePhase | undefined;
  /** The components that show, pipeline members their anchor brings along included. */
  visibleCount: number;
  totalCount: number;
  fadeRest: boolean;
  canStepBack: boolean;
}

export interface ExploreCounts {
  visible: number;
  total: number;
}

/** A component of the value chain, as a start menu lists it. */
export interface ExploreNode {
  /** The id of its element on the canvas. */
  readonly id: string;
  readonly label: string;
  readonly type: WardleyShapeType;
}

const EXPLORING_CLASS = "wardley-exploring";
const PICKING_CLASS = "wardley-explore-picking";
const FADED_CLASS = "wardley-explore-faded";
const HINT_CLASS = "wardley-explore-hint";

const PICK_HINT = "Pick a component to start from.";

/** Ahead of diagram-js's selection on click, so a pick starts from the node instead. */
const PICK_PRIORITY = 1500;
/**
 * After every other listener of a selection change: the selection without the hidden elements then
 * reaches all of them last, as the selection that holds.
 */
const SELECTION_FILTER_PRIORITY = 250;
/** Ahead of diagram-js's tool manager, which arms the lasso on the same event. */
const LASSO_VETO_PRIORITY = 2000;

/** Screen px a revealed component keeps from the canvas edges. */
const VIEW_MARGIN = 24;
/** Screen px a revealed component keeps below the hint. */
const HINT_GAP = 8;
/** Below the palette row and an unmeasured hint: the hint's top, its height and the gap. */
const VIEW_TOP_WITHOUT_HINT = 64 + 28 + HINT_GAP;
/** Screen px a chip takes above or below its component: its height and its gap. */
const CHIP_ALLOWANCE = 24 + 4;

const LINK_ID_PREFIX = "link:";

const COMMENTARY_TYPES: ReadonlySet<WardleyShapeType> = new Set([
  "note",
  "annotation",
  "accelerator",
  "attitude",
  "drawing",
]);

type GraphKind = ExploreGraphElementKind | "link";
type ExploredElement = WardleyShape | WardleyConnection;

/**
 * The graph of the canvas, keyed by document ids: the ids an element keeps across a re-import,
 * also when it was created on the canvas (`shape_3`) since the text was last read.
 */
interface CanvasGraph {
  readonly graph: ExploreGraph;
  readonly nodes: ReadonlySet<string>;
  readonly kindById: ReadonlyMap<string, GraphKind>;
  readonly idByElement: ReadonlyMap<unknown, string>;
  readonly elementById: ReadonlyMap<string, ExploredElement>;
  /** Commentary and the links to it, which the pick phase leaves out. */
  readonly commentary: ReadonlySet<string>;
}

const EMPTY_GRAPH: CanvasGraph = {
  graph: { elements: [], links: [] },
  nodes: new Set(),
  kindById: new Map(),
  idByElement: new Map(),
  elementById: new Map(),
  commentary: new Set(),
};

/** The draw tool, as far as explore mode ends it. */
interface DrawToolLine {
  holdsLine(): boolean;
  finish(): void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Explore mode: the map shown step by step along its value chain, from one component to what it
 * needs (dependencies) and what needs it (dependents). Everything not revealed is hidden, or drawn
 * faded with `setFadeRest(true)`; the exports show only what shows. Exploring changes nothing: no
 * command runs, the elements and the document stay as they are, and the canvas is locked for a
 * reason of its own (`setExploreLock`), which the host's document lock neither ends nor shows.
 * The revealed components are kept by document id, so a re-import keeps them.
 *
 * Every method that takes an id takes the id of the element on the canvas.
 */
export default class WardleyExplore {
  static $inject = [
    "eventBus",
    "canvas",
    "elementRegistry",
    "selection",
    "overlays",
    "wardleyReadOnly",
    "wardleyExporter",
    "injector",
  ];

  private active = false;
  /** The revealed components, by document id: `visibleNodeIds` derives what shows from them. */
  private visible = new Set<string>();
  private shownNodes = new Set<string>();
  private readonly history: Array<Set<string>> = [];
  private lastRevealed = new Set<string>();
  private fadeRest = false;
  private canvasGraph: CanvasGraph = EMPTY_GRAPH;
  private hiddenElements = new Set<unknown>();
  /**
   * There for the modeler's lifetime, empty outside explore mode: a screen reader announces a
   * change of a live region, not always one inserted with its text.
   */
  private readonly hint: HTMLElement;
  private readonly outline: Outline | null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
    private readonly selection: Selection,
    private readonly overlays: Overlays,
    private readonly readOnly: WardleyReadOnly,
    private readonly exporter: WardleyExporter,
    private readonly injector: Injector,
  ) {
    this.outline = injector.get<Outline | null>("outline", false) ?? null;
    this.hint = document.createElement("div");
    this.hint.className = HINT_CLASS;
    this.hint.setAttribute("role", "status");
    this.hint.setAttribute("aria-live", "polite");
    canvas.getContainer().append(this.hint);
    eventBus.on("element.click", PICK_PRIORITY, (event: { element?: unknown }) =>
      this.pick(event.element),
    );
    eventBus.on("selection.changed", SELECTION_FILTER_PRIORITY, () => {
      if (this.active && this.phase() === "exploring") this.dropHiddenFromSelection();
    });
    eventBus.on(["lasso.init", "lasso.selection.init"], LASSO_VETO_PRIORITY, () =>
      this.active ? false : undefined,
    );
    // Every import draws new elements without the markers, also the one that puts the previous
    // map back after a failed render.
    eventBus.on("import.done", () => {
      if (this.active) this.reapply({ keepRevealed: false });
    });
    // An import clears the history (`trigger: "clear"`) before its `import.done`.
    eventBus.on("commandStack.changed", (event?: { trigger?: string }) => {
      if (this.active && event?.trigger !== "clear") this.reapply({ keepRevealed: true });
    });
    eventBus.on("diagram.clear", () => this.leaveQuietly());
    eventBus.on("diagram.destroy", () => {
      this.hint.remove();
      this.active = false;
    });
  }

  isActive(): boolean {
    return this.active;
  }

  phase(): ExplorePhase | undefined {
    if (!this.active) return undefined;
    return this.shownNodes.size > 0 ? "exploring" : "pick";
  }

  /**
   * Starts explore mode at `startNodeId`, else at the one selected component, else with the pick
   * phase; does nothing while it runs.
   */
  enter(startNodeId?: string): void {
    if (this.active) return;
    this.saveHeldLine();
    this.readOnly.setExploreLock(true);
    this.canvasGraph = this.readCanvasGraph();
    this.active = true;
    const start = startNodeId === undefined ? this.selectedNodeId() : this.nodeIdOf(startNodeId);
    this.history.length = 0;
    this.lastRevealed = new Set();
    this.visible = new Set(start === undefined ? [] : [start]);
    this.shownNodes = visibleNodeIds(this.canvasGraph.graph, this.visible);
    this.render();
    if (start === undefined) this.dropHiddenFromSelection();
    else this.selectNode(start);
    this.announce();
  }

  /** Shows the whole map again and lifts the lock; the selection stays. */
  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.clearPresentation();
    this.forget();
    this.readOnly.setExploreLock(false);
    this.reopenContextPad();
    this.announce();
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  /** Shows `nodeId` alone and selects it; from the pick phase this is no step to go back to. */
  startFrom(nodeId: string): void {
    const id = this.active ? this.nodeIdOf(nodeId) : undefined;
    if (id === undefined) return;
    this.change(new Set([id]), { record: this.phase() === "exploring", select: id });
  }

  /** Reveals what a shown component needs (`"dependencies"`) or what needs it, one level deep. */
  revealNeighbours(nodeId: string, direction: ExploreDirection): void {
    this.revealFrom(nodeId, (id) => neighboursOf(this.canvasGraph.graph, id, direction));
  }

  /** Reveals the whole chain from a shown component in `direction`. */
  revealChain(nodeId: string, direction: ExploreDirection): void {
    this.revealFrom(nodeId, (id) => chainOf(this.canvasGraph.graph, id, direction));
  }

  /**
   * Hides a revealed component; hiding the last one goes back to the pick phase. Does nothing where
   * `canHide` is false.
   */
  hide(nodeId: string): void {
    const id = this.hideableId(nodeId);
    if (id !== undefined) this.change(without(this.visible, id), { record: true });
  }

  /**
   * Whether hiding a component hides something: a member that its pipeline's anchor brings along
   * stays while the anchor shows.
   */
  canHide(nodeId: string): boolean {
    return this.hideableId(nodeId) !== undefined;
  }

  private hideableId(nodeId: string): string | undefined {
    const id = this.active ? this.nodeIdOf(nodeId) : undefined;
    if (id === undefined || !this.visible.has(id)) return undefined;
    const shownWithout = visibleNodeIds(this.canvasGraph.graph, without(this.visible, id));
    return sameMembers(shownWithout, this.shownNodes) ? undefined : id;
  }

  showAll(): void {
    if (!this.active) return;
    this.change(new Set(this.canvasGraph.nodes), { record: true });
  }

  /** Goes back to what showed before the last step; the components gone since stay hidden. */
  stepBack(): void {
    const previous = this.active ? this.history.pop() : undefined;
    if (!previous) return;
    this.show(previous);
    this.dropHiddenFromSelection();
    this.announce();
  }

  /** Back to the pick phase, without a step to go back to. */
  restart(): void {
    if (!this.active || (this.phase() === "pick" && this.history.length === 0)) return;
    this.history.length = 0;
    this.show(new Set());
    this.dropHiddenFromSelection();
    this.announce();
  }

  /** Draws what is hidden faded instead of leaving it out; the pick phase always does. */
  setFadeRest(on: boolean): void {
    if (this.fadeRest === on) return;
    this.fadeRest = on;
    if (this.active) this.renderContainer();
    this.announce();
  }

  isFadeRest(): boolean {
    return this.fadeRest;
  }

  canStepBack(): boolean {
    return this.active && this.history.length > 0;
  }

  /** The components that show and all of them; `{ visible: 0, total: 0 }` outside explore mode. */
  counts(): ExploreCounts {
    if (!this.active) return { visible: 0, total: 0 };
    return { visible: this.shownNodes.size, total: this.canvasGraph.nodes.size };
  }

  /** Whether explore mode hides `element` (drawn faded or not at all); false outside it. */
  isHidden(element: unknown): boolean {
    return this.active && this.hiddenElements.has(element);
  }

  /** Whether `element` is a component that shows while exploring, the one the explore keys use. */
  isVisibleNode(element: unknown): boolean {
    const id = this.active ? this.canvasGraph.idByElement.get(element) : undefined;
    return id !== undefined && this.shownNodes.has(id);
  }

  /**
   * How many components next to a component are hidden in `direction`: one level, or the whole
   * chain with `chain`. 0 outside explore mode.
   */
  hiddenCount(nodeId: string, direction: ExploreDirection, chain = false): number {
    const id = this.active ? this.nodeIdOf(nodeId) : undefined;
    if (id === undefined) return 0;
    const count = chain ? hiddenChainCount : hiddenNeighbourCount;
    return count(this.canvasGraph.graph, this.visible, id, direction);
  }

  /** The name of an element, as its label shows it; undefined for an unknown id. */
  labelOf(elementId: string): string | undefined {
    const element: unknown = this.elementRegistry.get(elementId);
    return isWardleyShape(element) ? element.wardleyLabel : undefined;
  }

  /** Every component of the value chain, sorted by name. */
  nodes(): ExploreNode[] {
    const { nodes, elementById } = this.active ? this.canvasGraph : this.readCanvasGraph();
    return [...nodes]
      .map((id) => elementById.get(id))
      .filter(isWardleyShape)
      .map((shape) => ({ id: shape.id, label: shape.wardleyLabel, type: shape.wardleyType }))
      .sort((first, second) => first.label.localeCompare(second.label));
  }

  /** The components that show, in the order of the canvas. */
  visibleNodes(): WardleyShape[] {
    if (!this.active) return [];
    return [...this.shownNodes]
      .map((id) => this.canvasGraph.elementById.get(id))
      .filter(isWardleyShape);
  }

  /**
   * Makes an element show for a host that points at it: a hidden component is revealed (a step),
   * a link between components reveals both its ends, anything else shows once everything does.
   * What explore mode cannot show (commentary on a map without components) ends explore mode.
   * Returns whether the element shows then, which outside explore mode every element does.
   */
  revealElement(elementId: string): boolean {
    const element: unknown = this.elementRegistry.get(elementId);
    if (!isWardleyShape(element) && !isWardleyConnection(element)) return false;
    if (!this.isHidden(element)) return true;
    const id = this.canvasGraph.idByElement.get(element);
    const kind = id === undefined ? undefined : this.canvasGraph.kindById.get(id);
    const nodes = id === undefined ? [] : this.nodesThatReveal(id, kind);
    if (nodes.length === 0) this.showAll();
    else if (this.phase() === "pick" && nodes.length === 1) this.startFrom(nodes[0]!.id);
    else
      this.change(new Set([...this.visible, ...nodes.map((node) => this.idOf(node))]), {
        record: true,
      });
    if (this.isHidden(element)) this.exit();
    return !this.isHidden(element);
  }

  private nodesThatReveal(id: string, kind: GraphKind | undefined): ExploredElement[] {
    const { graph, elementById, nodes } = this.canvasGraph;
    let nodeIdsToShow: string[];
    if (kind === "node") nodeIdsToShow = [id];
    else if (kind === "pipelineFrame")
      nodeIdsToShow = graph.elements
        .filter((element) => element.anchorOfPipeline === id)
        .map((element) => element.id);
    else if (kind === "link") {
      const link = graph.links.find((candidate) => candidate.id === id);
      const ends = link ? [link.from, link.to] : [];
      nodeIdsToShow = ends.every((end) => nodes.has(end)) ? ends : [];
    } else nodeIdsToShow = [];
    return nodeIdsToShow
      .map((nodeId) => elementById.get(nodeId))
      .filter((element): element is ExploredElement => element !== undefined);
  }

  private idOf(element: ExploredElement): string {
    return this.canvasGraph.idByElement.get(element) ?? element.id;
  }

  private revealFrom(nodeId: string, reachedFrom: (id: string) => string[]): void {
    const id = this.active ? this.nodeIdOf(nodeId) : undefined;
    if (id === undefined || !this.shownNodes.has(id)) return;
    const added = reachedFrom(id).filter((reached) => !this.shownNodes.has(reached));
    if (added.length === 0) return;
    this.change(new Set([...this.visible, ...added]), { record: true });
  }

  /** A step: steps that show what already shows change nothing and leave no history. */
  private change(next: ReadonlySet<string>, options: { record: boolean; select?: string }): void {
    const shown = visibleNodeIds(this.canvasGraph.graph, next);
    const changed = !sameMembers(shown, this.shownNodes);
    if (changed) {
      if (options.record) this.history.push(new Set(this.visible));
      this.show(next);
    }
    if (options.select === undefined) this.dropHiddenFromSelection();
    else this.selectNode(options.select);
    if (changed) this.announce();
  }

  private show(next: ReadonlySet<string>): void {
    const before = this.shownNodes;
    this.visible = new Set([...next].filter((id) => this.canvasGraph.nodes.has(id)));
    this.shownNodes = visibleNodeIds(this.canvasGraph.graph, this.visible);
    this.lastRevealed = new Set([...this.shownNodes].filter((id) => !before.has(id)));
    this.render();
    this.bringIntoView(this.lastRevealed);
  }

  /**
   * After an import or a command the canvas holds other elements: the revealed components that
   * are still there show again, anything new stays hidden.
   */
  private reapply({ keepRevealed }: { keepRevealed: boolean }): void {
    this.canvasGraph = this.readCanvasGraph();
    const { nodes } = this.canvasGraph;
    this.visible = new Set([...this.visible].filter((id) => nodes.has(id)));
    this.shownNodes = visibleNodeIds(this.canvasGraph.graph, this.visible);
    this.lastRevealed = keepRevealed
      ? new Set([...this.lastRevealed].filter((id) => this.shownNodes.has(id)))
      : new Set();
    this.render();
    this.dropHiddenFromSelection();
    this.announce();
  }

  private pick(element: unknown): false | undefined {
    if (!this.active || this.phase() !== "pick" || !isWardleyShape(element)) return undefined;
    const id = this.canvasGraph.idByElement.get(element);
    if (id === undefined || !this.canvasGraph.nodes.has(id)) return undefined;
    this.startFrom(element.id);
    return false;
  }

  private render(): void {
    const picking = this.shownNodes.size === 0;
    const shown = picking
      ? new Set<string>()
      : visibleElementIds(this.canvasGraph.graph, this.visible);
    const hidden = new Set<unknown>();
    for (const [id, element] of this.canvasGraph.elementById) {
      const kind = this.canvasGraph.kindById.get(id);
      const isHidden = !shown.has(id);
      const revealed = !isHidden && this.lastRevealed.has(id);
      if (isHidden) hidden.add(element);
      this.mark(element, EXPLORE_MARKERS.hidden, isHidden);
      this.mark(element, EXPLORE_MARKERS.pickable, picking && kind === "node");
      this.mark(element, EXPLORE_MARKERS.commentary, this.canvasGraph.commentary.has(id));
      this.mark(element, EXPLORE_MARKERS.revealed, revealed);
      // diagram-js draws an outline only once its element was hovered or selected, and a revealed
      // component was hidden until now.
      if (revealed) this.outline?.createOutline(element as unknown as Element);
    }
    this.hiddenElements = hidden;
    this.renderContainer();
  }

  private renderContainer(): void {
    const picking = this.phase() === "pick";
    const classes = this.outerContainer().classList;
    classes.toggle(EXPLORING_CLASS, this.active);
    classes.toggle(PICKING_CLASS, picking);
    classes.toggle(FADED_CLASS, picking || (this.active && this.fadeRest));
    this.renderHint();
  }

  private renderHint(): void {
    const { visible, total } = this.counts();
    let text = "";
    if (this.phase() === "pick") text = PICK_HINT;
    else if (this.active)
      text = `${visible} of ${total} ${total === 1 ? "component" : "components"}`;
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  private mark(element: ExploredElement, marker: string, on: boolean): void {
    if (this.canvas.hasMarker(element, marker) === on) return;
    if (on) this.canvas.addMarker(element, marker);
    else this.canvas.removeMarker(element, marker);
  }

  private clearPresentation(): void {
    for (const element of this.elementRegistry.getAll()) {
      if (!isWardleyShape(element) && !isWardleyConnection(element)) continue;
      for (const marker of Object.values(EXPLORE_MARKERS)) this.mark(element, marker, false);
    }
    this.overlays.remove({ type: EXPLORE_OVERLAY_TYPE });
    this.renderContainer();
  }

  private forget(): void {
    this.visible = new Set();
    this.shownNodes = new Set();
    this.history.length = 0;
    this.lastRevealed = new Set();
    this.hiddenElements = new Set();
    this.canvasGraph = EMPTY_GRAPH;
  }

  /** A line the draw tool holds is saved, as the switch to another tool saves it (#485). */
  private saveHeldLine(): void {
    const drawTool = this.injector.get<DrawToolLine | null>("wardleyDrawTool", false);
    if (drawTool?.holdsLine()) drawTool.finish();
  }

  /** `diagram.clear` empties the canvas: explore mode ends without an event. */
  private leaveQuietly(): void {
    if (!this.active) return;
    this.active = false;
    this.clearPresentation();
    this.forget();
    this.readOnly.setExploreLock(false);
  }

  private announce(): void {
    const { visible, total } = this.counts();
    const event: ExploreChangedEvent = {
      active: this.active,
      phase: this.phase(),
      visibleCount: visible,
      totalCount: total,
      fadeRest: this.fadeRest,
      canStepBack: this.canStepBack(),
    };
    this.eventBus.fire(EXPLORE_CHANGED, event);
  }

  private dropHiddenFromSelection(): void {
    const selected = this.selection.get();
    const kept = selected.filter((element) => !this.hiddenElements.has(element));
    if (kept.length !== selected.length) this.selection.select(kept);
  }

  private selectNode(id: string): void {
    const element = this.canvasGraph.elementById.get(id);
    if (element) this.selection.select(element as unknown as Element);
  }

  private selectedNodeId(): string | undefined {
    const selected = this.selection.get();
    return selected.length === 1 ? this.nodeIdOf((selected[0] as { id: string }).id) : undefined;
  }

  /** The document id of the component with the canvas id `elementId`. */
  private nodeIdOf(elementId: string): string | undefined {
    const element: unknown = this.elementRegistry.get(elementId);
    const id = element === undefined ? undefined : this.canvasGraph.idByElement.get(element);
    return id !== undefined && this.canvasGraph.nodes.has(id) ? id : undefined;
  }

  /** The pad shows the entries of the mode the canvas is in now. */
  private reopenContextPad(): void {
    const contextPad = this.injector.get<ContextPad | null>("contextPad", false);
    const selected = this.selection.get() as Element[];
    if (!contextPad?.isOpen() || selected.length === 0) return;
    contextPad.open(selected.length === 1 ? selected[0]! : selected, true);
  }

  /**
   * Scrolls the revealed components into view below the palette row and the hint, with room for
   * their chips above and below, zooming out when they do not fit, never in.
   */
  private bringIntoView(ids: ReadonlySet<string>): void {
    const boxes = [...ids]
      .map((id) => this.canvasGraph.elementById.get(id))
      .filter(isWardleyShape)
      .map((shape) => this.drawnBox(shape));
    const target = unionOf(boxes);
    const viewbox = this.canvas.viewbox();
    const { outer, scale } = viewbox;
    const top = this.freeTop();
    const freeWidth = outer.width - 2 * VIEW_MARGIN;
    const freeHeight = outer.height - top - VIEW_MARGIN - 2 * CHIP_ALLOWANCE;
    if (!target || !(scale > 0) || !(freeWidth > 0) || !(freeHeight > 0)) return;
    const zoom = Math.min(
      scale,
      target.width > 0 ? freeWidth / target.width : scale,
      target.height > 0 ? freeHeight / target.height : scale,
    );
    const chip = CHIP_ALLOWANCE / zoom;
    const width = outer.width / zoom;
    const height = outer.height / zoom;
    let x = zoom === scale ? viewbox.x : viewbox.x + viewbox.width / 2 - width / 2;
    let y = zoom === scale ? viewbox.y : viewbox.y + viewbox.height / 2 - height / 2;
    x += overflow(
      target.x,
      target.x + target.width,
      x + VIEW_MARGIN / zoom,
      x + width - VIEW_MARGIN / zoom,
    );
    y += overflow(
      target.y - chip,
      target.y + target.height + chip,
      y + top / zoom,
      y + height - VIEW_MARGIN / zoom,
    );
    if (zoom === scale && x === viewbox.x && y === viewbox.y) return;
    this.canvas.viewbox({ x, y, width, height });
  }

  /**
   * Screen px from the canvas top that the palette row and the hint below it cover, measured where
   * the hint shows in the upper half of the canvas.
   */
  private freeTop(): number {
    if (!this.hint.textContent) return VIEW_TOP_WITHOUT_HINT;
    const hintBox = this.hint.getBoundingClientRect();
    const canvasBox = this.canvas.getContainer().getBoundingClientRect();
    const hintBottom = hintBox.bottom - canvasBox.top;
    const measured = hintBox.height > 0 && hintBottom > 0 && hintBottom < canvasBox.height / 2;
    return measured ? hintBottom + HINT_GAP : VIEW_TOP_WITHOUT_HINT;
  }

  /** The shape with its name, which runs beside it. */
  private drawnBox(shape: WardleyShape): Box {
    const bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    try {
      const visual = this.elementRegistry
        .getGraphics(shape as unknown as Element)
        ?.querySelector<SVGGraphicsElement>(".djs-visual");
      const drawn = visual?.getBBox();
      if (!drawn || (drawn.width === 0 && drawn.height === 0)) return bounds;
      return unionOf([
        bounds,
        { x: shape.x + drawn.x, y: shape.y + drawn.y, width: drawn.width, height: drawn.height },
      ])!;
    } catch {
      return bounds;
    }
  }

  private readCanvasGraph(): CanvasGraph {
    const documentIds = this.readDocumentIds();
    const documentIdOf = (canvasId: string) => documentIds.get(canvasId) ?? canvasId;
    const elements: ExploreGraphElement[] = [];
    const links: ExploreGraphLink[] = [];
    const kindById = new Map<string, GraphKind>();
    const idByElement = new Map<unknown, string>();
    const elementById = new Map<string, ExploredElement>();
    const remember = (element: ExploredElement, id: string, kind: GraphKind) => {
      kindById.set(id, kind);
      idByElement.set(element, id);
      elementById.set(id, element);
    };
    for (const element of this.elementRegistry.getAll() as unknown[]) {
      if (isWardleyShape(element)) {
        const graphElement = this.graphElementOf(element, documentIdOf);
        elements.push(graphElement);
        remember(element, graphElement.id, graphElement.kind);
      } else if (isWardleyConnection(element) && element.source && element.target) {
        const link: ExploreGraphLink = {
          id: `${LINK_ID_PREFIX}${element.id}`,
          kind: element.wardleyType,
          from: documentIdOf(element.source.id),
          to: documentIdOf(element.target.id),
        };
        links.push(link);
        remember(element, link.id, "link");
      }
    }
    const graph = { elements, links };
    const isCommentary = (id: string) => kindById.get(id) === "commentary";
    const commentary = new Set([
      ...elements.filter((element) => element.kind === "commentary").map(({ id }) => id),
      ...links
        .filter((link) => isCommentary(link.from) || isCommentary(link.to))
        .map(({ id }) => id),
    ]);
    return {
      graph,
      nodes: new Set(nodeIds(graph)),
      kindById,
      idByElement,
      elementById,
      commentary,
    };
  }

  private graphElementOf(
    shape: WardleyShape,
    documentIdOf: (canvasId: string) => string,
  ): ExploreGraphElement {
    const id = documentIdOf(shape.id);
    switch (shape.wardleyType) {
      case "anchor":
      case "submap":
        return { id, kind: "node" };
      case "component": {
        const anchored = pipelineAnchoredBy(this.elementRegistry, shape);
        return {
          id,
          kind: "node",
          pipelineId: shape.pipelineId === undefined ? undefined : documentIdOf(shape.pipelineId),
          anchorOfPipeline: anchored === undefined ? undefined : documentIdOf(anchored.id),
        };
      }
      case "pipeline":
        return {
          id,
          kind: anchorComponentOf(this.elementRegistry, shape) ? "pipelineFrame" : "node",
        };
      default:
        return { id, kind: COMMENTARY_TYPES.has(shape.wardleyType) ? "commentary" : "other" };
    }
  }

  /** Document id by canvas id (identity where the map cannot be read). */
  private readDocumentIds(): ReadonlyMap<string, string> {
    try {
      return readBackIds(this.exporter.export());
    } catch {
      return new Map();
    }
  }

  private outerContainer(): HTMLElement {
    const container = this.canvas.getContainer();
    return (container.closest(".wardley-container") as HTMLElement | null) ?? container;
  }
}

function sameMembers(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
  return first.size === second.size && [...first].every((id) => second.has(id));
}

function without(ids: ReadonlySet<string>, id: string): Set<string> {
  const rest = new Set(ids);
  rest.delete(id);
  return rest;
}

function unionOf(boxes: readonly Box[]): Box | undefined {
  if (boxes.length === 0) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** How far the range `[start, end]` reaches out of `[lowest, highest]`, signed. */
function overflow(start: number, end: number, lowest: number, highest: number): number {
  if (start < lowest) return start - lowest;
  if (end > highest) return end - highest;
  return 0;
}
