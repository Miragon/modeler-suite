/*
 * Layout stability and view navigation (UX audit P5a): what Add existing element adds is pinned,
 * selected and in sight; an undo or redo across views selects what it changed; the breadcrumb and
 * U keep the system context level and mark a draft; an empty scope frame says what to do; a drag's
 * previewed frames carry their captions and say in words why one warns; a keyboard create in a
 * crowded, zoomed view pans to a clear spot instead of landing on an element. On the interaction
 * fixture: its pinned landscape leaves `mail` out, its pinned `Containers` view frames `web`, `api`
 * and `database` in the `bookshop` boundary.
 */
import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element as DiagramElement } from "diagram-js/lib/model/Types";
import type { Box } from "@miragon/c4-schema-model";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import type { C4ElementFactory, C4SceneService } from "../../src/services.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  mountModeler,
  press,
  service,
  shapeOf,
  type Mounted,
} from "./support/interaction/mount.js";
import { pointerOn, pressEscape, type Point } from "./support/pointer.js";

afterEach(() => destroyMounted());

function scene(page: Mounted) {
  return service<C4SceneService>(page.modeler, "c4Scene").current();
}

function container(page: Mounted): HTMLElement {
  return service<Canvas>(page.modeler, "canvas").getContainer();
}

function selectedIds(page: Mounted): string[] {
  return service<Selection>(page.modeler, "selection")
    .get()
    .map((element) => element.id);
}

function layoutKeys(page: Mounted): string[] {
  return [...page.modeler.exportText().matchAll(/"c4modeler\.element\.([\w.]+)"/g)].map(
    (match) => match[1]!,
  );
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function overlap(first: Box, second: Box, gap = 0): boolean {
  return (
    first.x - gap < second.x + second.width &&
    second.x < first.x + first.width + gap &&
    first.y - gap < second.y + second.height &&
    second.y < first.y + first.height + gap
  );
}

function viewbox(page: Mounted): Box {
  const { x, y, width, height } = service<Canvas>(page.modeler, "canvas").viewbox();
  return { x, y, width, height };
}

/** Moves the visible area far from the content, so nothing is in sight. */
function lookElsewhere(page: Mounted): void {
  const canvas = service<Canvas>(page.modeler, "canvas");
  const { width, height } = canvas.viewbox();
  canvas.viewbox({ x: 5000, y: 5000, width, height });
}

function addExisting(page: Mounted, ...ids: string[]): void {
  service<C4Dialogs>(page.modeler, "c4Dialogs").showAddElement();
  const dialog = page.dialogs.current()!.element;
  for (const id of ids) dialog.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.click();
  dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
}

describe("Add existing element (P5a.1, P5a.2)", () => {
  it("starts on the search field", async () => {
    const page = await mountModeler();
    service<C4Dialogs>(page.modeler, "c4Dialogs").showAddElement();
    const search = page.dialogs.current()!.element.querySelector('[data-field="search"]');
    expect(document.activeElement).toBe(search);
  });

  it("pins what it adds in the same edit, so a relationship drawn later moves nothing", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    addExisting(page, "mail");
    expect(layoutKeys(page)).toContain("mail");
    const added = scene(page).boxes.get("mail")!;
    service<C4Modeling>(page.modeler, "modeling").createRelationship("api", "mail", {
      description: "Sends with",
    });
    expect(scene(page).boxes.get("mail")).toEqual(added);
    service<CommandStack>(page.modeler, "commandStack").undo();
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(BOOKSHOP);
  });

  it("selects what it added and scrolls it into sight", async () => {
    const page = await mountModeler();
    lookElsewhere(page);
    addExisting(page, "mail");
    expect(selectedIds(page)).toEqual(["mail"]);
    expect(inside(scene(page).boxes.get("mail")!, viewbox(page))).toBe(true);
    expect(document.activeElement).toBe(container(page).querySelector(":scope > svg"));
  });

  it("zooms out until all it added is in sight where that doesn't fit at the current zoom", async () => {
    const page = await mountModeler(`workspace {
    model {
        hub = softwareSystem "Hub"
        north = softwareSystem "North"
        south = softwareSystem "South"
        east = softwareSystem "East"
        west = softwareSystem "West"
        north -> hub "Uses"
        hub -> south "Uses"
        hub -> east "Uses"
        west -> hub "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include hub
            properties {
                "c4modeler.element.hub" "0,0"
            }
        }
    }
}
`);
    const canvas = service<Canvas>(page.modeler, "canvas");
    canvas.zoom(1.5);
    const added = ["north", "south", "east", "west"];
    addExisting(page, ...added);
    expect(selectedIds(page).sort()).toEqual([...added].sort());
    for (const id of added) expect(inside(scene(page).boxes.get(id)!, viewbox(page))).toBe(true);
    expect(canvas.zoom()).toBeLessThan(1.5);
  });

  it("places it beside its neighbour with room for their relationship's label between", async () => {
    const page = await mountModeler(`workspace {
    model {
        a = softwareSystem "A"
        b = softwareSystem "B"
        a -> b "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include a
            properties {
                "c4modeler.element.a" "0,0"
            }
        }
    }
}
`);
    addExisting(page, "b");
    const a = scene(page).boxes.get("a")!;
    const b = scene(page).boxes.get("b")!;
    const label = scene(page).relationships[0]!.labelBox;
    expect(b.y).toBe(a.y);
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(label.width + 2 * 16);
    expect(overlap(label, a) || overlap(label, b)).toBe(false);
  });
});

describe("an undo or redo across views selects what it changed (P5a.3)", () => {
  it("on the view it switched to, and in sight", async () => {
    const page = await mountModeler();
    const modeling = service<C4Modeling>(page.modeler, "modeling");
    const commands = service<CommandStack>(page.modeler, "commandStack");
    modeling.moveElements([shapeOf(page.modeler, "payments") as DiagramElement], { x: 0, y: 240 });
    lookElsewhere(page);
    page.modeler.views.open("Containers", { cause: "user" });
    commands.undo();
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(selectedIds(page)).toEqual(["payments"]);
    expect(inside(scene(page).boxes.get("payments")!, viewbox(page))).toBe(true);

    page.modeler.views.open("Containers", { cause: "user" });
    commands.redo();
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(selectedIds(page)).toEqual(["payments"]);
  });

  it("selects a relationship the undone change removed again, by its canvas id", async () => {
    const page = await mountModeler();
    const modeling = service<C4Modeling>(page.modeler, "modeling");
    const commands = service<CommandStack>(page.modeler, "commandStack");
    modeling.removeFromView([], ["bookshop->payments"]);
    page.modeler.views.open("Containers", { cause: "user" });
    commands.undo();
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(selectedIds(page)).toEqual(["rel:bookshop->payments"]);
  });

  it("leaves the selection alone on an undo in the view shown", async () => {
    const page = await mountModeler();
    const modeling = service<C4Modeling>(page.modeler, "modeling");
    modeling.moveElements([shapeOf(page.modeler, "payments") as DiagramElement], { x: 0, y: 240 });
    service<Selection>(page.modeler, "selection").select(shapeOf(page.modeler, "customer"));
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(selectedIds(page)).toEqual(["customer"]);
  });
});

/** The text of the breadcrumb's items, the note of a draft included. */
function crumbTexts(page: Mounted): string[] {
  const nav = container(page).querySelector<HTMLElement>("nav.c4-breadcrumbs")!;
  return [...nav.querySelectorAll("li")].map((item) =>
    [...item.childNodes]
      .filter((node) => !(node instanceof HTMLElement && node.hidden))
      .map((node) => node.textContent)
      .join(" | "),
  );
}

describe("the breadcrumb and U keep every level (P5a.4, P5a.5)", () => {
  it("goes up from a container view to its system's context view, not yet in the file", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(crumbTexts(page)).toEqual([
      "System landscape",
      " | Bookshop context",
      " | Bookshop containers",
    ]);
    service<Canvas>(page.modeler, "canvas").focus();
    press(container(page).querySelector(":scope > svg")!, "u");
    expect(page.modeler.views.active()).toMatchObject({
      key: "SystemContext-bookshop",
      state: "draft",
    });
  });

  it("marks the view shown while it is not in the file yet, and only that one", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(container(page).querySelector(".c4-breadcrumbs-note")).toBeNull();
    page.modeler.views.open("SystemContext-bookshop", { cause: "user" });
    expect(crumbTexts(page)).toEqual([
      "System landscape",
      " | Bookshop context | Not in the file yet",
    ]);
    const note = container(page).querySelector(".c4-breadcrumbs-note")!;
    expect(note.previousElementSibling?.getAttribute("aria-current")).toBe("page");
  });

  it("drops the note before it cuts a name", async () => {
    const page = await mountModeler();
    page.modeler.views.open("SystemContext-bookshop", { cause: "user" });
    const nav = container(page).querySelector<HTMLElement>("nav.c4-breadcrumbs")!;
    const note = container(page).querySelector<HTMLElement>(".c4-breadcrumbs-note")!;
    const whole = nav.getBoundingClientRect().width;
    page.host.style.width = `${Math.floor(whole - note.getBoundingClientRect().width / 2 + 24)}px`;
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));
    expect(note.hidden).toBe(true);
    for (const name of nav.querySelectorAll<HTMLElement>(".c4-breadcrumbs-name")) {
      expect(name.style.maxWidth).toBe("");
    }
  });
});

describe("an empty scope frame says what to do (P5a.5)", () => {
  function hint(page: Mounted): HTMLElement | null {
    return container(page).querySelector<HTMLElement>(".c4-empty-scope-hint");
  }

  it("inside the frame of a container view of a system without containers", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    expect(hint(page)?.textContent).toBe("No containers yetAdd one from the palette.");
    expect(getComputedStyle(hint(page)!).pointerEvents).toBe("none");
    const box = hint(page)!.getBoundingClientRect();
    const drawn = container(page)
      .querySelector('[data-element-id="boundary:payments"]')!
      .getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(drawn.left - 1);
    expect(box.right).toBeLessThanOrEqual(drawn.right + 1);
    expect(box.top).toBeGreaterThanOrEqual(drawn.top - 1);
    expect(box.bottom).toBeLessThan(drawn.bottom);
  });

  it("lets the pointer through to the canvas, so a palette create drops into the frame", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    const box = hint(page)!.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    expect(hit?.closest(".djs-overlays")).toBeNull();
    expect(container(page).querySelector(":scope > svg")!.contains(hit)).toBe(true);
  });

  it("stays out of the export", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    expect(hint(page)).not.toBeNull();
    const { svg } = (page.modeler.diagram as unknown as { saveSVG(): { svg: string } }).saveSVG();
    expect(svg).not.toContain("No containers");
    expect(svg).not.toContain("palette");
  });

  it("goes once the scope holds something, and shows nowhere else", async () => {
    const page = await mountModeler();
    expect(hint(page)).toBeNull();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(hint(page)).toBeNull();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    const frame = shapeOf(page.modeler, "boundary:payments") as unknown as Box;
    const preview = service<C4ElementFactory>(page.modeler, "c4ElementFactory").createNew(
      "container",
    );
    service<C4Modeling>(page.modeler, "modeling").createShape(preview, {
      x: frame.x + frame.width / 2,
      y: frame.y + frame.height / 2,
    });
    expect(hint(page)).toBeNull();
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(hint(page)?.textContent).toContain("No containers yet");
  });

  it("names components in a component view, and hides while read-only", async () => {
    const page = await mountModeler(
      BOOKSHOP.replace(/ {16}orders = [^\n]*\n {16}catalogue = [^\n]*\n/, ""),
    );
    page.modeler.views.open("Components-api", { cause: "user" });
    expect(hint(page)?.textContent).toContain("No components yet");
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    expect(hint(page)).toBeNull();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(false);
    expect(hint(page)?.textContent).toContain("No components yet");
  });

  it("hides while a palette create is dragged across it", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    const frame = shapeOf(page.modeler, "boundary:payments") as unknown as Box;
    const pointer = pointerOn(page.modeler.diagram);
    pointer.clickPalette("create.container");
    pointer.hover({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
    expect(getComputedStyle(hint(page)!).visibility).toBe("hidden");
    pressEscape();
    expect(getComputedStyle(hint(page)!).visibility).toBe("visible");
  });
});

describe("a drag's previewed frames say which frame they are and why one warns", () => {
  function centreOf(page: Mounted, id: string): Point {
    const shape = shapeOf(page.modeler, id) as unknown as Box;
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }

  function hold(page: Mounted, id: string, to: Point): void {
    const pointer = pointerOn(page.modeler.diagram);
    const start = centreOf(page, id);
    pointer.press(container(page).querySelector(`[data-element-id="${id}"]`)!, start);
    pointer.moveTo({ x: (start.x + to.x) / 2, y: (start.y + to.y) / 2 });
    pointer.hover(to);
  }

  function previewItem(page: Mounted, boundary: string): Element | null {
    return (
      container(page).querySelector(`.c4-frame-preview[data-boundary="${boundary}"]`)
        ?.parentElement ?? null
    );
  }

  it("carries the boundary's caption where the frame will be", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    const database = centreOf(page, "database");
    hold(page, "database", { x: database.x + 400, y: database.y });
    const item = previewItem(page, "bookshop")!;
    const captions = [...item.querySelectorAll(".c4-frame-preview-caption")].map(
      (text) => text.textContent,
    );
    expect(captions).toEqual(["Bookshop", "[Software System]"]);
    expect(item.querySelector(".c4-frame-preview-chip")).toBeNull();
    pressEscape();
  });

  it("names what a warning frame runs over, with an icon, not by its colour alone", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    hold(page, "database", { x: 180, y: 420 });
    const item = previewItem(page, "bookshop")!;
    const chip = item.querySelector(".c4-frame-preview-chip")!;
    expect(chip.textContent).toBe("Overlaps Customer");
    expect(chip.querySelectorAll(".c4-frame-preview-chip-icon path")).toHaveLength(3);
    const frame = item.querySelector<SVGPathElement>(".c4-frame-preview")!.getBBox();
    const ground = chip.querySelector<SVGRectElement>(".c4-frame-preview-chip-ground")!.getBBox();
    expect(ground.y + ground.height).toBeLessThanOrEqual(frame.y);
    pressEscape();
    expect(container(page).querySelector(".c4-frame-preview-chip")).toBeNull();
  });
});

describe("a keyboard create in a crowded, zoomed view (P2.6 follow-up)", () => {
  it("pans to the nearest clear spot rather than land on an element", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    const canvas = service<Canvas>(page.modeler, "canvas");
    const api = scene(page).boxes.get("api")!;
    canvas.zoom(4, { x: api.x + api.width / 2, y: api.y + api.height / 2 });
    const before = new Set(page.modeler.elements.list().map(({ id }) => id));
    container(page)
      .querySelector('.djs-palette [data-action="create.container"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    const editor = container(page).querySelector(".diagram-label-editor");
    if (editor) press(editor, "Escape");
    const created = page.modeler.elements.list().find(({ id }) => !before.has(id))!;
    const box = scene(page).boxes.get(created.id)!;
    for (const element of scene(page).elements) {
      if (element.id !== created.id) expect(overlap(box, element.box), element.id).toBe(false);
    }
    expect(overlap(box, viewbox(page))).toBe(true);
  });
});
