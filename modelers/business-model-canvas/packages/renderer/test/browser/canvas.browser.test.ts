import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Shape } from "diagram-js/lib/model/Types";
import {
  BLOCK_HEADING_HEIGHT,
  BLOCK_PADDING,
  TAPE_COLORS,
  colorName,
  findSticky,
  layoutCanvas,
  type BlockId,
  type CanvasDocument,
  type Sticky,
} from "@miragon/business-model-canvas-schema-model";
import { parse } from "yaml";
import { parseText, serializeText } from "@miragon/business-model-canvas-dsl";
import {
  createCollaborativeModeler,
  openCanvasTitleDialog,
  renderLegend,
  type CanvasModeling,
  type CollaborativeDiagram,
  type ChromeDialogOptions,
  type StickyFactory,
  type StickyShape,
} from "../../src/index.js";
import type HostLauncher from "../../src/context-pad/HostLauncher.js";
import { canvasModelActions } from "../../src/menu/modelActions.js";
import type { NotesScope } from "../../src/notes-panel/notesScope.js";
import orders from "./fixtures/orders.bmc?raw";

let modeler: CollaborativeDiagram;
let host: HTMLElement;

beforeEach(async () => {
  modeler = createCollaborativeModeler();
  host = attachedHost();
  modeler.attachTo(host);
  await modeler.importText(orders);
});

afterEach(() => {
  modeler.destroy();
  host.parentElement?.remove();
});

const service = <T>(name: string): T => modeler.diagram.get<T>(name);
const sticky = (id: string) => service<ElementRegistry>("elementRegistry").get(id) as StickyShape;
const blockRect = (blockId: string) =>
  layoutCanvas(parseText(modeler.exportText()).document).blocks.find(
    (block) => block.blockId === blockId,
  )!.rect;

/** The ids of each block's stickies, in order. */
const placed = (): Partial<Record<BlockId, string[]>> =>
  Object.fromEntries(
    parseText(modeler.exportText()).document.blocks.map((block) => [
      block.blockId,
      block.items.map((item) => item.id),
    ]),
  );
const stickyIn = (id: string): Sticky | undefined =>
  findSticky(parseText(modeler.exportText()).document, id)?.sticky;
const [SKY, PEACH] = TAPE_COLORS.map(colorName) as [string, string];

/** A canvas of blocks, a sticky an id (its text the id capitalised) or a sticky's fields. */
function canvasText(blocks: Partial<Record<BlockId, (string | Partial<Sticky>)[]>>): string {
  const sticky = (entry: string | Partial<Sticky>): Sticky => {
    const fields = typeof entry === "string" ? { id: entry } : entry;
    const id = fields.id!;
    return { text: id[0]!.toUpperCase() + id.slice(1), attributes: [], notes: [], ...fields, id };
  };
  const document: CanvasDocument = {
    header: [],
    notes: [],
    extras: [],
    blocks: Object.entries(blocks).map(([blockId, items]) => ({
      blockId: blockId as BlockId,
      items: items!.map(sticky),
      notes: [],
      attributes: [],
    })),
  };
  return serializeText(document);
}

function moveCentreTo(id: string, point: { x: number; y: number }): void {
  const shape = sticky(id);
  const delta = {
    x: point.x - (shape.x + shape.width / 2),
    y: point.y - (shape.y + shape.height / 2),
  };
  service<Modeling>("modeling").moveElements([shape], delta);
}

describe("dropping a sticky", () => {
  it("lands in the block under its centre, at the slot there, as one undo step", () => {
    const partners = blockRect("key-partners");
    moveCentreTo("pay", { x: partners.x + 40, y: partners.y + 100 });
    expect(placed()).toEqual({
      "customer-segments": ["shoppers"],
      "value-propositions": ["order", "ship"],
      "key-partners": ["pay"],
    });
    expect(sticky("pay")).toMatchObject({
      x: partners.x + BLOCK_PADDING,
      y: partners.y + BLOCK_HEADING_HEIGHT,
    });
    expect(sticky("ship").y).toBe(sticky("order").y);
    service<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(orders);
    expect(sticky("ship").y).toBeGreaterThan(sticky("order").y);
  });

  it("takes the slot before the sticky whose left half it covers", () => {
    const order = sticky("order");
    moveCentreTo("ship", { x: order.x + 10, y: order.y + 10 });
    expect(placed()["value-propositions"]).toEqual(["ship", "order", "pay"]);
  });

  it("forward in its own block takes the slot before the sticky whose left half it covers", () => {
    const ship = sticky("ship");
    moveCentreTo("order", { x: ship.x + 10, y: ship.y + 10 });
    expect(placed()["value-propositions"]).toEqual(["pay", "order", "ship"]);
  });

  it("nudged a little stays where it is", () => {
    const order = sticky("order");
    moveCentreTo("order", { x: order.x + order.width / 2 + 10, y: order.y + order.height / 2 });
    expect(modeler.exportText()).toBe(orders);
  });

  it("outside the canvas lands in the nearest block", () => {
    moveCentreTo("pay", { x: 99_999, y: 99_999 });
    expect(placed()["revenue-streams"]).toEqual(["pay"]);
  });

  it("a new sticky has no colour", () => {
    const segments = blockRect("customer-segments");
    const created = service<StickyFactory>("stickyFactory").createNew("Retailers");
    const root = service<Canvas>("canvas").getRootElement() as Shape;
    service<Modeling>("modeling").createShape(
      created,
      { x: segments.x + 60, y: segments.y + 200 },
      root,
    );
    expect(stickyIn(created.id)).toMatchObject({ text: "Retailers" });
    expect(stickyIn(created.id)!.color).toBeUndefined();
  });

  it("a deleted sticky leaves the document, its block stays", () => {
    service<Modeling>("modeling").removeElements([sticky("shoppers")]);
    expect(placed()["customer-segments"]).toEqual([]);
  });
});

describe("the keyboard", () => {
  const altArrow = (key: string) => {
    service<Selection>("selection").select(sticky("pay"));
    const svg = service<Canvas>("canvas").getContainer().querySelector("svg")!;
    svg.focus();
    svg.dispatchEvent(
      new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }),
    );
  };

  it("moves a sticky up within its block with Alt+↑", () => {
    altArrow("ArrowUp");
    expect(placed()["value-propositions"]).toEqual(["pay", "order", "ship"]);
  });

  it("moves a sticky to the end of the block beside it with Alt+→", () => {
    altArrow("ArrowRight");
    expect(placed()["customer-relationships"]).toEqual(["pay"]);
  });

  it("follows the blocks as the canvas shows them, not their order in the file", async () => {
    await modeler.importText(canvasText({ "key-activities": ["build"], channels: ["fair"] }));
    service<CanvasModeling>("canvasModeling").moveByKey("build", "right");
    expect(placed()["value-propositions"]).toEqual(["build"]);
    service<CanvasModeling>("canvasModeling").moveByKey("fair", "left");
    expect(placed()["value-propositions"]).toEqual(["build", "fair"]);
  });

  it("moves into the block below at the edge of a stacked block with Alt+↓", async () => {
    await modeler.importText(
      canvasText({ "key-activities": ["build"], "key-resources": ["code"] }),
    );
    service<CanvasModeling>("canvasModeling").moveByKey("build", "down");
    expect(placed()["key-resources"]).toEqual(["build", "code"]);
  });

  it("moves nothing on a locked canvas", () => {
    service<{ setReadOnly(readOnly: boolean): void }>("readOnly").setReadOnly(true);
    altArrow("ArrowUp");
    expect(modeler.exportText()).toBe(orders);
  });
});

/** Dialogs opened into the test's host, with the body of the last one. */
function chrome() {
  const opened: { body?: HTMLElement } = {};
  return {
    opened,
    container: host,
    openDialog(options: ChromeDialogOptions) {
      const body = document.createElement("div");
      host.append(body);
      options.render(body);
      opened.body = body;
      return { isOpen: () => body.isConnected, close: () => body.remove() };
    },
  };
}

describe("the title dialog", () => {
  it("Canvas title writes the title in one undo step", () => {
    const dialogChrome = chrome();
    openCanvasTitleDialog(dialogChrome, service<CanvasModeling>("canvasModeling"));
    const inputs = dialogChrome.opened.body!.querySelectorAll("input");
    expect(inputs).toHaveLength(1);
    inputs[0]!.value = "Webshop";
    dialogChrome.opened.body!.querySelector("form")!.requestSubmit();
    expect(parse(modeler.exportText()).canvas).toEqual({ title: "Webshop" });
    service<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(orders);
  });
});

describe("an open title dialog", () => {
  it("closes when a text comes in from outside, so its Apply cannot put back older values", async () => {
    const dialogChrome = chrome();
    const { opened } = dialogChrome;
    const actions = canvasModelActions(modeler.diagram, () => dialogChrome);
    actions.showCanvasTitle();
    expect(opened.body!.isConnected).toBe(true);
    await modeler.importText(orders.replace("title: Orders", "title: Orders 2"));
    expect(opened.body!.isConnected).toBe(false);
  });
});

describe("colours", () => {
  it("show as one tape across a sticky's top edge, on white paper as every sticky's", () => {
    const graphics = (id: string) => service<ElementRegistry>("elementRegistry").getGraphics(id);
    const fill = (id: string) =>
      graphics(id).querySelector<SVGPathElement>(".djs-visual > path")!.style.fill;
    const tapes = (id: string) =>
      [...graphics(id).querySelectorAll<SVGRectElement>(".bmc-tape")].map(
        (tape) => tape.style.fill,
      );
    expect(fill("order")).toBe(fill("pay"));
    expect(tapes("order")).toHaveLength(1);
    expect(tapes("order")).toEqual(tapes("shoppers"));
    expect(tapes("pay")).toEqual([]);
  });

  it("the legend explains the folded corner and names no colour", () => {
    const body = document.createElement("div");
    renderLegend(body);
    expect(
      [...body.querySelectorAll(".cd-shell-legend-row")].map((row) => row.textContent),
    ).toEqual(["Has notes"]);
  });
});

describe("the context pad", () => {
  type Entries = Record<string, { action: { click: (event: Event) => void } }>;
  const entriesOf = (id: string): Entries =>
    (
      service<{ getEntries(target: unknown): Entries }>("contextPad") as unknown as {
        _getProviders(): Array<{ getContextPadEntries?(element: unknown): Entries }>;
      }
    )
      ._getProviders()
      .reduce<Entries>(
        (all, provider) => ({ ...all, ...(provider.getContextPadEntries?.(sticky(id)) ?? {}) }),
        {},
      );

  it("offers add, edit, colour and delete on a sticky, and nothing under the lock", () => {
    expect(Object.keys(entriesOf("pay"))).toEqual([
      "append.sticky",
      "edit-text",
      "color",
      "delete",
    ]);
    service<{ setReadOnly(readOnly: boolean): void }>("readOnly").setReadOnly(true);
    expect(entriesOf("pay")).toEqual({});
  });

  it("opens the notes of a sticky once a host shows notes, with a new note when it has none", () => {
    const opened: Array<[NotesScope, boolean]> = [];
    service<HostLauncher>("hostLauncher").registerNotes((scope, addNote) =>
      opened.push([scope, addNote]),
    );
    expect(Object.keys(entriesOf("pay"))).toEqual([
      "append.sticky",
      "edit-text",
      "color",
      "notes",
      "delete",
    ]);
    entriesOf("pay")["notes"]!.action.click(new MouseEvent("click"));
    expect(opened).toEqual([[{ kind: "sticky", id: "pay" }, true]]);
  });

  it("adds a sticky after the last one of a full row in its own block, not the one below", async () => {
    await modeler.importText(
      canvasText({ "key-activities": ["build", "run"], "key-resources": ["code"] }),
    );
    entriesOf("run")["append.sticky"]!.action.click(new MouseEvent("click"));
    expect(placed()["key-activities"]).toEqual(["build", "run", expect.any(String)]);
    expect(placed()["key-resources"]).toEqual(["code"]);
  });

  it("adds a sticky right after this one, in the same block, as one undo step", () => {
    entriesOf("order")["append.sticky"]!.action.click(new MouseEvent("click"));
    expect(placed()["value-propositions"]).toEqual(["order", expect.any(String), "pay", "ship"]);
    service<CommandStack>("commandStack").undo();
    expect(modeler.exportText()).toBe(orders);
  });

  it("gives a sticky a tape colour and takes it away through the colour popup", () => {
    type PopupEntries = Record<string, { action(): void; className?: string }>;
    const popupMenu = service<object>("popupMenu") as {
      _getProviders(providerId: string): unknown[];
      _getEntries(target: unknown, providers: unknown[]): PopupEntries;
    };
    const popup = () => popupMenu._getEntries(sticky("pay"), popupMenu._getProviders("bmc-color"));
    expect(Object.keys(popup())).toEqual(TAPE_COLORS.map((color) => `color-${colorName(color)}`));
    popup()[`color-${PEACH}`]!.action();
    expect(stickyIn("pay")!.color).toBe(PEACH);
    expect(popup()[`color-${PEACH}`]!.className).toBe("bmc-popup-active");
    popup()["color-none"]!.action();
    expect(modeler.exportText()).toBe(orders);
    expect(stickyIn("order")!.color).toBe(SKY);
  });
});

describe("a sticky's full text", () => {
  it("is no native tooltip on the live canvas, and the exported picture names it", () => {
    expect(document.querySelectorAll(".djs-element title")).toHaveLength(0);
    const svg = new DOMParser().parseFromString(modeler.diagram.saveSVG().svg, "image/svg+xml");
    const titles = [...svg.querySelectorAll("title")].map((title) => title.textContent);
    expect(titles).toEqual(expect.arrayContaining(["Place order", "Pay", "Ship"]));
    expect(svg.querySelector("[data-bmc-description]")).toBeNull();
  });

  it("leaves out the control characters XML forbids, so the picture stays readable", async () => {
    await modeler.importText(orders.replace("text: Pay\n", 'text: "Pa\\u0001y"\n'));
    const svg = new DOMParser().parseFromString(modeler.diagram.saveSVG().svg, "image/svg+xml");
    expect(svg.querySelector("parsererror")).toBeNull();
    expect([...svg.querySelectorAll("title")].map((title) => title.textContent)).toContain("Pay");
  });
});
