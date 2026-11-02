/*
 * The relationships a level down can't draw (SPEC 4.1): Structurizr implies a relationship upward,
 * never downward, so one written on a system itself vanishes from its container view. The chip
 * after the breadcrumb says so, its dialog moves the relationship's end to a container as one
 * command, the inspector offers the same where such a relationship is drawn, and the first one
 * drawn there brings a notice once. On the interaction fixture: `bookshop -> payments` and
 * `bookshop -> mail` hang on the system, so its pinned `Containers` view shows neither.
 */
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, ElementLike } from "diagram-js/lib/model/Types";
import type { Box } from "@miragon/c4-schema-model";
import { createCollaborativeModeler } from "../../src/collaborative/index.js";
import {
  mountInspector,
  type InspectorHandle,
  type InspectorSlot,
} from "../../src/inspector/index.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type C4Dialogs from "../../src/navigation/C4Dialogs.js";
import { connectDialogs } from "../../src/navigation/C4Dialogs.js";
import type ReadOnly from "../../src/read-only/ReadOnly.js";
import {
  EDIT_NOTICE_EVENT,
  type C4SceneService,
  type EditNoticeEvent,
} from "../../src/services.js";
import { BOOKSHOP } from "./support/interaction/fixtures.js";
import {
  destroyMounted,
  dialogStandIn,
  mountModeler,
  select,
  service,
  shapeOf,
  type Mounted,
} from "./support/interaction/mount.js";

const handles: InspectorHandle[] = [];
const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  for (const aside of document.querySelectorAll("[data-inspector-host]")) aside.remove();
  destroyMounted();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function container(page: Mounted): HTMLElement {
  return service<Canvas>(page.modeler, "canvas").getContainer();
}

function chip(page: Mounted): HTMLButtonElement {
  const found = container(page).querySelector<HTMLButtonElement>(".c4-hidden-relationships");
  if (!found) throw new Error("the modeler has no chip");
  return found;
}

/** The chip's words while it shows, else undefined. */
function chipText(page: Mounted): string | undefined {
  const element = chip(page);
  return element.hidden ? undefined : (element.getAttribute("aria-label") ?? undefined);
}

function breadcrumb(page: Mounted): HTMLElement {
  return container(page).querySelector<HTMLElement>("nav.c4-breadcrumbs")!;
}

function selectedIds(page: Mounted): string[] {
  return service<Selection>(page.modeler, "selection")
    .get()
    .map((element) => element.id)
    .sort();
}

function undoSteps(page: Mounted): number {
  return (service<CommandStack>(page.modeler, "commandStack") as unknown as { _stack: unknown[] })
    ._stack.length;
}

function boxes(page: Mounted): ReadonlyMap<string, Box> {
  return service<C4SceneService>(page.modeler, "c4Scene").current().boxes;
}

function overlap(first: Box, second: Box): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

/** The box around a shape or a connection's waypoints. */
function boundsOf(shape: ElementLike): Box {
  if ("waypoints" in shape && Array.isArray(shape.waypoints)) {
    const xs = shape.waypoints.map((point: { x: number }) => point.x);
    const ys = shape.waypoints.map((point: { y: number }) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
}

function within(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function dialogOf(page: Mounted): HTMLDialogElement {
  const record = page.dialogs.current();
  if (!record) throw new Error("no dialog is open");
  return record.element;
}

function rows(page: Mounted): HTMLFieldSetElement[] {
  return [...dialogOf(page).querySelectorAll<HTMLFieldSetElement>("fieldset.c4-move-row")];
}

function assignIn(row: HTMLFieldSetElement, childId: string): void {
  const choice = row.querySelector<HTMLSelectElement>("select")!;
  choice.value = childId;
  choice.dispatchEvent(new Event("change", { bubbles: true }));
  [...row.querySelectorAll("button")].find((button) => button.textContent === "Assign")!.click();
}

/** The block of one view in the text, up to its closing brace. */
function viewBlock(text: string, key: string): string {
  const start = text.indexOf(`"${key}"`);
  return text.slice(start, text.indexOf("\n        }\n", start));
}

function svgOf(page: Mounted): string {
  return (page.modeler.diagram as unknown as { saveSVG(): { svg: string } }).saveSVG().svg;
}

describe("the chip of the relationships a container view can't draw", () => {
  it("counts the system's own relationships in its container view, and none in the landscape", async () => {
    const page = await mountModeler();
    expect(chipText(page)).toBeUndefined();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(chipText(page)).toBe("2 relationships of Bookshop aren't shown here");
    expect(chip(page).querySelector(".c4-hidden-relationships-text")?.textContent).toBe(
      "2 relationships of Bookshop aren't shown here",
    );
    expect(chip(page).querySelector("svg.c4-hidden-relationships-icon")).not.toBeNull();
    page.modeler.views.open("Landscape", { cause: "user" });
    expect(chipText(page)).toBeUndefined();
  });

  it("names the container in a component view, and says 1 in the singular", async () => {
    const page = await mountModeler(
      BOOKSHOP.replace('        web -> api "Calls" "JSON/HTTPS"\n', ""),
    );
    page.modeler.views.open("Components-api", { cause: "user" });
    expect(chipText(page)).toBe("1 relationship of API isn't shown here");
  });

  it("follows every change and its undo", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    service<C4Modeling>(page.modeler, "modeling").deleteFromModel([], ["bookshop->mail"]);
    expect(chipText(page)).toBe("1 relationship of Bookshop isn't shown here");
    service<C4Modeling>(page.modeler, "modeling").createRelationship("web", "payments", {
      description: "Charges cards",
    });
    expect(chipText(page)).toBeUndefined();
    service<CommandStack>(page.modeler, "commandStack").undo();
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(chipText(page)).toBe("2 relationships of Bookshop aren't shown here");
  });

  it("stands after the breadcrumb on its line, Tab reaches it next, and Enter opens the dialog", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    const nav = breadcrumb(page).getBoundingClientRect();
    const box = chip(page).getBoundingClientRect();
    expect(box.left - nav.right).toBeGreaterThanOrEqual(8);
    expect(box.left - nav.right).toBeLessThan(9);
    expect(box.top).toBe(nav.top);
    expect(box.height).toBe(24);
    expect(breadcrumb(page).nextElementSibling).toBe(chip(page));
    expect(Number(getComputedStyle(chip(page)).zIndex)).toBeLessThan(100);

    const last = [...breadcrumb(page).querySelectorAll("button")].at(-1)!;
    last.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(chip(page));
    await userEvent.keyboard("{Enter}");
    expect(page.dialogs.current()?.options.title).toBe("Move to a container");
    expect(document.activeElement).toBe(rows(page)[0]!.querySelector("select"));
  });

  it("stays out of the export", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    expect(chipText(page)).toBeDefined();
    expect(svgOf(page)).not.toContain("shown here");
    expect(svgOf(page)).not.toContain("c4-hidden-relationships");
  });

  it("hides while read-only and without a dialog to open", async () => {
    const page = await mountModeler(BOOKSHOP, { connectDialogs: false });
    page.modeler.views.open("Containers", { cause: "user" });
    expect(chipText(page)).toBeUndefined();
    connectDialogs(page.modeler, page.dialogs.chrome);
    expect(chipText(page)).toBe("2 relationships of Bookshop aren't shown here");
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(true);
    expect(chipText(page)).toBeUndefined();
    service<ReadOnly>(page.modeler, "readOnly").setReadOnly(false);
    expect(chipText(page)).toBeDefined();
  });

  it("hides in the view of a system with no container to assign to, and shows with one", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    expect(page.modeler.views.active().key).toBe("Containers-payments");
    expect(chipText(page)).toBeUndefined();
    await page.modeler.importText(
      BOOKSHOP.replace(
        '"Takes the payments."\n',
        '"Takes the payments." {\n            gateway = container "Gateway"\n        }\n',
      ),
    );
    page.modeler.views.open("Containers-payments", { cause: "user" });
    expect(chipText(page)).toBe("1 relationship of Payment Provider isn't shown here");
  });

  it("goes compact before the path is cut, keeping its words in its name and tooltip", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    page.host.parentElement!.style.width = "560px";
    await expect.poll(() => chip(page).hasAttribute("data-compact")).toBe(true);
    expect(chip(page).hasAttribute("data-covered")).toBe(false);
    expect(chip(page).title).toBe("2 relationships of Bookshop aren't shown here");
    expect(chip(page).innerText.trim()).toBe("2");
    const host = page.host.getBoundingClientRect();
    expect(chip(page).getBoundingClientRect().right).toBeLessThanOrEqual(host.right - 12);
    expect(chip(page).getBoundingClientRect().left).toBeGreaterThanOrEqual(
      breadcrumb(page).getBoundingClientRect().right + 8,
    );
    page.host.parentElement!.style.width = "800px";
    await expect.poll(() => chip(page).hasAttribute("data-compact")).toBe(false);
  });

  it("ends before an island of the shell beside it, as the breadcrumb does", async () => {
    const root = document.createElement("div");
    root.className = "cd-shell";
    root.style.cssText = "position:absolute;left:0;top:0;width:900px;height:600px;overflow:hidden";
    const slot = document.createElement("div");
    slot.style.cssText = "position:absolute;inset:0";
    const island = document.createElement("div");
    island.setAttribute("data-chrome", "inspector");
    island.style.cssText = "position:absolute;top:64px;right:12px;width:288px;height:300px";
    root.append(slot, island);
    document.body.append(root);
    wrappers.push(root);
    const modeler = createCollaborativeModeler();
    modeler.attachTo(slot);
    connectDialogs(modeler, dialogStandIn(slot).chrome);
    await modeler.importText(BOOKSHOP);
    modeler.views.open("Containers", { cause: "user" });
    const element = modeler.diagram.container.querySelector<HTMLElement>(
      ".c4-hidden-relationships",
    )!;
    try {
      await expect
        .poll(() => element.getBoundingClientRect().right)
        .toBeLessThanOrEqual(island.getBoundingClientRect().left - 8);
      expect(element.hasAttribute("data-covered")).toBe(false);
    } finally {
      modeler.destroy();
    }
  });
});

describe("its dialog and Assign", () => {
  it("explains why and lists each relationship with the system's containers to choose from", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers", { cause: "user" });
    chip(page).click();
    const dialog = dialogOf(page);
    expect(dialog.querySelector(".c4-dialog-text")?.textContent).toBe(
      "These relationships connect to Bookshop itself, so this view can't tell which container makes or takes the call. Assign each one to a container to show it here.",
    );
    expect(rows(page).map((row) => row.querySelector("legend")?.textContent)).toEqual([
      "Bookshop → Payment Provider",
      "Bookshop → E-mail System",
    ]);
    expect(rows(page).map((row) => row.querySelector(".c4-move-details")?.textContent)).toEqual([
      "Charges cards",
      "Sends confirmations",
    ]);
    const first = rows(page)[0]!;
    expect(first.querySelector(".c4-field-label")?.textContent).toBe("Container of Bookshop");
    expect([...first.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "Web App",
      "API",
      "Database",
    ]);
  });

  it("moves the end in one undo step, places and pins the other end, selects the relationship and reveals both", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.views.open("Containers", { cause: "user" });
    const canvas = service<Canvas>(page.modeler, "canvas");
    canvas.zoom(2, { x: 0, y: 0 });
    const before = page.modeler.exportText();
    const steps = undoSteps(page);
    chip(page).click();
    assignIn(rows(page)[0]!, "api");

    expect(page.dialogs.current()).toBeUndefined();
    const after = page.modeler.exportText();
    expect(after).toContain('        api -> payments "Charges cards"\n');
    expect(after).not.toContain("bookshop -> payments");
    expect(undoSteps(page)).toBe(steps + 1);
    const placed = boxes(page).get("payments");
    expect(placed).toBeDefined();
    for (const [id, other] of boxes(page)) {
      if (id !== "payments") expect(overlap(placed!, other), id).toBe(false);
    }
    expect(viewBlock(after, "Containers")).toContain(
      `"c4modeler.element.payments" "${placed!.x},${placed!.y}"`,
    );
    expect(selectedIds(page)).toEqual(["rel:api->payments"]);
    expect(panel.textContent).toContain("API → Payment Provider");
    expect(panel.textContent).not.toContain("2 items selected");
    const viewbox = canvas.viewbox();
    for (const shown of [placed!, boundsOf(shapeOf(page.modeler, "rel:api->payments"))]) {
      expect(within(shown, viewbox), JSON.stringify(shown)).toBe(true);
    }
    expect(chipText(page)).toBe("1 relationship of Bookshop isn't shown here");
    expect(document.activeElement).toBe(container(page).querySelector(":scope > svg"));

    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(before);
    expect(chipText(page)).toBe("2 relationships of Bookshop aren't shown here");
  });

  it("says where to add a container when the system has none, without naming the view it is in", async () => {
    const page = await mountModeler();
    page.modeler.views.open("Containers-payments", { cause: "user" });
    service<C4Dialogs>(page.modeler, "c4Dialogs").showHiddenRelationships();
    expect(rows(page)[0]!.querySelector(".c4-field-note")?.textContent).toBe(
      "Payment Provider has no containers yet. Add one from the palette first.",
    );
  });

  it("keeps a refused Assign at its row, with the reason, and changes nothing", async () => {
    const page = await mountModeler(
      BOOKSHOP.replace(
        '        bookshop -> payments "Charges cards"\n',
        '        bookshop -> payments "Charges cards"\n        web -> payments "Charges cards"\n',
      ),
    );
    select(page.modeler, "rel:bookshop->payments");
    service<C4Dialogs>(page.modeler, "c4Dialogs").showMoveRelationship("bookshop->payments");
    const before = page.modeler.exportText();
    const row = rows(page)[0]!;
    assignIn(row, "web");
    expect(page.modeler.exportText()).toBe(before);
    expect(page.dialogs.current()).toBeDefined();
    const error = row.querySelector('[role="alert"]');
    expect(error?.textContent).not.toBe("");
    expect(row.querySelector("select")?.getAttribute("aria-invalid")).toBe("true");
  });
});

/** The shell's inspector slot as far as the content relies on it: an `<aside>` it opens and closes. */
function panelFor(page: Mounted): HTMLElement {
  const element = document.createElement("aside");
  element.dataset.inspectorHost = "";
  element.hidden = true;
  document.body.append(element);
  const slot: InspectorSlot = {
    element,
    isOpen: () => !element.hidden,
    open: () => {
      element.hidden = false;
    },
    close: () => {
      element.hidden = true;
    },
  };
  handles.push(mountInspector(slot, page.modeler));
  return element;
}

function buttonIn(panel: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...panel.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("Move to a container… where the relationship is drawn", () => {
  it("offers it in the landscape for a relationship on a system with containers", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    select(page.modeler, "rel:bookshop->payments");
    const entry = buttonIn(panel, "Move to a container…");
    expect(entry).toBeDefined();
    expect(entry!.getAttribute("aria-haspopup")).toBe("dialog");
    entry!.click();
    expect(page.dialogs.current()?.options.title).toBe("Move to a container");
    expect(dialogOf(page).querySelector(".c4-dialog-text")?.textContent).toBe(
      "This relationship connects to Bookshop itself, so Bookshop's container view can't tell which container makes or takes the call and leaves it out. Assign it to a container to show it there.",
    );
    expect(rows(page)).toHaveLength(1);
  });

  it("moves it, and the landscape then selects the implied line it draws in its place", async () => {
    const page = await mountModeler();
    panelFor(page);
    const before = page.modeler.exportText();
    select(page.modeler, "rel:bookshop->payments");
    service<C4Dialogs>(page.modeler, "c4Dialogs").showMoveRelationship("bookshop->payments");
    assignIn(rows(page)[0]!, "web");
    expect(page.modeler.exportText()).toContain('        web -> payments "Charges cards"\n');
    expect(page.modeler.views.active().key).toBe("Landscape");
    expect(selectedIds(page)).toEqual(["rel:implied:bookshop->payments"]);
    service<CommandStack>(page.modeler, "commandStack").undo();
    expect(page.modeler.exportText()).toBe(before);
  });

  it("offers Move to a component… in a container view, and nothing without children", async () => {
    const page = await mountModeler();
    const panel = panelFor(page);
    page.modeler.views.open("Containers", { cause: "user" });
    select(page.modeler, "rel:web->api");
    expect(buttonIn(panel, "Move to a component…")).toBeDefined();
    select(page.modeler, "rel:customer->web");
    expect(panel.querySelector('[data-focus-key="move-relationship"]')).toBeNull();
  });
});

describe("the notice after drawing a relationship on a system with containers", () => {
  function notices(page: Mounted): EditNoticeEvent[] {
    const seen: EditNoticeEvent[] = [];
    service<EventBus>(page.modeler, "eventBus").on(EDIT_NOTICE_EVENT, (event: EditNoticeEvent) => {
      seen.push({ notice: event.notice, message: event.message } as EditNoticeEvent);
    });
    return seen;
  }

  it("comes once per modeler, as an info notice in its own words", async () => {
    const page = await mountModeler();
    const seen = notices(page);
    const modeling = service<C4Modeling>(page.modeler, "modeling");
    modeling.connect(
      shapeOf(page.modeler, "customer") as Element,
      shapeOf(page.modeler, "bookshop") as Element,
    );
    expect(seen).toEqual([
      {
        notice: "relationship-above-containers",
        message:
          "Customer → Bookshop connects to Bookshop itself, so Bookshop's container view won't show it. Draw it to a container, or use Move to a container…",
      },
    ]);
    modeling.createRelationship("payments", "bookshop", { description: "Confirms" });
    expect(seen).toHaveLength(1);

    const other = await mountModeler();
    const again = notices(other);
    service<C4Modeling>(other.modeler, "modeling").createRelationship("payments", "bookshop", {
      description: "Confirms",
    });
    expect(again.map((event) => event.notice)).toEqual(["relationship-above-containers"]);
  });

  it("stays quiet for a relationship between containers or systems without them", async () => {
    const page = await mountModeler();
    const seen = notices(page);
    const modeling = service<C4Modeling>(page.modeler, "modeling");
    modeling.createRelationship("customer", "payments", { description: "Pays" });
    page.modeler.views.open("Containers", { cause: "user" });
    modeling.createRelationship("customer", "api", { description: "Calls" });
    expect(seen).toEqual([]);
  });
});
