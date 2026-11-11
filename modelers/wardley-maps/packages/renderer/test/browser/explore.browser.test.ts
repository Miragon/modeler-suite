import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cdp, page } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type LassoTool from "diagram-js/lib/features/lasso-tool/LassoTool";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import {
  EXPLORE_CHANGED,
  Modeler,
  createCollaborativeModeler,
  exportBounds,
  type CollaborativeWardleyModeler,
  type ExploreChangedEvent,
  type PanConstraint,
  type WardleyExplore,
  type WardleyReadOnly,
} from "../../src/index.js";
import type EvolutionGrid from "../../src/evolution-grid/EvolutionGrid.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import type WardleyInteraction from "../../src/interaction/WardleyInteraction.js";
import type WardleyImporter from "../../src/io/WardleyImporter.js";
import type WardleyElementFactory from "../../src/model/WardleyElementFactory.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from "../../src/model/di-types.js";
import teaShop from "./fixtures/tea-shop.wmap?raw";
import "../../src/assets/wardley.css";

const HIDDEN = "wardley-explore-hidden";

/** The nine components of the Tea Shop: two users and seven components. */
const TEA_SHOP_NODES = 9;

const PIPELINES = `title Pipes
component Hot Water [0.52, 0.8]
component Kettle [0.43, 0.35]
pipeline Kettle [0.23, 0.68] {
  component Electric Kettle [0.45]
  component Smart Kettle [0.29]
}
pipeline Brewing [0.15, 0.55] (y 0.24)
Hot Water -> Kettle
Hot Water -> Brewing`;

/** A chain through a pipeline: the anchor Hosting brings its members, which need Power. */
const HOSTING = `title Hosting
component Checkout [0.9, 0.5]
component Hosting [0.6, 0.5]
pipeline Hosting [0.3, 0.7] {
  component Own Servers [0.35]
  component Cloud [0.65]
}
component Power [0.2, 0.6]
Checkout -> Hosting
Own Servers -> Power
Cloud -> Power`;

const LONG_NAME = "Grid power from a utility far beyond the right edge of the plot";

/** Every element type the renderer draws, each faded at some point while exploring from Builder. */
const EVERY_TYPE = `title Every type
url Portal URL [https://example.com/portal]
anchor User [0.95, 0.2]
component Portal [0.84, 0.31] (build) url(Portal URL)
component Builder [0.66, 0.55] (buy) (color #2B50D4)
component Runtime [0.42, 0.72] (market)
component Compute [0.18, 0.91] (ecosystem)
component Kettle [0.43, 0.35] inertia
component Power [0.1, 0.71] (outsource)
submap Billing [0.7, 0.8] url(Portal URL)
accelerator Open Source [0.5, 0.6]
deaccelerator Lock-in [0.3, 0.85]
pioneers [0.98, 0.05, 0.75, 0.3]
annotation 1 [0.6, 0.4] Review the build
note Standardise the kettle [0.25, 0.4]
line [[0.2, 0.2], [0.3, 0.35], [0.25, 0.5]] (dashed)
line [[0.05, 0.1], [0.1, 0.15], [0.05, 0.2]] (closed)
pipeline Kettle [0.3, 0.65]
pipeline Brewing [0.15, 0.55] (y 0.24)
evolve Kettle 0.62
User -> Portal
Portal -> Builder
Builder -> Runtime
Runtime -> Compute
Builder -> Kettle
Portal +'docs'> Billing
Kettle +> Power
Open Source -> Runtime`;

let container: HTMLElement | undefined;
let modeler: Modeler | undefined;
let collaborative: { host: HTMLElement; modeler: CollaborativeWardleyModeler } | undefined;
/** A stand-in for the shell's root around the map, which the renderer never imports. */
let shellRoot: HTMLElement | undefined;

// The whole map lies in the page, so elementFromPoint reaches every component.
beforeAll(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  modeler?.destroy();
  container?.remove();
  collaborative?.modeler.destroy();
  collaborative?.host.remove();
  shellRoot?.remove();
  modeler = undefined;
  container = undefined;
  collaborative = undefined;
  shellRoot = undefined;
});

async function mount(
  text = teaShop,
  { width = 1024, height = 768, parent = document.body } = {},
): Promise<Modeler> {
  container = document.createElement("div");
  parent.appendChild(container);
  modeler = new Modeler({ container, width, height });
  await modeler.importDSL(text);
  return modeler;
}

async function mountCollaborative(text = teaShop): Promise<CollaborativeWardleyModeler> {
  const host = document.createElement("div");
  host.style.width = "1200px";
  host.style.height = "800px";
  document.body.appendChild(host);
  const created = createCollaborativeModeler();
  created.attachTo(host);
  collaborative = { host, modeler: created };
  await created.importText(text);
  return created;
}

function exploreOf(target: Modeler): WardleyExplore {
  return target.get<WardleyExplore>("wardleyExplore");
}

function registryOf(target: Modeler): ElementRegistry {
  return target.get<ElementRegistry>("elementRegistry");
}

/** The component, user or standalone pipeline of that name; a pipeline frame with `frame`. */
function node(target: Modeler, label: string, frame = false): WardleyShape {
  const found = registryOf(target).find(
    (element) =>
      isWardleyShape(element) &&
      element.wardleyLabel === label &&
      (element.wardleyType === "pipeline") === frame,
  );
  if (!found) throw new Error(`no ${label}`);
  return found as unknown as WardleyShape;
}

function shapeOfType(target: Modeler, type: string): WardleyShape {
  const found = registryOf(target).find(
    (element) => isWardleyShape(element) && element.wardleyType === type,
  );
  if (!found) throw new Error(`no ${type}`);
  return found as unknown as WardleyShape;
}

function link(target: Modeler, from: string, to: string): WardleyConnection {
  const found = registryOf(target).find(
    (element) =>
      isWardleyConnection(element) &&
      (element.source as WardleyShape | undefined)?.wardleyLabel === from &&
      (element.target as WardleyShape | undefined)?.wardleyLabel === to,
  );
  if (!found) throw new Error(`no link ${from} -> ${to}`);
  return found as unknown as WardleyConnection;
}

function isMarkedHidden(target: Modeler, element: WardleyShape | WardleyConnection): boolean {
  return target.get<Canvas>("canvas").hasMarker(element, HIDDEN);
}

/** The names of the components that show, sorted. */
function shownNames(target: Modeler): string[] {
  return (registryOf(target).getAll() as unknown[])
    .filter(isWardleyShape)
    .filter((shape) => ["component", "anchor", "submap"].includes(shape.wardleyType))
    .filter((shape) => !exploreOf(target).isHidden(shape))
    .map((shape) => shape.wardleyLabel)
    .sort();
}

function select(target: Modeler, ...elements: Array<WardleyShape | WardleyConnection>): void {
  target.get<Selection>("selection").select(elements as unknown as Element[]);
}

function selectedIds(target: Modeler): string[] {
  return (target.get<Selection>("selection").get() as Array<{ id: string }>).map(({ id }) => id);
}

function svgOf(target: Modeler): SVGSVGElement {
  return target.get<Canvas>("canvas").getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
}

function press(target: Modeler, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const svg = svgOf(target);
  svg.focus();
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  svg.dispatchEvent(event);
  return event;
}

function graphicsOf(target: Modeler, element: WardleyShape | WardleyConnection): SVGElement {
  return registryOf(target).getGraphics(element as unknown as Element);
}

function centreOfCircle(target: Modeler, shape: WardleyShape): { x: number; y: number } {
  const circle = graphicsOf(target, shape).querySelector(".djs-visual circle")!;
  const rect = circle.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function centreOf(shape: WardleyShape): { x: number; y: number } {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** Whether two boxes on screen overlap. */
function overlaps(first: DOMRect, second: DOMRect): boolean {
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

function mouseInit(point: { x: number; y: number }): MouseEventInit {
  return { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y };
}

/** Presses `element` at `from` and moves the pointer 40 px right and 20 px down in two steps. */
function pressAndDrag(
  element: EventTarget,
  from: { x: number; y: number },
): { x: number; y: number } {
  element.dispatchEvent(new MouseEvent("mousedown", mouseInit(from)));
  document.dispatchEvent(
    new MouseEvent("mousemove", mouseInit({ x: from.x + 20, y: from.y + 10 })),
  );
  const to = { x: from.x + 40, y: from.y + 20 };
  document.dispatchEvent(new MouseEvent("mousemove", mouseInit(to)));
  return to;
}

/** A press of the draw tool at `x`, `y` px from the canvas's top left corner. */
function placePoint(target: Modeler, x: number, y: number): void {
  const box = svgOf(target).getBoundingClientRect();
  svgOf(target).dispatchEvent(
    new MouseEvent("mousedown", mouseInit({ x: box.left + x, y: box.top + y })),
  );
}

function drawingCount(target: Modeler): number {
  return (registryOf(target).getAll() as unknown[]).filter(
    (element) => isWardleyShape(element) && element.wardleyType === "drawing",
  ).length;
}

/** A click as a pointer gives it, on whatever lies on top at that point. */
function clickAt(point: { x: number; y: number }): void {
  const target = document.elementFromPoint(point.x, point.y)!;
  const init = { bubbles: true, cancelable: true, button: 0, clientX: point.x, clientY: point.y };
  target.dispatchEvent(new MouseEvent("mousedown", init));
  document.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new MouseEvent("click", { ...init, detail: 1 }));
}

function outerContainerOf(target: Modeler): HTMLElement {
  return target.container;
}

function hintOf(target: Modeler): HTMLElement | null {
  return target.container.querySelector<HTMLElement>(".wardley-explore-hint");
}

/** The hint outside explore mode: an empty live region that draws nothing. */
function expectQuietHint(target: Modeler): void {
  const hint = hintOf(target)!;
  expect(hint.textContent).toBe("");
  expect([hint.getAttribute("role"), hint.getAttribute("aria-live")]).toEqual(["status", "polite"]);
  expect(getComputedStyle(hint).display).not.toBe("none");
  expect(getComputedStyle(hint).visibility).toBe("visible");
  const box = hint.getBoundingClientRect();
  expect(box.width).toBeLessThanOrEqual(1);
  expect(box.height).toBeLessThanOrEqual(1);
  expect(getComputedStyle(hint).borderTopWidth).toBe("0px");
}

/** The colour a role resolves to inside the map's container, as a computed style reads it. */
function roleColour(target: Modeler, role: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${role})`;
  target.container.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

/** A system colour as it resolves under forced colours, on a probe that keeps its own colours. */
function systemColour(name: string): string {
  const probe = document.createElement("span");
  probe.style.forcedColorAdjust = "none";
  probe.style.color = name;
  document.body.appendChild(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

const DRAWN_TAGS = new Set(["circle", "ellipse", "rect", "path", "polygon", "polyline", "line"]);

/**
 * What of the faded elements vanishes on the plot (neither its fill nor its stroke differs from it)
 * or turns into a block (larger than a glyph and filled in another colour than the plot's).
 */
function fadedPaintProblems(target: Modeler): string[] {
  const plot = roleColour(target, "--cd-ui-plot");
  const problems: string[] = [];
  for (const element of registryOf(target).getAll()) {
    const graphics = registryOf(target).getGraphics(element);
    if (!graphics.classList.contains(HIDDEN) || getComputedStyle(graphics).display === "none") {
      continue;
    }
    for (const drawn of graphics.querySelectorAll(".djs-visual *")) {
      if (!DRAWN_TAGS.has(drawn.tagName) || drawn.classList.contains("wardley-movement-underlay")) {
        continue;
      }
      const style = getComputedStyle(drawn);
      const filled = drawn.tagName !== "line" && style.fill !== "none" && style.fill !== plot;
      const stroked = style.stroke !== "none" && style.stroke !== plot;
      const box = drawn.getBoundingClientRect();
      if (!filled && !stroked) problems.push(`${element.id} ${drawn.tagName} vanishes`);
      if (filled && box.width > 32 && box.height > 32) {
        problems.push(`${element.id} ${drawn.tagName} is a block`);
      }
    }
  }
  return problems;
}

/** The hint's box in the map container's coordinates. */
function hintBoxIn(target: Modeler): DOMRect {
  const hint = hintOf(target)!.getBoundingClientRect();
  const origin = target.container.getBoundingClientRect();
  return new DOMRect(hint.left - origin.left, hint.top - origin.top, hint.width, hint.height);
}

/** A root such as the shell's around the map, with the row its palette takes. */
function shellLike(paletteRow: "top" | "second-row"): HTMLElement {
  shellRoot = document.createElement("div");
  shellRoot.className = "cd-shell";
  shellRoot.dataset["palette"] = paletteRow;
  shellRoot.style.position = "relative";
  document.body.appendChild(shellRoot);
  return shellRoot;
}

/** The shell's status box below the palette row (guide §5.12), placed and sized as the shell does. */
function addStatusBox(root: HTMLElement, height: number): HTMLElement {
  const status = document.createElement("div");
  status.className = "cd-shell-status";
  const top = root.dataset["palette"] === "second-row" ? 116 : 64;
  status.style.cssText = `position: absolute; top: ${top}px; left: 50%; translate: -50% 0; z-index: 20; width: 560px; max-width: calc(100% - 24px); height: ${height}px;`;
  root.appendChild(status);
  return status;
}

/** Every explore marker and class left anywhere in the map, but the hint that stays. */
function exploreTraces(target: Modeler): string[] {
  return [
    ...target.container.querySelectorAll('[class*="wardley-explore"]:not(.wardley-explore-hint)'),
  ]
    .map((element) => element.getAttribute("class") ?? "")
    .concat([...target.container.classList].filter((name) => /wardley-explor/.test(name)));
}

function recordEvents(target: Modeler): ExploreChangedEvent[] {
  const events: ExploreChangedEvent[] = [];
  target.on(EXPLORE_CHANGED, (event: ExploreChangedEvent) => {
    events.push({
      active: event.active,
      phase: event.phase,
      visibleCount: event.visibleCount,
      totalCount: event.totalCount,
      fadeRest: event.fadeRest,
      canStepBack: event.canStepBack,
    });
  });
  return events;
}

describe("explore mode", () => {
  it("starts at the selected component, hides the rest and locks the canvas for itself", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    select(target, hotWater);

    explore.enter();

    expect(explore.isActive()).toBe(true);
    expect(explore.phase()).toBe("exploring");
    expect(shownNames(target)).toEqual(["Hot Water"]);
    expect(explore.counts()).toEqual({ visible: 1, total: TEA_SHOP_NODES });
    expect(isMarkedHidden(target, hotWater)).toBe(false);
    expect(isMarkedHidden(target, node(target, "Kettle"))).toBe(true);
    expect(isMarkedHidden(target, node(target, "Kettle", true))).toBe(true);
    expect(isMarkedHidden(target, shapeOfType(target, "note"))).toBe(true);
    expect(isMarkedHidden(target, link(target, "Hot Water", "Kettle"))).toBe(true);
    expect(getComputedStyle(graphicsOf(target, node(target, "Kettle"))).display).toBe("none");
    expect(getComputedStyle(graphicsOf(target, hotWater)).display).not.toBe("none");
    expect(selectedIds(target)).toEqual([hotWater.id]);

    const lock = target.get<WardleyReadOnly>("wardleyReadOnly");
    expect(lock.isLockedBy("explore")).toBe(true);
    expect(lock.isLockedBy("document")).toBe(false);
    expect(lock.isReadOnlyShown()).toBe(false);
    const classes = outerContainerOf(target).classList;
    expect(classes.contains("wardley-exploring")).toBe(true);
    expect(classes.contains("wardley-read-only")).toBe(false);
    expect(classes.contains("wardley-explore-picking")).toBe(false);
    expect(classes.contains("wardley-explore-faded")).toBe(false);
    const hint = hintOf(target)!;
    expect(hint.textContent).toBe(`1 of ${TEA_SHOP_NODES} components`);
    expect(hint.getAttribute("aria-live")).toBe("polite");
    expect(getComputedStyle(hint).pointerEvents).toBe("none");
  });

  it("starts from a given component, and does nothing when entered again", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const events = recordEvents(target);
    explore.enter(node(target, "Kettle").id);
    explore.enter(node(target, "Power").id);
    expect(shownNames(target)).toEqual(["Kettle"]);
    expect(events).toHaveLength(1);
  });

  it("picks the start among the faded components when none is selected", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    select(target, shapeOfType(target, "note"));

    explore.enter();

    expect(explore.phase()).toBe("pick");
    expect(explore.counts()).toEqual({ visible: 0, total: TEA_SHOP_NODES });
    expect(selectedIds(target)).toEqual([]);
    const classes = outerContainerOf(target).classList;
    expect(classes.contains("wardley-explore-picking")).toBe(true);
    expect(classes.contains("wardley-explore-faded")).toBe(true);
    expect(hintOf(target)!.textContent).toBe("Pick a component to start from.");
    const water = node(target, "Water");
    const canvas = target.get<Canvas>("canvas");
    expect(canvas.hasMarker(water, "wardley-explore-pickable")).toBe(true);
    expect(getComputedStyle(graphicsOf(target, water)).display).not.toBe("none");
    expect(
      getComputedStyle(graphicsOf(target, link(target, "Hot Water", "Water"))).display,
    ).not.toBe("none");
    expect(getComputedStyle(graphicsOf(target, shapeOfType(target, "note"))).display).toBe("none");

    const point = centreOfCircle(target, water);
    expect(graphicsOf(target, water).contains(document.elementFromPoint(point.x, point.y))).toBe(
      true,
    );
    clickAt(point);

    expect(explore.phase()).toBe("exploring");
    expect(shownNames(target)).toEqual(["Water"]);
    expect(selectedIds(target)).toEqual([water.id]);
    expect(explore.canStepBack()).toBe(false);
    expect(classes.contains("wardley-explore-picking")).toBe(false);
    expect(classes.contains("wardley-explore-faded")).toBe(false);
    expect(canvas.hasMarker(water, "wardley-explore-pickable")).toBe(false);
  });

  it("reveals one level or the whole chain in both directions, and counts what stays hidden", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    expect(explore.hiddenCount(hotWater.id, "dependencies")).toBe(2);
    expect(explore.hiddenCount(hotWater.id, "dependencies", true)).toBe(3);
    expect(explore.hiddenCount(hotWater.id, "dependents")).toBe(1);
    expect(explore.hiddenCount(hotWater.id, "dependents", true)).toBe(3);

    explore.revealNeighbours(hotWater.id, "dependencies");
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    expect(isMarkedHidden(target, link(target, "Hot Water", "Kettle"))).toBe(false);
    expect(isMarkedHidden(target, link(target, "Kettle", "Power"))).toBe(true);
    expect(isMarkedHidden(target, node(target, "Kettle", true))).toBe(false);
    const canvas = target.get<Canvas>("canvas");
    expect(canvas.hasMarker(node(target, "Water"), "wardley-explore-new")).toBe(true);
    expect(canvas.hasMarker(hotWater, "wardley-explore-new")).toBe(false);
    expect(explore.hiddenCount(hotWater.id, "dependencies")).toBe(0);
    expect(explore.hiddenCount(hotWater.id, "dependencies", true)).toBe(1);

    explore.revealNeighbours(hotWater.id, "dependents");
    expect(shownNames(target)).toEqual(["Cup of Tea", "Hot Water", "Kettle", "Water"]);
    expect(canvas.hasMarker(node(target, "Water"), "wardley-explore-new")).toBe(false);

    explore.revealChain(node(target, "Cup of Tea").id, "dependents");
    expect(shownNames(target)).toEqual([
      "Business",
      "Cup of Tea",
      "Hot Water",
      "Kettle",
      "Public",
      "Water",
    ]);

    explore.revealChain(hotWater.id, "dependencies");
    expect(shownNames(target)).toContain("Power");
    expect(explore.counts()).toEqual({ visible: 7, total: TEA_SHOP_NODES });
    expect(hintOf(target)!.textContent).toBe(`7 of ${TEA_SHOP_NODES} components`);
  });

  it("takes no step that shows nothing new, and reveals nothing from a hidden component", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");
    const events = recordEvents(target);

    explore.revealNeighbours(hotWater.id, "dependencies");
    explore.revealNeighbours(node(target, "Water").id, "dependencies");
    explore.revealNeighbours(node(target, "Business").id, "dependencies");
    explore.hide(node(target, "Power").id);

    expect(events).toEqual([]);
    explore.stepBack();
    expect(shownNames(target)).toEqual(["Hot Water"]);
    expect(explore.canStepBack()).toBe(false);
  });

  it("hides, steps back, shows all with the commentary and starts over", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const kettle = node(target, "Kettle");
    const power = node(target, "Power");
    explore.enter(kettle.id);
    explore.revealNeighbours(kettle.id, "dependencies");
    expect(shownNames(target)).toEqual(["Kettle", "Power"]);

    select(target, power);
    explore.hide(power.id);
    expect(shownNames(target)).toEqual(["Kettle"]);
    expect(selectedIds(target)).toEqual([]);

    explore.stepBack();
    expect(shownNames(target)).toEqual(["Kettle", "Power"]);
    explore.stepBack();
    expect(shownNames(target)).toEqual(["Kettle"]);
    expect(explore.canStepBack()).toBe(false);
    explore.stepBack();
    expect(shownNames(target)).toEqual(["Kettle"]);

    const note = shapeOfType(target, "note");
    expect(isMarkedHidden(target, note)).toBe(true);
    explore.showAll();
    expect(explore.counts()).toEqual({ visible: TEA_SHOP_NODES, total: TEA_SHOP_NODES });
    expect(isMarkedHidden(target, note)).toBe(false);
    expect(getComputedStyle(graphicsOf(target, note)).display).not.toBe("none");
    expect(
      (registryOf(target).getAll() as unknown[]).filter(
        (element) =>
          (isWardleyShape(element) || isWardleyConnection(element)) && explore.isHidden(element),
      ),
    ).toEqual([]);
    explore.stepBack();
    expect(isMarkedHidden(target, note)).toBe(true);

    explore.startFrom(node(target, "Cup").id);
    expect(shownNames(target)).toEqual(["Cup"]);
    expect(explore.canStepBack()).toBe(true);

    explore.restart();
    expect(explore.phase()).toBe("pick");
    expect(explore.canStepBack()).toBe(false);
    expect(selectedIds(target)).toEqual([]);

    explore.startFrom(node(target, "Cup").id);
    explore.hide(node(target, "Cup").id);
    expect(explore.phase()).toBe("pick");
    explore.stepBack();
    expect(shownNames(target)).toEqual(["Cup"]);
  });

  it("brings revealed components into view, zooming out but never in", async () => {
    const target = await mount();
    const canvas = target.get<Canvas>("canvas");
    const hotWater = node(target, "Hot Water");
    canvas.zoom(3, { x: hotWater.x + hotWater.width / 2, y: hotWater.y + hotWater.height / 2 });
    const business = node(target, "Business");
    const edgeMargin = 24;
    const gapBelowHint = 8;
    const rounding = 0.5;
    const inView = (shape: WardleyShape) => {
      const box = screenBoxOf(target, shape);
      const view = canvas.getContainer().getBoundingClientRect();
      const hint = hintOf(target)!.getBoundingClientRect();
      return (
        box.left >= view.left + edgeMargin - rounding &&
        box.top >= hint.bottom + gapBelowHint - rounding &&
        box.right <= view.right - edgeMargin + rounding &&
        box.bottom <= view.bottom - edgeMargin + rounding
      );
    };
    const explore = exploreOf(target);
    explore.enter(hotWater.id);
    expect(hintOf(target)!.getBoundingClientRect().bottom).toBeGreaterThan(
      canvas.getContainer().getBoundingClientRect().top + 64,
    );
    expect(inView(business)).toBe(false);

    explore.revealChain(hotWater.id, "dependents");

    for (const name of ["Business", "Public", "Cup of Tea"]) {
      expect(inView(node(target, name))).toBe(true);
    }
    expect(canvas.zoom()).toBeLessThanOrEqual(3);

    const zoomBefore = canvas.zoom();
    explore.revealNeighbours(hotWater.id, "dependencies");
    expect(canvas.zoom()).toBeLessThanOrEqual(zoomBefore);
    expect(inView(node(target, "Kettle"))).toBe(true);
    expect(inView(node(target, "Water"))).toBe(true);
  });

  it.each([
    ["a wide container", 1024, 768],
    ["a container at most 760px wide, below the second palette row", 700, 600],
  ])(
    "brings what a step reveals below the hint, with its chip clear of the hint and the palette, in %s",
    async (_, width, height) => {
      const target = await mount(teaShop, { width, height });
      const canvas = target.get<Canvas>("canvas");
      const explore = exploreOf(target);
      const hotWater = node(target, "Hot Water");
      const cupOfTea = node(target, "Cup of Tea");
      canvas.zoom(2.5, centreOf(hotWater));
      const zoomed = canvas.viewbox();
      canvas.viewbox({
        x: centreOf(cupOfTea).x - zoomed.width / 2,
        y: centreOf(hotWater).y - zoomed.height / 2,
        width: zoomed.width,
        height: zoomed.height,
      });
      explore.enter(hotWater.id);
      const before = canvas.viewbox();

      explore.revealNeighbours(hotWater.id, "dependents");

      expect(canvas.viewbox().y).toBeLessThan(before.y);
      const palette = target.container.querySelector(".djs-palette")!.getBoundingClientRect();
      const hint = hintOf(target)!.getBoundingClientRect();
      const visual = graphicsOf(target, cupOfTea)
        .querySelector(".djs-visual")!
        .getBoundingClientRect();
      const chip = chipOf(target, cupOfTea, "dependents")!.getBoundingClientRect();
      for (const revealed of [visual, chip]) {
        expect(overlaps(revealed, hint)).toBe(false);
        expect(overlaps(revealed, palette)).toBe(false);
      }
    },
  );

  it("leaves the view alone when what a step reveals already lies in the free area", async () => {
    const target = await mount();
    const canvas = target.get<Canvas>("canvas");
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    const water = node(target, "Water");
    const kettle = node(target, "Kettle");
    const middle = {
      x: (centreOf(water).x + centreOf(kettle).x) / 2,
      y: (centreOf(water).y + centreOf(kettle).y) / 2,
    };
    canvas.zoom(1);
    const { outer } = canvas.viewbox();
    canvas.viewbox({
      x: middle.x - outer.width / 2,
      y: middle.y - outer.height / 2,
      width: outer.width,
      height: outer.height,
    });
    explore.enter(hotWater.id);
    const before = canvas.viewbox();
    for (const shape of [hotWater, water, kettle]) {
      const box = screenBoxOf(target, shape);
      const canvasBox = svgOf(target).getBoundingClientRect();
      expect(box.top - canvasBox.top).toBeGreaterThan(160);
      expect(canvasBox.bottom - box.bottom).toBeGreaterThan(80);
    }

    explore.revealNeighbours(hotWater.id, "dependencies");

    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    const after = canvas.viewbox();
    expect([after.x, after.y, after.scale]).toEqual([before.x, before.y, before.scale]);
  });

  it("keeps what it reveals in view after the user panned since the last step", async () => {
    const target = await mount(
      `title Bounds\ncomponent Kettle [0.43, 0.35]\ncomponent ${LONG_NAME} [0.5, 0.97]\nKettle -> ${LONG_NAME}`,
    );
    const canvas = target.get<Canvas>("canvas");
    const explore = exploreOf(target);
    const kettle = node(target, "Kettle");
    canvas.zoom(2, centreOf(kettle));
    explore.enter(kettle.id);
    canvas.scroll({ dx: 1 });

    explore.revealNeighbours(kettle.id, "dependencies");

    const label = graphicsOf(target, node(target, LONG_NAME))
      .querySelector(".djs-visual")!
      .getBoundingClientRect();
    const view = svgOf(target).getBoundingClientRect();
    expect(label.left).toBeGreaterThanOrEqual(view.left);
    expect(label.right).toBeLessThanOrEqual(view.right);
  });

  it("draws the hidden rest faded on request, opaque and out of the pointer's way", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    const water = node(target, "Water");
    const waterGraphics = graphicsOf(target, water);
    expect(getComputedStyle(waterGraphics).display).toBe("none");

    explore.setFadeRest(true);

    expect(explore.isFadeRest()).toBe(true);
    expect(outerContainerOf(target).classList.contains("wardley-explore-faded")).toBe(true);
    expect(getComputedStyle(waterGraphics).display).not.toBe("none");
    const circle = waterGraphics.querySelector(".djs-visual circle")!;
    expect(getComputedStyle(circle).stroke).toBe(roleColour(target, "--cd-ui-linie"));
    expect(getComputedStyle(circle).fill).toBe(roleColour(target, "--cd-ui-plot"));
    expect(getComputedStyle(waterGraphics.querySelector(".djs-visual text")!).fill).toBe(
      roleColour(target, "--cd-ui-text-leise"),
    );
    for (const element of [waterGraphics, circle, waterGraphics.querySelector(".djs-visual")!]) {
      expect(getComputedStyle(element).opacity).toBe("1");
    }
    const point = centreOfCircle(target, water);
    expect(waterGraphics.contains(document.elementFromPoint(point.x, point.y))).toBe(false);
    expect(getComputedStyle(graphicsOf(target, shapeOfType(target, "note"))).display).not.toBe(
      "none",
    );

    explore.setFadeRest(false);
    expect(getComputedStyle(waterGraphics).display).toBe("none");
  });

  it("fades what is drawn by its fill alone in the line colour: an anchor's person, a market's dots, an accelerator's arrows", async () => {
    const target = await mount(EVERY_TYPE);
    const explore = exploreOf(target);
    const linie = roleColour(target, "--cd-ui-linie");
    expect(linie).not.toBe(roleColour(target, "--cd-ui-plot"));
    const fillsOf = (label: string, selector: string): string[] =>
      [...graphicsOf(target, node(target, label)).querySelectorAll(selector)].map(
        (drawn) => getComputedStyle(drawn).fill,
      );

    explore.enter();
    expect(fillsOf("User", ".djs-visual path")).toEqual([linie]);
    expect(fillsOf("Runtime", '.djs-visual circle:not([style*="stroke:"])')).toEqual([
      linie,
      linie,
      linie,
    ]);

    explore.startFrom(node(target, "Builder").id);
    explore.setFadeRest(true);
    expect(fillsOf("Open Source", ".djs-visual path")).toEqual([linie]);
    expect(fillsOf("Lock-in", ".djs-visual path")).toEqual([linie]);
    expect(fillsOf("User", ".djs-visual path")).toEqual([linie]);
  });

  it("leaves nothing of a faded element of any type vanishing on the plot or turning into a block", async () => {
    const target = await mount(EVERY_TYPE);
    const explore = exploreOf(target);
    explore.enter();
    expect(fadedPaintProblems(target)).toEqual([]);

    explore.startFrom(node(target, "Builder").id);
    explore.setFadeRest(true);
    const fadedTypes = new Set(
      registryOf(target)
        .getAll()
        .filter((element) => {
          const graphics = registryOf(target).getGraphics(element);
          return (
            graphics.classList.contains(HIDDEN) && getComputedStyle(graphics).display !== "none"
          );
        })
        .map((element) => (element as unknown as { wardleyType: string }).wardleyType),
    );
    expect([...fadedTypes].sort()).toEqual(
      [
        "accelerator",
        "anchor",
        "annotation",
        "attitude",
        "component",
        "dependency",
        "drawing",
        "flow",
        "note",
        "pipeline",
        "submap",
      ].sort(),
    );
    expect(fadedPaintProblems(target)).toEqual([]);
    const region = graphicsOf(target, shapeOfType(target, "attitude"));
    expect(getComputedStyle(region.querySelector(".djs-visual rect")!).fill).toBe("none");
    const badge = graphicsOf(target, node(target, "Portal")).querySelector(
      ".wardley-link-badge > circle",
    )!;
    expect(getComputedStyle(badge).stroke).toBe(roleColour(target, "--cd-ui-linie"));
  });

  it("follows pipelines: an anchor brings its frame and members, a standalone pipeline is a component", async () => {
    const target = await mount(PIPELINES);
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    expect(explore.counts()).toEqual({ visible: 1, total: 5 });
    expect(explore.hiddenCount(hotWater.id, "dependencies")).toBe(2);

    explore.revealNeighbours(hotWater.id, "dependencies");

    expect(shownNames(target)).toEqual(["Electric Kettle", "Hot Water", "Kettle", "Smart Kettle"]);
    expect(isMarkedHidden(target, node(target, "Kettle", true))).toBe(false);
    expect(isMarkedHidden(target, node(target, "Brewing", true))).toBe(false);
    expect(explore.counts()).toEqual({ visible: 5, total: 5 });

    explore.startFrom(node(target, "Electric Kettle").id);
    expect(isMarkedHidden(target, node(target, "Kettle", true))).toBe(false);
    expect(isMarkedHidden(target, node(target, "Kettle"))).toBe(true);
    expect(explore.nodes().map(({ label }) => label)).toEqual([
      "Brewing",
      "Electric Kettle",
      "Hot Water",
      "Kettle",
      "Smart Kettle",
    ]);
  });

  it("ends with everything shown, the selection kept and the lock lifted", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");
    explore.setFadeRest(true);
    select(target, node(target, "Water"));

    explore.exit();

    expect(explore.isActive()).toBe(false);
    expect(explore.phase()).toBeUndefined();
    expect(exploreTraces(target)).toEqual([]);
    expectQuietHint(target);
    expect(selectedIds(target)).toEqual([node(target, "Water").id]);
    expect(target.get<WardleyReadOnly>("wardleyReadOnly").isReadOnly()).toBe(false);
    expect(getComputedStyle(graphicsOf(target, node(target, "Power"))).display).not.toBe("none");
    expect(explore.canStepBack()).toBe(false);
    explore.exit();
  });

  it("keeps one hint as a live region for the modeler's lifetime, empty outside explore mode", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hint = hintOf(target)!;
    expectQuietHint(target);

    explore.enter();
    expect(hintOf(target)).toBe(hint);
    expect(hint.textContent).toBe("Pick a component to start from.");
    expect(hint.getBoundingClientRect().height).toBeGreaterThan(1);
    explore.startFrom(node(target, "Kettle").id);
    expect(hintOf(target)).toBe(hint);

    explore.exit();
    expect(hintOf(target)).toBe(hint);
    expectQuietHint(target);
    target.clear();
    expect(hintOf(target)).toBe(hint);

    target.destroy();
    modeler = undefined;
    expect(hint.isConnected).toBe(false);
  });

  it("offers Hide only where it hides something: a member its anchor brings along stays", async () => {
    const target = await mount(PIPELINES);
    const explore = exploreOf(target);
    const kettle = node(target, "Kettle");
    const electricKettle = node(target, "Electric Kettle");
    explore.enter(kettle.id);
    expect(shownNames(target)).toEqual(["Electric Kettle", "Kettle", "Smart Kettle"]);
    expect(explore.canHide(kettle.id)).toBe(true);
    expect(explore.canHide(electricKettle.id)).toBe(false);
    const events = recordEvents(target);

    explore.hide(electricKettle.id);
    select(target, electricKettle);
    expect(padActions(target)).toEqual(["explore.all-dependents"]);
    expect(press(target, "h").defaultPrevented).toBe(true);
    expect(shownNames(target)).toEqual(["Electric Kettle", "Kettle", "Smart Kettle"]);
    expect(events).toEqual([]);

    explore.revealChain(electricKettle.id, "dependents");
    expect(shownNames(target)).toEqual(["Electric Kettle", "Hot Water", "Kettle", "Smart Kettle"]);
    select(target, electricKettle);
    expect(openPad(target)).toBeNull();

    explore.startFrom(electricKettle.id);
    expect(explore.canHide(electricKettle.id)).toBe(true);
    explore.revealNeighbours(electricKettle.id, "dependents");
    expect(shownNames(target)).toEqual(["Electric Kettle", "Kettle", "Smart Kettle"]);
    expect(explore.canHide(electricKettle.id)).toBe(false);
    select(target, kettle);
    expect(padActions(target)).toContain("explore.hide");
    press(target, "h");
    expect(shownNames(target)).toEqual(["Electric Kettle"]);
  });

  it("follows a chain through a pipeline: from its anchor down to what its members need, from a member up to its anchor", async () => {
    const target = await mount(HOSTING);
    const explore = exploreOf(target);
    const checkout = node(target, "Checkout");
    const power = node(target, "Power");
    const everything = ["Checkout", "Cloud", "Hosting", "Own Servers", "Power"];
    select(target, checkout);
    press(target, "e");
    expect(explore.hiddenCount(checkout.id, "dependencies", true)).toBe(4);

    press(target, "ArrowDown", { shiftKey: true });

    expect(shownNames(target)).toEqual(everything);
    expect(explore.hiddenCount(checkout.id, "dependencies", true)).toBe(0);
    expect(chips(target)).toEqual([]);

    explore.startFrom(power.id);
    expect(selectedIds(target)).toEqual([power.id]);
    expect(explore.hiddenCount(power.id, "dependents", true)).toBe(4);
    press(target, "ArrowUp", { shiftKey: true });
    expect(shownNames(target)).toEqual(everything);
  });

  it("draws the solid outline on what a step revealed, also where the pointer never was", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    const water = node(target, "Water");
    explore.enter(hotWater.id);

    explore.revealNeighbours(hotWater.id, "dependencies");

    expect(selectedIds(target)).toEqual([hotWater.id]);
    const outline = graphicsOf(target, water).querySelector<SVGElement>(":scope > .djs-outline");
    expect(outline).not.toBeNull();
    const style = getComputedStyle(outline!);
    expect(style.visibility).toBe("visible");
    expect(style.strokeWidth).toBe("2px");
    expect(style.stroke).toBe(roleColour(target, "--cd-ui-interaktion"));
    expect(style.strokeDasharray).toBe("none");
  });

  it("leaves a link to commentary out of the pick phase, as the commentary", async () => {
    const target = await mount(
      `title Accelerated\ncomponent Search [0.6, 0.5]\ncomponent Index [0.4, 0.6]\naccelerator Open Source [0.3, 0.3]\nOpen Source -> Search\nSearch -> Index`,
    );
    const explore = exploreOf(target);
    const accelerated = link(target, "Open Source", "Search");

    explore.enter();

    expect(explore.phase()).toBe("pick");
    expect(getComputedStyle(graphicsOf(target, accelerated)).display).toBe("none");
    expect(getComputedStyle(graphicsOf(target, link(target, "Search", "Index"))).display).not.toBe(
      "none",
    );
    explore.showAll();
    expect(getComputedStyle(graphicsOf(target, accelerated)).display).not.toBe("none");
  });

  it("changes nothing in the document and leaves the history alone", async () => {
    const target = await mount();
    const before = target.exportDSL();
    let commands = 0;
    target.on("commandStack.changed", () => (commands += 1));
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");

    explore.enter(hotWater.id);
    explore.revealChain(hotWater.id, "dependencies");
    explore.revealNeighbours(hotWater.id, "dependents");
    explore.hide(node(target, "Water").id);
    explore.setFadeRest(true);
    explore.stepBack();
    explore.showAll();
    explore.restart();
    explore.exit();

    expect(target.exportDSL()).toBe(before);
    expect(commands).toBe(0);
    expect(target.get<CommandStack>("commandStack").canUndo()).toBe(false);
    expect(target.get<WardleyInteraction>("wardleyInteraction").isActive()).toBe(false);
  });

  it("keeps its own lock apart from the document lock", async () => {
    const target = await mount();
    const lock = target.get<WardleyReadOnly>("wardleyReadOnly");
    const explore = exploreOf(target);
    explore.enter(node(target, "Kettle").id);

    lock.setReadOnly(true);
    lock.setReadOnly(false);
    expect(lock.isReadOnly()).toBe(true);
    expect(lock.isLockedBy("explore")).toBe(true);

    lock.setReadOnly(true);
    explore.exit();
    expect(lock.isLockedBy("document")).toBe(true);
    expect(outerContainerOf(target).classList.contains("wardley-read-only")).toBe(true);
    lock.setReadOnly(false);
    expect(lock.isReadOnly()).toBe(false);
  });

  it("selects only what shows, by Cmd/Ctrl+A and from anywhere else", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);

    press(target, "a", { ctrlKey: true });
    expect(selectedIds(target)).toEqual([hotWater.id]);

    explore.revealNeighbours(hotWater.id, "dependencies");
    press(target, "a", { metaKey: true });
    expect(selectedIds(target).sort()).toEqual(
      [
        hotWater.id,
        node(target, "Water").id,
        node(target, "Kettle").id,
        node(target, "Kettle", true).id,
        link(target, "Hot Water", "Water").id,
        link(target, "Hot Water", "Kettle").id,
      ].sort(),
    );

    select(target, node(target, "Water"), node(target, "Power"), link(target, "Kettle", "Power"));
    expect(selectedIds(target)).toEqual([node(target, "Water").id]);
  });

  it("keeps the lasso down while it runs", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    const dragging = target.get<Dragging>("dragging");

    target
      .get<LassoTool>("lassoTool")
      .activateSelection(new MouseEvent("mousemove", { clientX: 200, clientY: 200 }), true);
    expect(dragging.context()).toBeFalsy();

    press(target, "l");
    expect(dragging.context()).toBeFalsy();

    const root = target.get<Canvas>("canvas").getRootElement();
    target.get<EventBus>("eventBus").fire("element.mousedown", {
      element: root,
      originalEvent: new MouseEvent("mousedown", { shiftKey: true, clientX: 200, clientY: 200 }),
    });
    expect(dragging.context()).toBeFalsy();
    expect(selectedIds(target)).toEqual([node(target, "Hot Water").id]);

    explore.exit();
    target
      .get<LassoTool>("lassoTool")
      .activateSelection(new MouseEvent("mousemove", { clientX: 200, clientY: 200 }), true);
    expect(dragging.context()).toBeTruthy();
    dragging.cancel(false);
  });

  it("re-applies what showed by document id after an import, keeping anything new hidden", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");
    const events = recordEvents(target);

    await target.importDSL(`${teaShop}\ncomponent Milk [0.6, 0.7]\nHot Water -> Milk\n`);

    expect(explore.isActive()).toBe(true);
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    expect(isMarkedHidden(target, node(target, "Milk"))).toBe(true);
    expect(isMarkedHidden(target, link(target, "Hot Water", "Milk"))).toBe(true);
    expect(isMarkedHidden(target, node(target, "Power"))).toBe(true);
    expect(explore.counts()).toEqual({ visible: 3, total: TEA_SHOP_NODES + 1 });
    expect(explore.canStepBack()).toBe(true);
    expect(events.at(-1)).toMatchObject({ active: true, phase: "exploring", visibleCount: 3 });
    expect(target.get<WardleyReadOnly>("wardleyReadOnly").isLockedBy("explore")).toBe(true);

    explore.stepBack();
    expect(shownNames(target)).toEqual(["Hot Water"]);
    expect(isMarkedHidden(target, node(target, "Milk"))).toBe(true);
    expect(isMarkedHidden(target, node(target, "Kettle"))).toBe(true);
    explore.revealNeighbours(node(target, "Hot Water").id, "dependencies");
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Milk", "Water"]);

    await target.importDSL(`title Elsewhere\ncomponent Lemon [0.5, 0.5]\n`);
    expect(explore.phase()).toBe("pick");
    expect(explore.counts()).toEqual({ visible: 0, total: 1 });
    expect(hintOf(target)!.textContent).toBe("Pick a component to start from.");
    expect(explore.canStepBack()).toBe(true);
    explore.startFrom(node(target, "Lemon").id);
    expect(hintOf(target)!.textContent).toBe("1 of 1 component");

    explore.stepBack();
    expect(explore.phase()).toBe("pick");
    expect(explore.counts()).toEqual({ visible: 0, total: 1 });
    expect(hintOf(target)!.textContent).toBe("Pick a component to start from.");
    expect(explore.canStepBack()).toBe(false);

    await target.importDSL(teaShop);
    expect(explore.phase()).toBe("pick");
    expect(explore.counts()).toEqual({ visible: 0, total: TEA_SHOP_NODES });
  });

  it("keeps exploring when an import fails to render, with the markers back on the map it restores", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");
    const powerBefore = node(target, "Power");
    const importer = target.get<WardleyImporter>("wardleyImporter");
    vi.spyOn(importer, "import").mockImplementationOnce(() => {
      throw new Error("render failed");
    });

    await expect(target.importDSL(`title Elsewhere\ncomponent Lemon [0.5, 0.5]\n`)).rejects.toThrow(
      "render failed",
    );

    expect(node(target, "Power")).not.toBe(powerBefore);
    expect(explore.isActive()).toBe(true);
    expect(explore.phase()).toBe("exploring");
    expect(target.get<WardleyReadOnly>("wardleyReadOnly").isLockedBy("explore")).toBe(true);
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    expect(isMarkedHidden(target, node(target, "Hot Water"))).toBe(false);
    expect(isMarkedHidden(target, node(target, "Water"))).toBe(false);
    expect(isMarkedHidden(target, node(target, "Power"))).toBe(true);
    expect(isMarkedHidden(target, link(target, "Kettle", "Power"))).toBe(true);
    expect(getComputedStyle(graphicsOf(target, node(target, "Power"))).display).toBe("none");
    expect(explore.counts()).toEqual({ visible: 3, total: TEA_SHOP_NODES });
    expect(explore.canStepBack()).toBe(true);
  });

  it("drops a hidden element from the selection an import brings back", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    const before = target.exportDSL();

    await target.importDSL(before);
    select(target, node(target, "Power"), node(target, "Hot Water"));

    expect(selectedIds(target)).toEqual([node(target, "Hot Water").id]);
  });

  it("keeps a component created on the canvas revealed across the host's echo, by the id the document gives it", async () => {
    const created = await mountCollaborative();
    const diagram = created.diagram as Modeler;
    const explore = exploreOf(diagram);
    const modeling = diagram.get<Modeling>("modeling");
    const milk = diagram
      .get<WardleyElementFactory>("wardleyElementFactory")
      .createNew("component", "Milk") as unknown as Shape;
    const root = diagram.get<Canvas>("canvas").getRootElement() as Shape;
    modeling.createShape(milk, { x: 400, y: 300 }, root);
    modeling.connect(node(diagram, "Cup of Tea") as unknown as Shape, milk, {
      wardleyType: "dependency",
    });
    expect(milk.id).toMatch(/^shape_/);
    explore.enter(milk.id);
    explore.revealNeighbours(milk.id, "dependents");
    expect(shownNames(diagram)).toEqual(["Cup of Tea", "Milk"]);

    await created.importText(created.exportText());

    const echoed = node(diagram, "Milk");
    expect(echoed.id).not.toBe(milk.id);
    expect(explore.phase()).toBe("exploring");
    expect(shownNames(diagram)).toEqual(["Cup of Tea", "Milk"]);
    expect(explore.counts()).toEqual({ visible: 2, total: TEA_SHOP_NODES + 1 });
    expect(isMarkedHidden(diagram, echoed)).toBe(false);
    expect(isMarkedHidden(diagram, link(diagram, "Cup of Tea", "Milk"))).toBe(false);
    expect(created.elements.selection()).toEqual([echoed.id]);
    expect(explore.canStepBack()).toBe(true);
    explore.stepBack();
    expect(shownNames(diagram)).toEqual(["Milk"]);
  });
});

describe("explore mode's hint below the palette row (guide §5.12, §5.15)", () => {
  function paletteBox(target: Modeler): DOMRect {
    return target.container.querySelector(".djs-palette")!.getBoundingClientRect();
  }

  it("moves below the second palette row of a container at most 760px wide, and draws nothing once empty", async () => {
    const target = await mount(teaShop, { width: 700, height: 600 });
    const explore = exploreOf(target);
    explore.enter();

    expect(paletteBox(target).top - target.container.getBoundingClientRect().top).toBe(64);
    expect(overlaps(hintOf(target)!.getBoundingClientRect(), paletteBox(target))).toBe(false);
    expect(hintBoxIn(target).top).toBe(116);

    explore.exit();
    expectQuietHint(target);
  });

  it("moves below the palette the shell put in the second row of a wide container", async () => {
    const target = await mount(teaShop, { parent: shellLike("second-row") });
    // As the shell's palette.css does for its measured second row.
    target.container.querySelector<HTMLElement>(".djs-palette")!.style.top = "var(--cd-shell-frei)";
    const explore = exploreOf(target);
    explore.enter();

    expect(overlaps(hintOf(target)!.getBoundingClientRect(), paletteBox(target))).toBe(false);
    expect(hintBoxIn(target).top).toBe(116);

    explore.exit();
    expectQuietHint(target);
  });

  it.each([
    ["top" as const, 1024, 65, 137, 64],
    ["second-row" as const, 700, 85, 209, 116],
  ])(
    "moves below the shell's status box while it shows, under the %s palette row",
    async (paletteRow, width, statusHeight, belowStatus, withoutStatus) => {
      const root = shellLike(paletteRow);
      const target = await mount(teaShop, { width, height: 600, parent: root });
      const status = addStatusBox(root, statusHeight);
      const explore = exploreOf(target);
      explore.enter();

      const hint = hintOf(target)!.getBoundingClientRect();
      expect(overlaps(hint, status.getBoundingClientRect())).toBe(false);
      expect(overlaps(hint, paletteBox(target))).toBe(false);
      expect(hintBoxIn(target).top).toBe(belowStatus);

      status.hidden = true;
      expect(hintBoxIn(target).top).toBe(withoutStatus);
      status.hidden = false;
      explore.exit();
      expectQuietHint(target);
    },
  );
});

describe("explore mode under forced colours (guide §5.14)", () => {
  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  it("keeps a faded element's own colours on the light plot, dashes its solid lines and writes its labels in GrayText on a Canvas halo", async () => {
    const target = await mount();
    target.container.setAttribute("data-cd-theme", "light");
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    explore.setFadeRest(true);
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [
        { name: "forced-colors", value: "active" },
        { name: "prefers-color-scheme", value: "dark" },
      ],
    });

    const water = graphicsOf(target, node(target, "Water"));
    const circle = water.querySelector<SVGElement>(".djs-visual circle")!;
    const line = graphicsOf(target, link(target, "Hot Water", "Water")).querySelector<SVGElement>(
      ".djs-visual polyline",
    )!;
    for (const drawn of [circle, line]) {
      expect(getComputedStyle(drawn).stroke).toBe(drawn.style.stroke);
      expect(getComputedStyle(drawn).strokeDasharray).toBe("4px, 3px");
    }
    expect(getComputedStyle(circle).fill).toBe(circle.style.fill);
    const person = graphicsOf(target, node(target, "Business")).querySelector<SVGElement>(
      ".djs-visual > g",
    )!;
    expect(getComputedStyle(person).fill).toBe(person.style.fill);
    const label = water.querySelector<SVGElement>(".djs-visual text")!;
    expect(getComputedStyle(label).forcedColorAdjust).toBe("none");
    expect(getComputedStyle(label).fill).toBe(systemColour("GrayText"));
    expect(getComputedStyle(label).stroke).toBe(systemColour("Canvas"));

    const start = graphicsOf(target, node(target, "Hot Water"));
    const startCircle = start.querySelector<SVGElement>(".djs-visual circle")!;
    const startLabel = start.querySelector<SVGElement>(".djs-visual text")!;
    expect(getComputedStyle(startCircle).strokeDasharray).toBe("none");
    expect(getComputedStyle(startCircle).stroke).toBe(startCircle.style.stroke);
    expect(getComputedStyle(startLabel).fill).toBe(startLabel.style.fill);

    explore.exit();
    expectQuietHint(target);
  });
});

describe("explore mode's keys on the focused canvas", () => {
  it("toggles with E, also under the document lock, and only on the canvas", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    select(target, node(target, "Hot Water"));

    expect(press(target, "e").defaultPrevented).toBe(true);
    expect(explore.phase()).toBe("exploring");
    press(target, "E", { shiftKey: true });
    expect(explore.isActive()).toBe(false);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
    expect(explore.isActive()).toBe(false);

    const lock = target.get<WardleyReadOnly>("wardleyReadOnly");
    lock.setReadOnly(true);
    press(target, "e");
    expect(explore.isActive()).toBe(true);
    lock.setReadOnly(false);
    expect(lock.isReadOnly()).toBe(true);
    press(target, "e");
    expect(explore.isActive()).toBe(false);
    expect(lock.isReadOnly()).toBe(false);
  });

  it("reveals with the arrows, hides with H, steps back with B, starts over with R and fades with F", async () => {
    const target = await mount();
    const before = target.exportDSL();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    select(target, hotWater);
    press(target, "e");

    expect(press(target, "ArrowDown").defaultPrevented).toBe(true);
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    press(target, "ArrowUp");
    expect(shownNames(target)).toEqual(["Cup of Tea", "Hot Water", "Kettle", "Water"]);
    select(target, node(target, "Cup of Tea"));
    press(target, "ArrowUp", { shiftKey: true });
    expect(shownNames(target)).toContain("Business");
    select(target, hotWater);
    press(target, "ArrowDown", { shiftKey: true });
    expect(shownNames(target)).toContain("Power");

    press(target, "h");
    expect(shownNames(target)).not.toContain("Hot Water");
    press(target, "b");
    expect(shownNames(target)).toContain("Hot Water");

    press(target, "f");
    expect(explore.isFadeRest()).toBe(true);
    press(target, "f");
    expect(explore.isFadeRest()).toBe(false);

    select(target, hotWater);
    press(target, "Escape");
    expect(selectedIds(target)).toEqual([]);
    expect(explore.isActive()).toBe(true);
    press(target, "ArrowDown");
    expect(explore.counts().visible).toBe(7);

    press(target, "r");
    expect(explore.phase()).toBe("pick");
    expect(target.exportDSL()).toBe(before);
    expect(target.get<CommandStack>("commandStack").canUndo()).toBe(false);
  });

  it.each([
    [
      "a label drag",
      (target: Modeler) => {
        const handle = graphicsOf(target, node(target, "Water")).querySelector(
          ".wardley-label-handle",
        )!;
        const box = handle.getBoundingClientRect();
        return { handle, from: { x: box.left + 4, y: box.top + box.height / 2 } };
      },
    ],
    [
      "a drag of the evolve target",
      (target: Modeler) => {
        const handle = graphicsOf(target, node(target, "Kettle")).querySelector(
          ".wardley-evolve-handle",
        )!;
        const box = handle.getBoundingClientRect();
        return { handle, from: { x: box.left + box.width / 2, y: box.top + box.height / 2 } };
      },
    ],
  ])(
    "takes E without effect during %s, whose release then edits outside explore mode",
    async (_, grab) => {
      const target = await mount();
      const explore = exploreOf(target);
      const exploringAtCommand: boolean[] = [];
      target.on("commandStack.changed", () => exploringAtCommand.push(explore.isActive()));
      const { handle, from } = grab(target);
      const to = pressAndDrag(handle, from);
      expect(target.get<WardleyInteraction>("wardleyInteraction").isActive()).toBe(true);

      expect(press(target, "e").defaultPrevented).toBe(true);
      expect(explore.isActive()).toBe(false);
      document.dispatchEvent(new MouseEvent("mouseup", mouseInit(to)));

      expect(explore.isActive()).toBe(false);
      expect(exploringAtCommand).toEqual([false]);
      expect(target.get<CommandStack>("commandStack").canUndo()).toBe(true);
      press(target, "e");
      expect(explore.isActive()).toBe(true);
    },
  );

  it("takes E without effect while the draw tool holds a line, which it keeps", async () => {
    const target = await mount();
    const drawTool = target.get<WardleyDrawTool>("wardleyDrawTool");
    drawTool.activate();
    placePoint(target, 300, 300);
    placePoint(target, 420, 360);
    placePoint(target, 500, 300);
    expect(press(target, "c").defaultPrevented).toBe(true);

    expect(press(target, "e").defaultPrevented).toBe(true);

    expect(exploreOf(target).isActive()).toBe(false);
    expect(drawTool.holdsLine()).toBe(true);
    expect(drawingCount(target)).toBe(0);
  });

  it("saves the line the draw tool holds when its palette entry or the service starts explore mode", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const drawTool = target.get<WardleyDrawTool>("wardleyDrawTool");
    drawTool.activate();
    placePoint(target, 300, 300);
    placePoint(target, 420, 360);
    placePoint(target, 500, 300);

    clickOn(paletteEntry(target, "explore"));

    expect(explore.isActive()).toBe(true);
    expect(drawTool.holdsLine()).toBe(false);
    expect(drawingCount(target)).toBe(1);
    expect(target.get<CommandStack>("commandStack").canUndo()).toBe(true);

    explore.exit();
    drawTool.activate();
    placePoint(target, 300, 420);
    placePoint(target, 420, 480);
    explore.enter();
    expect(explore.isActive()).toBe(true);
    expect(drawTool.holdsLine()).toBe(false);
    expect(drawingCount(target)).toBe(2);
  });

  it("moves nothing with the arrows of a selection that explores nothing", async () => {
    const target = await mount();
    const before = target.exportDSL();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    select(target, link(target, "Hot Water", "Water"));
    press(target, "ArrowDown");
    press(target, "ArrowLeft");
    press(target, "c");
    expect(explore.counts().visible).toBe(1);
    expect(target.exportDSL()).toBe(before);
  });
});

describe("the export while exploring", () => {
  it("shows only what shows, without a trace of explore mode, and is unchanged afterwards", async () => {
    const target = await mount();
    const untouched = (await target.saveSVG()).svg;
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");

    const { svg } = await target.saveSVG();

    for (const shown of [
      hotWater,
      node(target, "Water"),
      node(target, "Kettle"),
      node(target, "Kettle", true),
      link(target, "Hot Water", "Water"),
    ]) {
      expect(svg).toContain(`data-element-id="${shown.id}"`);
    }
    for (const hidden of [
      node(target, "Power"),
      node(target, "Cup of Tea"),
      shapeOfType(target, "note"),
      link(target, "Kettle", "Power"),
    ]) {
      expect(svg).not.toContain(`data-element-id="${hidden.id}"`);
    }
    expect(svg).not.toContain("wardley-explore");

    explore.setFadeRest(true);
    expect((await target.saveSVG()).svg).toBe(svg);

    explore.exit();
    expect((await target.saveSVG()).svg).toBe(untouched);
  });

  it("measures the export and the pan constraint without what explore mode hides", async () => {
    const target = await mount(
      `title Bounds\ncomponent Kettle [0.43, 0.35]\ncomponent ${LONG_NAME} [0.5, 0.97]\nKettle -> ${LONG_NAME}`,
    );
    const canvas = target.get<Canvas>("canvas");
    const grid = target.get<EvolutionGrid>("evolutionGrid");
    const panConstraint = target.get<PanConstraint>("panConstraint");
    const plot = grid.outerBounds();
    const full = exportBounds(canvas, grid);
    expect(full.x + full.width).toBeGreaterThan(plot.x + plot.width);
    const fullContent = panConstraint.contentBounds();

    exploreOf(target).enter(node(target, "Kettle").id);

    const explored = exportBounds(canvas, grid);
    expect(explored.x + explored.width).toBeLessThan(full.x + full.width);
    expect(explored.x).toBeLessThanOrEqual(plot.x);
    expect(explored.x + explored.width).toBeGreaterThanOrEqual(plot.x + plot.width);
    expect(panConstraint.contentBounds().width).toBeLessThan(fullContent.width);

    exploreOf(target).exit();
    expect(exportBounds(canvas, grid)).toEqual(full);
    expect(panConstraint.contentBounds()).toEqual(fullContent);
  });
});

describe("the contract's elements.reveal while exploring", () => {
  it("reveals a hidden component as a step, then selects it", async () => {
    const created = await mountCollaborative();
    const diagram = created.diagram as Modeler;
    const explore = exploreOf(diagram);
    const before = created.exportText();
    let changes = 0;
    created.onContentChanged(() => (changes += 1));
    explore.enter(node(diagram, "Hot Water").id);
    const power = node(diagram, "Power");

    expect(created.elements.reveal(power.id)).toBe(true);

    expect(explore.isHidden(power)).toBe(false);
    expect(created.elements.selection()).toEqual([power.id]);
    expect(explore.canStepBack()).toBe(true);
    expect(created.elements.list()).toHaveLength(TEA_SHOP_NODES + 1);
    expect(created.exportText()).toBe(before);
    expect(changes).toBe(0);
  });

  it("starts from a component revealed in the pick phase, and shows a pipeline by its anchor", async () => {
    const created = await mountCollaborative();
    const diagram = created.diagram as Modeler;
    const explore = exploreOf(diagram);
    explore.enter();
    const cup = node(diagram, "Cup");

    expect(created.elements.reveal(cup.id)).toBe(true);
    expect(explore.phase()).toBe("exploring");
    expect(shownNames(diagram)).toEqual(["Cup"]);
    expect(explore.canStepBack()).toBe(false);

    const frame = node(diagram, "Kettle", true);
    expect(created.elements.reveal(frame.id)).toBe(true);
    expect(explore.isHidden(frame)).toBe(false);
    expect(shownNames(diagram)).toEqual(["Cup", "Kettle"]);
    expect(created.elements.selection()).toEqual([frame.id]);
  });

  it("shows everything for hidden commentary on a map with components, as a step, then selects it", async () => {
    const created = await mountCollaborative(`${teaShop}\naccelerator Speed [0.5, 0.5]\n`);
    const diagram = created.diagram as Modeler;
    const explore = exploreOf(diagram);
    explore.enter(node(diagram, "Hot Water").id);
    const speed = shapeOfType(diagram, "accelerator");
    const speedId = created.elements.list().find((element) => element.name === "Speed")!.id;
    expect(explore.isHidden(speed)).toBe(true);

    expect(created.elements.reveal(speedId)).toBe(true);

    expect(explore.phase()).toBe("exploring");
    expect(explore.counts()).toEqual({ visible: TEA_SHOP_NODES, total: TEA_SHOP_NODES });
    expect(isMarkedHidden(diagram, speed)).toBe(false);
    expect(getComputedStyle(graphicsOf(diagram, speed)).display).not.toBe("none");
    expect(created.elements.selection()).toEqual([speedId]);
    expect(explore.canStepBack()).toBe(true);
    explore.stepBack();
    expect(shownNames(diagram)).toEqual(["Hot Water"]);
    expect(isMarkedHidden(diagram, speed)).toBe(true);
  });

  it("reveals both ends of a hidden link between components as one step, through the service the contract calls", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    const kettleToPower = link(target, "Kettle", "Power");
    expect(explore.isHidden(kettleToPower)).toBe(true);

    expect(explore.revealElement(kettleToPower.id)).toBe(true);

    expect(explore.phase()).toBe("exploring");
    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Power"]);
    expect(isMarkedHidden(target, kettleToPower)).toBe(false);
    expect(isMarkedHidden(target, shapeOfType(target, "note"))).toBe(true);
    expect(explore.canStepBack()).toBe(true);
    explore.stepBack();
    expect(shownNames(target)).toEqual(["Hot Water"]);
  });

  it("ends explore mode for what it cannot show, then selects it as before", async () => {
    const created = await mountCollaborative(
      `title Commentary\naccelerator Speed [0.5, 0.5]\nnote Keep going [0.3, 0.3]\n`,
    );
    const diagram = created.diagram as Modeler;
    const explore = exploreOf(diagram);
    explore.enter();
    expect(explore.phase()).toBe("pick");
    const accelerator = shapeOfType(diagram, "accelerator");
    const events = recordEvents(diagram);

    expect(created.elements.reveal(accelerator.id)).toBe(true);

    expect(explore.isActive()).toBe(false);
    expect(events.at(-1)).toMatchObject({ active: false });
    expect(isMarkedHidden(diagram, accelerator)).toBe(false);
    expect(getComputedStyle(graphicsOf(diagram, accelerator)).display).not.toBe("none");
    expect(created.elements.selection()).toEqual([accelerator.id]);
  });

  it("selects nothing once a listener of the step destroyed the modeler", async () => {
    const created = await mountCollaborative();
    const diagram = created.diagram as Modeler;
    exploreOf(diagram).enter(node(diagram, "Hot Water").id);
    const power = node(diagram, "Power");
    diagram.on(EXPLORE_CHANGED, () => created.destroy());

    expect(created.elements.reveal(power.id)).toBe(false);

    expect(diagram.container.querySelector(".djs-container")).toBeNull();
  });

  it("reveals as before outside explore mode", async () => {
    const created = await mountCollaborative();
    const diagram = created.diagram as Modeler;
    const events = recordEvents(diagram);
    expect(created.elements.reveal(node(diagram, "Power").id)).toBe(true);
    expect(created.elements.selection()).toEqual([node(diagram, "Power").id]);
    expect(events).toEqual([]);
    expect(exploreTraces(diagram)).toEqual([]);
  });
});

describe("EXPLORE_CHANGED", () => {
  it("reports each change once the canvas shows it", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const events = recordEvents(target);
    const water = node(target, "Water");
    const seen: Array<{ waterHidden: boolean; selected: string[] }> = [];
    target.on(EXPLORE_CHANGED, () =>
      seen.push({ waterHidden: explore.isHidden(water), selected: selectedIds(target) }),
    );
    const hotWater = node(target, "Hot Water");
    select(target, hotWater);

    explore.enter();
    explore.revealNeighbours(hotWater.id, "dependencies");
    explore.revealNeighbours(hotWater.id, "dependencies");
    explore.setFadeRest(true);
    explore.restart();
    explore.exit();

    const base = { totalCount: TEA_SHOP_NODES, fadeRest: false, canStepBack: false };
    expect(events).toEqual([
      { ...base, active: true, phase: "exploring", visibleCount: 1 },
      { ...base, active: true, phase: "exploring", visibleCount: 3, canStepBack: true },
      {
        ...base,
        active: true,
        phase: "exploring",
        visibleCount: 3,
        canStepBack: true,
        fadeRest: true,
      },
      { ...base, active: true, phase: "pick", visibleCount: 0, fadeRest: true },
      {
        active: false,
        phase: undefined,
        visibleCount: 0,
        totalCount: 0,
        fadeRest: true,
        canStepBack: false,
      },
    ]);
    expect(seen.slice(0, 2)).toEqual([
      { waterHidden: true, selected: [hotWater.id] },
      { waterHidden: false, selected: [hotWater.id] },
    ]);
  });
});

const MODELLING_TOOLS = ["lasso-tool", "draw-tool", "explore"];
const TOOLBAR = [
  "explore",
  "explore.start-from",
  "explore.back",
  "explore.show-all",
  "explore.restart",
  "explore.faded",
];

function paletteEntries(target: Modeler): HTMLElement[] {
  return [...target.container.querySelectorAll<HTMLElement>(".djs-palette .entry[data-action]")];
}

function paletteActions(target: Modeler): string[] {
  return paletteEntries(target).map((entry) => entry.dataset["action"]!);
}

function paletteEntry(target: Modeler, action: string): HTMLElement {
  const found = paletteEntries(target).find((entry) => entry.dataset["action"] === action);
  if (!found) throw new Error(`no palette entry ${action}`);
  return found;
}

/** A click as a pointer gives it (`detail` 1), or as Enter or Space on a button (`detail` 0). */
function clickOn(element: EventTarget, { keyboard = false } = {}): void {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: keyboard ? 0 : 1 }),
  );
}

function pressOn(element: HTMLElement, key: string): KeyboardEvent {
  element.focus();
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function openPad(target: Modeler): HTMLElement | null {
  return target.container.querySelector<HTMLElement>(".djs-context-pad.open");
}

function padActions(target: Modeler): string[] {
  return [...(openPad(target)?.querySelectorAll<HTMLElement>(".entry") ?? [])].map(
    (entry) => entry.dataset["action"]!,
  );
}

function padEntry(target: Modeler, action: string): HTMLElement {
  const found = openPad(target)?.querySelector<HTMLElement>(`.entry[data-action="${action}"]`);
  if (!found) throw new Error(`no pad entry ${action}`);
  return found;
}

function chips(target: Modeler): HTMLButtonElement[] {
  return [...target.container.querySelectorAll<HTMLButtonElement>(".wardley-explore-chip")];
}

function chipOf(
  target: Modeler,
  shape: WardleyShape,
  direction: "dependents" | "dependencies",
): HTMLButtonElement | undefined {
  return chips(target).find(
    (chip) => chip.dataset["elementId"] === shape.id && chip.dataset["direction"] === direction,
  );
}

/** The shape's bounds on screen. */
function screenBoxOf(target: Modeler, shape: WardleyShape): DOMRect {
  const canvas = target.get<Canvas>("canvas");
  const viewbox = canvas.viewbox();
  const origin = canvas.getContainer().getBoundingClientRect();
  return new DOMRect(
    origin.left + (shape.x - viewbox.x) * viewbox.scale,
    origin.top + (shape.y - viewbox.y) * viewbox.scale,
    shape.width * viewbox.scale,
    shape.height * viewbox.scale,
  );
}

describe("explore mode's toolbar in the palette", () => {
  it("adds the toggle after Draw, and swaps the modelling entries for the toolbar while it runs", async () => {
    const target = await mount();
    const toggle = paletteEntry(target, "explore");
    expect(paletteActions(target).slice(0, 3)).toEqual(MODELLING_TOOLS);
    expect(paletteActions(target)).toHaveLength(15);
    expect(toggle.closest<HTMLElement>(".group")!.dataset["group"]).toBe("tools");
    expect(toggle.getAttribute("aria-label")).toBe("Explore mode");
    expect(toggle.getAttribute("aria-keyshortcuts")).toBe("E");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.querySelector("svg")?.getAttribute("width")).toBe("20");
    select(target, node(target, "Hot Water"));

    clickOn(toggle);

    const explore = exploreOf(target);
    expect(explore.phase()).toBe("exploring");
    expect(document.activeElement).toBe(svgOf(target));
    expect(padActions(target)).toContain("explore.hide");
    expect(paletteActions(target)).toEqual(TOOLBAR);
    for (const entry of paletteEntries(target)) {
      expect(entry.closest<HTMLElement>(".group")!.dataset["group"]).toBe("tools");
      expect(entry.getAttribute("role")).toBe("button");
    }
    expect(
      paletteEntries(target).map((entry) => [
        entry.getAttribute("aria-label"),
        entry.getAttribute("aria-keyshortcuts"),
        entry.getAttribute("aria-pressed"),
        entry.getAttribute("aria-disabled"),
      ]),
    ).toEqual([
      ["Explore mode", "E", "true", null],
      ["Start from…", null, null, null],
      ["Step back", "B", null, "true"],
      ["Show all", null, null, null],
      ["Start over", "R", null, null],
      ["Faded rest", "F", "false", null],
    ]);

    clickOn(paletteEntry(target, "explore"));

    expect(explore.isActive()).toBe(false);
    expect(paletteActions(target)).toHaveLength(15);
    expect(paletteEntry(target, "explore").getAttribute("aria-pressed")).toBe("false");
  });

  it("follows the state of explore mode, whatever starts or changes it", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    expect(paletteEntry(target, "explore.back").getAttribute("aria-disabled")).toBe("true");

    explore.revealNeighbours(node(target, "Hot Water").id, "dependencies");
    expect(paletteEntry(target, "explore.back").hasAttribute("aria-disabled")).toBe(false);
    explore.setFadeRest(true);
    expect(paletteEntry(target, "explore.faded").getAttribute("aria-pressed")).toBe("true");
    press(target, "e");
    expect(paletteActions(target).slice(0, 3)).toEqual(MODELLING_TOOLS);
  });

  it("runs each step from its entry, and steps back only when there is a step", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    const events = recordEvents(target);

    clickOn(paletteEntry(target, "explore.back"));
    expect(events).toEqual([]);
    expect(shownNames(target)).toEqual(["Hot Water"]);

    clickOn(paletteEntry(target, "explore.show-all"));
    expect(explore.counts()).toEqual({ visible: TEA_SHOP_NODES, total: TEA_SHOP_NODES });
    expect(document.activeElement).toBe(svgOf(target));

    clickOn(paletteEntry(target, "explore.back"));
    expect(shownNames(target)).toEqual(["Hot Water"]);
    expect(paletteEntry(target, "explore.back").getAttribute("aria-disabled")).toBe("true");

    clickOn(paletteEntry(target, "explore.faded"));
    expect(explore.isFadeRest()).toBe(true);
    expect(paletteEntry(target, "explore.faded").getAttribute("aria-pressed")).toBe("true");
    clickOn(paletteEntry(target, "explore.faded"));
    expect(explore.isFadeRest()).toBe(false);

    clickOn(paletteEntry(target, "explore.restart"));
    expect(explore.phase()).toBe("pick");
    expect(target.get<CommandStack>("commandStack").canUndo()).toBe(false);
  });

  it("keeps the focus on the entry Enter pressed, when the palette is built again without the shell", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    select(target, node(target, "Hot Water"));

    pressOn(paletteEntry(target, "explore"), "Enter");

    expect(explore.isActive()).toBe(true);
    expect(document.activeElement).toBe(paletteEntry(target, "explore"));
    expect(paletteEntry(target, "explore").getAttribute("aria-pressed")).toBe("true");
    expect(paletteEntry(target, "explore").tabIndex).toBe(0);

    pressOn(paletteEntry(target, "explore.faded"), "Enter");
    expect(explore.isFadeRest()).toBe(true);
    expect(document.activeElement).toBe(paletteEntry(target, "explore.faded"));

    pressOn(paletteEntry(target, "explore.back"), "Enter");
    expect(explore.counts().visible).toBe(1);

    pressOn(paletteEntry(target, "explore"), "Enter");
    expect(explore.isActive()).toBe(false);
    expect(document.activeElement).toBe(paletteEntry(target, "explore"));
    expect(paletteEntry(target, "explore").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("explore mode's context pad", () => {
  it("offers the steps that reveal something on a component that shows, and Hide, as the modelling pad looks", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");

    explore.enter(hotWater.id);

    const pad = openPad(target)!;
    expect(getComputedStyle(pad).display).not.toBe("none");
    expect(padActions(target)).toEqual([
      "explore.dependencies",
      "explore.dependents",
      "explore.all-dependencies",
      "explore.all-dependents",
      "explore.hide",
    ]);
    const titles = [
      "Show dependencies",
      "Show dependents",
      "Show all dependencies",
      "Show all dependents",
      "Hide",
    ];
    const entries = [...pad.querySelectorAll<HTMLElement>(".entry")];
    expect(entries.map((entry) => entry.getAttribute("aria-label"))).toEqual(titles);
    for (const entry of entries) {
      expect(entry.classList.contains("wardley-cp-entry")).toBe(true);
      expect(entry.getAttribute("role")).toBe("button");
      const icon = entry.querySelector("svg")!;
      expect([icon.getAttribute("width"), icon.getAttribute("stroke-width")]).toEqual([
        "16",
        "2.5",
      ]);
    }

    clickOn(padEntry(target, "explore.dependencies"));

    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    expect(openPad(target)).not.toBe(pad);
    expect(padActions(target)).toEqual([
      "explore.dependents",
      "explore.all-dependencies",
      "explore.all-dependents",
      "explore.hide",
    ]);
    expect(document.activeElement).toBe(svgOf(target));
  });

  it("opens again on its component after Enter, with the focus on its first entry once the step has nothing left", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);

    pressOn(padEntry(target, "explore.all-dependencies"), "Enter");

    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Power", "Water"]);
    expect(padActions(target)).toEqual([
      "explore.dependents",
      "explore.all-dependents",
      "explore.hide",
    ]);
    expect(document.activeElement).toBe(padEntry(target, "explore.dependents"));

    pressOn(padEntry(target, "explore.hide"), "Enter");
    expect(shownNames(target)).toEqual(["Kettle", "Power", "Water"]);
    expect(openPad(target)).toBeNull();
    expect(document.activeElement).toBe(svgOf(target));
  });

  it("opens on nothing but one component that shows, also under the document lock", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const contextPad = target.get<ContextPad>("contextPad");
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");

    select(target, link(target, "Hot Water", "Water"));
    expect(openPad(target)).toBeNull();
    select(target, hotWater);
    contextPad.open(node(target, "Power") as unknown as Element);
    expect(openPad(target)).toBeNull();
    select(target, hotWater, node(target, "Water"));
    expect(openPad(target)).toBeNull();
    explore.showAll();
    select(target, shapeOfType(target, "note"));
    expect(openPad(target)).toBeNull();

    target.get<WardleyReadOnly>("wardleyReadOnly").setReadOnly(true, { delayMs: 0 });
    select(target, hotWater);
    expect(getComputedStyle(openPad(target)!).display).not.toBe("none");
    expect(padActions(target)).toEqual(["explore.hide"]);
  });

  it("gives the modelling entries back on exit", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter(node(target, "Hot Water").id);
    explore.exit();
    expect(padActions(target)).toContain("edit-label");
    expect(padActions(target).filter((action) => action.startsWith("explore."))).toEqual([]);
  });
});

describe("explore mode's chips", () => {
  it("hang above and below each component that shows, with how many are hidden there", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);

    expect(chips(target)).toHaveLength(2);
    const up = chipOf(target, hotWater, "dependents")!;
    const down = chipOf(target, hotWater, "dependencies")!;
    expect([up.type, up.tabIndex, up.textContent]).toEqual(["button", -1, "1"]);
    expect(up.getAttribute("aria-label")).toBe("Show 1 dependent of Hot Water");
    expect(down.getAttribute("aria-label")).toBe("Show 2 dependencies of Hot Water");
    expect(down.textContent).toBe("2");
    expect(down.querySelector("svg")?.getAttribute("width")).toBe("16");

    const shape = screenBoxOf(target, hotWater);
    const upBox = up.getBoundingClientRect();
    const downBox = down.getBoundingClientRect();
    expect(upBox.height).toBeGreaterThanOrEqual(24);
    expect(upBox.width).toBeGreaterThanOrEqual(24);
    expect(upBox.bottom).toBeCloseTo(shape.top - 4, 0);
    expect(downBox.top).toBeCloseTo(shape.bottom + 4, 0);
    expect(upBox.left + upBox.width / 2).toBeCloseTo(shape.left + shape.width / 2, 0);
    expect(downBox.left + downBox.width / 2).toBeCloseTo(shape.left + shape.width / 2, 0);
    expect(getComputedStyle(up).backgroundColor).toBe(roleColour(target, "--cd-ui-flaeche-hoch"));
    expect(getComputedStyle(up).borderTopColor).toBe(roleColour(target, "--cd-ui-linie"));
    expect(getComputedStyle(up).zIndex).toBe("auto");

    target.get<Canvas>("canvas").zoom(2);
    await vi.waitFor(() => {
      const zoomed = chipOf(target, hotWater, "dependents")!.getBoundingClientRect();
      expect(zoomed.width).toBeCloseTo(upBox.width, 1);
      expect(zoomed.height).toBeCloseTo(upBox.height, 1);
      expect(zoomed.bottom).toBeCloseTo(screenBoxOf(target, hotWater).top - 4, 0);
    });
  });

  it("leave the component they hang on to the pointer, and take it only on the chip itself", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    const kettle = node(target, "Kettle");
    explore.enter(hotWater.id);
    explore.revealNeighbours(hotWater.id, "dependencies");
    expect(chipOf(target, hotWater, "dependents")).toBeDefined();
    expect(chipOf(target, kettle, "dependencies")).toBeDefined();

    for (const shape of [kettle, hotWater]) {
      const point = centreOfCircle(target, shape);
      expect(graphicsOf(target, shape).contains(document.elementFromPoint(point.x, point.y))).toBe(
        true,
      );
      clickAt(point);
      expect(selectedIds(target)).toEqual([shape.id]);
    }

    const up = chipOf(target, hotWater, "dependents")!;
    const box = up.getBoundingClientRect();
    expect(
      up.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
    ).toBe(true);
  });

  it("reveal one level on a click, and are built again after every step", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    const hotWater = node(target, "Hot Water");
    explore.enter(hotWater.id);
    let pressReachedCanvas = false;
    target
      .get<Canvas>("canvas")
      .getContainer()
      .addEventListener("mousedown", () => {
        pressReachedCanvas = true;
      });
    const down = chipOf(target, hotWater, "dependencies")!;
    down.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(pressReachedCanvas).toBe(false);

    clickOn(down);

    expect(shownNames(target)).toEqual(["Hot Water", "Kettle", "Water"]);
    expect(document.activeElement).toBe(svgOf(target));
    expect(chipOf(target, hotWater, "dependencies")).toBeUndefined();
    expect(chipOf(target, hotWater, "dependents")).toBeDefined();
    const kettleDown = chipOf(target, node(target, "Kettle"), "dependencies")!;
    expect(kettleDown.getAttribute("aria-label")).toBe("Show 1 dependency of Kettle");
    expect(chipOf(target, node(target, "Water"), "dependencies")).toBeUndefined();

    clickOn(kettleDown, { keyboard: true });
    expect(shownNames(target)).toContain("Power");
    expect(document.activeElement).toBe(svgOf(target));

    clickOn(chipOf(target, hotWater, "dependents")!);
    expect(chipOf(target, node(target, "Cup of Tea"), "dependents")!.textContent).toBe("2");
    expect((await target.saveSVG()).svg).not.toContain("wardley-explore-chip");

    await target.importDSL(target.exportDSL());
    expect(chipOf(target, node(target, "Cup of Tea"), "dependents")).toBeDefined();

    explore.restart();
    expect(chips(target)).toEqual([]);
    explore.startFrom(node(target, "Kettle").id);
    expect(chips(target)).toHaveLength(2);
    explore.exit();
    expect(chips(target)).toEqual([]);
  });
});

describe("explore mode's start menu", () => {
  it("lists every component by name to start from, searchable, below its palette entry", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter();
    const entry = paletteEntry(target, "explore.start-from");

    clickOn(entry);

    const menu = document.querySelector<HTMLElement>(".djs-popup.wardley-explore-start")!;
    expect(menu).not.toBeNull();
    expect(target.get<PopupMenu>("popupMenu").isOpen()).toBe(true);
    expect(menu.querySelector(".djs-popup-title")?.textContent).toBe("Start from");
    expect(menu.querySelector(".djs-popup-search input")).not.toBeNull();
    const items = [...menu.querySelectorAll<HTMLElement>(".entry")];
    expect(
      items.map((item) => [
        item.querySelector(".djs-popup-label")?.textContent?.trim(),
        item.querySelector(".djs-popup-entry-description")?.textContent?.trim(),
      ]),
    ).toEqual([
      ["Business", "User"],
      ["Cup", "Component"],
      ["Cup of Tea", "Component"],
      ["Hot Water", "Component"],
      ["Kettle", "Component"],
      ["Power", "Component"],
      ["Public", "User"],
      ["Tea", "Component"],
      ["Water", "Component"],
    ]);
    expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      entry.getBoundingClientRect().bottom,
    );

    const kettle = items.find((item) => item.textContent?.includes("Kettle"))!;
    kettle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

    expect(target.get<PopupMenu>("popupMenu").isOpen()).toBe(false);
    expect(explore.phase()).toBe("exploring");
    expect(shownNames(target)).toEqual(["Kettle"]);
    expect(selectedIds(target)).toEqual([node(target, "Kettle").id]);
    expect(explore.canStepBack()).toBe(false);
    expect(document.activeElement).toBe(svgOf(target));

    clickOn(paletteEntry(target, "explore.start-from"));
    const water = [
      ...document.querySelectorAll<HTMLElement>(".djs-popup.wardley-explore-start .entry"),
    ].find((item) => item.querySelector(".djs-popup-label")?.textContent?.trim() === "Water")!;
    water.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    expect(shownNames(target)).toEqual(["Water"]);
    expect(explore.canStepBack()).toBe(true);
  });

  it("closes when explore mode ends", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter();
    clickOn(paletteEntry(target, "explore.start-from"));
    expect(target.get<PopupMenu>("popupMenu").isOpen()).toBe(true);
    explore.exit();
    expect(target.get<PopupMenu>("popupMenu").isOpen()).toBe(false);
  });
});

describe("explore mode on a cleared canvas", () => {
  it("ends without an event and gives the palette its modelling entries back", async () => {
    const target = await mount();
    const explore = exploreOf(target);
    explore.enter();
    clickOn(paletteEntry(target, "explore.start-from"));
    const events = recordEvents(target);

    target.clear();

    expect(explore.isActive()).toBe(false);
    expect(events).toEqual([]);
    expect(exploreTraces(target)).toEqual([]);
    expectQuietHint(target);
    expect(target.get<WardleyReadOnly>("wardleyReadOnly").isReadOnly()).toBe(false);
    expect(target.get<PopupMenu>("popupMenu").isOpen()).toBe(false);
    expect(paletteActions(target)).toHaveLength(15);
    expect(paletteEntry(target, "explore").getAttribute("aria-pressed")).toBe("false");
  });
});
