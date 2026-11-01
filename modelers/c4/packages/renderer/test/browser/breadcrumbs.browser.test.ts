/*
 * The breadcrumb of the view hierarchy: the path from the landscape down to the view shown, each
 * view above a button that opens it, the view shown plain text. It follows every view switch, an
 * undo or a redo across views, an edit that renames a scope or removes a parent, and an import;
 * it works in the viewer, stays out of the export, and keeps off the host chrome's islands.
 */
import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Canvas from "diagram-js/lib/core/Canvas";
import type EventBus from "diagram-js/lib/core/EventBus";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type { CollaborativeDiagram } from "../../src/collaborative/index.js";
import type C4Modeling from "../../src/modeling/C4Modeling.js";
import type Navigation from "../../src/navigation/Navigation.js";
import type { C4ElementShape } from "../../src/scene/types.js";
import { VIEW_CHANGED_EVENT, type ViewChangedEvent } from "../../src/services.js";
import { LIBRARY, SHOP } from "./support/documents.js";
import { createTestModeler, createTestViewer, removeHosts } from "./support/stack.js";

let modeler: CollaborativeDiagram;
const wrappers: HTMLElement[] = [];

afterEach(() => {
  modeler.destroy();
  removeHosts();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function service<T>(name: string): T {
  return modeler.diagram.get<T>(name);
}

function breadcrumb(): HTMLElement {
  const found = modeler.diagram.container.querySelector<HTMLElement>("nav.c4-breadcrumbs");
  if (!found) throw new Error("no breadcrumb in the canvas");
  return found;
}

/** What the breadcrumb reads, `[x]` around the view shown; empty while it is hidden. */
function crumbs(): string[] {
  const nav = breadcrumb();
  if (nav.hidden) return [];
  return [...nav.querySelectorAll("li")].map((item) => {
    const current = item.querySelector('[aria-current="page"]');
    const text = (current ?? item.querySelector("button"))?.textContent ?? "";
    return current ? `[${text}]` : text;
  });
}

function crumbButton(text: string): HTMLButtonElement {
  const button = [...breadcrumb().querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`no crumb "${text}" to click`);
  return button;
}

function open(key: string): void {
  expect(modeler.views.open(key, { cause: "user" })).toBe(true);
}

function recordSwitches(): ViewChangedEvent[] {
  const switches: ViewChangedEvent[] = [];
  service<EventBus>("eventBus").on(VIEW_CHANGED_EVENT, (event: ViewChangedEvent) => {
    switches.push({ view: event.view, previous: event.previous, cause: event.cause });
  });
  return switches;
}

const LANDSCAPE = "System landscape";

describe("the path per view type (SPEC 4.5)", () => {
  it("is hidden at the landscape, where no view lies above", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    expect(modeler.views.active().key).toBe("Landscape");
    expect(breadcrumb().hidden).toBe(true);
    expect(breadcrumb().getAttribute("aria-label")).toBe("Breadcrumb");
  });

  it("names every level down to a component view, a draft included", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);

    open("ShopContext");
    expect(crumbs()).toEqual([LANDSCAPE, "[Shop context]"]);
    open("ShopContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
    open("Components-api");
    expect(modeler.views.active().state).toBe("draft");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "Shop containers", "[API components]"]);
    // A container view of a system without a context view keeps that level: its draft, as U goes.
    open("Containers-payments");
    expect(crumbs()).toEqual([LANDSCAPE, "Payments context", "[Payments containers]"]);
    expect(crumbButton("Payments context").dataset.view).toBe("SystemContext-payments");
  });

  it("marks the view shown as the current page, not as a button", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");

    const items = [...breadcrumb().querySelectorAll("ol > li")];
    expect(items).toHaveLength(3);
    const current = items.at(-1)!.querySelector('[aria-current="page"]');
    expect(current?.tagName).toBe("SPAN");
    expect(items.at(-1)!.querySelector("button")).toBeNull();
    for (const item of items.slice(0, -1)) {
      const button = item.querySelector("button");
      expect(button?.type).toBe("button");
      expect(button?.getAttribute("tabindex")).toBeNull();
    }
    // The separators are decoration only.
    for (const separator of breadcrumb().querySelectorAll("svg")) {
      expect(separator.getAttribute("aria-hidden")).toBe("true");
      expect(separator.getAttribute("tabindex")).toBeNull();
    }
  });
});

describe("a click on a view above", () => {
  it("opens that view, caused by the user, and hands the focus to the canvas", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("Components-api");
    const switches = recordSwitches();
    const text = modeler.exportText();

    crumbButton("Shop context").click();

    expect(modeler.views.active().key).toBe("ShopContext");
    expect(switches).toEqual([{ view: "ShopContext", previous: "Components-api", cause: "user" }]);
    expect(crumbs()).toEqual([LANDSCAPE, "[Shop context]"]);
    expect(document.activeElement).toBe(
      service<Canvas>("canvas").getContainer().querySelector("svg"),
    );
    // Navigating writes nothing and adds no undo step.
    expect(modeler.exportText()).toBe(text);
    expect(service<CommandStack>("commandStack").canUndo()).toBe(false);

    crumbButton(LANDSCAPE).click();
    expect(modeler.views.active().key).toBe("Landscape");
    expect(breadcrumb().hidden).toBe(true);
  });

  it("opens a draft above the view shown", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(LIBRARY);
    expect(modeler.views.active().key).toBe("LibraryContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Library context", "[Library containers]"]);

    crumbButton("Library context").click();

    expect(modeler.views.active()).toMatchObject({ key: "SystemContext-library", state: "draft" });
    expect(crumbs()).toEqual([LANDSCAPE, "[Library context]"]);
  });
});

describe("it follows the view and the document", () => {
  it("follows U, Enter and the drill-down of the navigation", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    const navigation = service<Navigation>("c4Navigation");

    expect(navigation.openChildOf("shop")).toBe(true);
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
    expect(navigation.openParent()).toBe(true);
    expect(crumbs()).toEqual([LANDSCAPE, "[Shop context]"]);
  });

  it("follows an undo and a redo that switch views", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");
    const web = service<ElementRegistry>("elementRegistry").get("web") as C4ElementShape;
    service<C4Modeling>("modeling").moveElements([web], { x: 40, y: 0 });
    crumbButton(LANDSCAPE).click();
    expect(breadcrumb().hidden).toBe(true);

    service<CommandStack>("commandStack").undo();
    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);

    open("Landscape");
    service<CommandStack>("commandStack").redo();
    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
  });

  it("follows a rename of the scope and a parent that an edit removes, and their undo", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");

    modeler.c4.editElement("shop", { name: "Store" });
    expect(crumbs()).toEqual([LANDSCAPE, "Store context", "[Store containers]"]);
    service<CommandStack>("commandStack").undo();
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);

    modeler.c4.deleteView("ShopContext");
    expect(modeler.views.active().key).toBe("ShopContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
    expect(crumbButton("Shop context").dataset.view).toBe("SystemContext-shop");
    service<CommandStack>("commandStack").undo();
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
    expect(crumbButton("Shop context").dataset.view).toBe("ShopContext");
  });

  it("follows an import, onto another workspace's view and back to a landscape", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("Components-api");

    await modeler.importText(LIBRARY);
    expect(crumbs()).toEqual([LANDSCAPE, "Library context", "[Library containers]"]);

    await modeler.importText(SHOP);
    expect(breadcrumb().hidden).toBe(true);
    // The view an import keeps (the VS Code webview's re-import) keeps its path.
    modeler.diagram.importText(SHOP, { view: "ShopContainers" });
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);
  });

  it("keeps the focus on a crumb that a redraw keeps", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");
    crumbButton("Shop context").focus();

    modeler.c4.editElement("customer", { name: "Reader" });
    modeler.c4.editElement("shop", { name: "Store" });

    expect(document.activeElement).toBe(crumbButton("Store context"));
  });
});

describe("where it shows", () => {
  it("in the viewer too, the contract's read-only mount", async () => {
    modeler = createTestViewer();
    await modeler.importText(SHOP);
    expect(breadcrumb().hidden).toBe(true);
    open("ShopContainers");
    expect(crumbs()).toEqual([LANDSCAPE, "Shop context", "[Shop containers]"]);

    crumbButton("Shop context").click();
    expect(modeler.views.active().key).toBe("ShopContext");
  });

  it("after the canvas <svg> and never in the export", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");
    const container = service<Canvas>("canvas").getContainer();
    const svg = container.querySelector(":scope > svg")!;

    expect(breadcrumb().parentElement).toBe(container);
    expect(
      svg.compareDocumentPosition(breadcrumb()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const { svg: exported } = modeler.diagram.saveSVG();
    expect(exported).not.toContain("c4-breadcrumbs");
    expect(exported).not.toContain("Shop context");
  });

  it("with its links underlined at rest in high contrast, so colour is not their only sign", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");
    const link = crumbButton("Shop context");
    expect(getComputedStyle(link).textDecorationLine).toBe("none");

    document.documentElement.setAttribute("data-cd-kontrast", "hoch");
    try {
      expect(getComputedStyle(link).textDecorationLine).toBe("underline");
      const current = breadcrumb().querySelector('[aria-current="page"]')!;
      expect(getComputedStyle(current).textDecorationLine).toBe("none");
    } finally {
      document.documentElement.removeAttribute("data-cd-kontrast");
    }
  });

  it("below the menu trigger on the free line, 24 high, in the canvas layer (guide §5.13)", async () => {
    ({ modeler } = createTestModeler());
    await modeler.importText(SHOP);
    open("ShopContainers");
    const host = modeler.diagram.container.getBoundingClientRect();
    const box = breadcrumb().getBoundingClientRect();

    expect(box.left - host.left).toBe(12);
    expect(box.top - host.top).toBe(64);
    expect(box.height).toBe(24);
    expect(Number(getComputedStyle(breadcrumb()).zIndex)).toBeLessThanOrEqual(100);
  });
});

/** A stand-in for the shell's root around the canvas, `width` × `height`, with `islands`. */
function shellAround(width: number, height: number, attributes: Record<string, string> = {}) {
  const root = document.createElement("div");
  root.className = "cd-shell";
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  root.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:hidden`;
  const slot = document.createElement("div");
  slot.style.cssText = "position:absolute;inset:0";
  root.append(slot);
  document.body.append(root);
  wrappers.push(root);
  return {
    root,
    slot,
    island(name: string, css: string): HTMLElement {
      const island = document.createElement("div");
      island.setAttribute("data-chrome", name);
      island.style.cssText = `position:absolute;${css}`;
      root.append(island);
      return island;
    },
  };
}

async function createInShell(shell: ReturnType<typeof shellAround>): Promise<void> {
  ({ modeler } = createTestModeler());
  modeler.attachTo(shell.slot);
  await modeler.importText(SHOP);
  open("Components-api");
}

const nextFrames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

describe("it keeps off the host chrome's islands (guide §5.2, §5.15)", () => {
  it("goes below a palette in the second row", async () => {
    const shell = shellAround(420, 700, { "data-palette": "second-row" });
    await createInShell(shell);
    const box = breadcrumb().getBoundingClientRect();
    expect(box.top - shell.root.getBoundingClientRect().top).toBe(116);
    expect(box.bottom - shell.root.getBoundingClientRect().top).toBe(140);
  });

  it("ends 8px before an island beside it, and takes its width back once it goes", async () => {
    const shell = shellAround(800, 600);
    await createInShell(shell);
    const root = shell.root.getBoundingClientRect();
    const inspector = shell.island("inspector", "top:64px;right:12px;width:288px;height:300px");

    await expect
      .poll(() => breadcrumb().getBoundingClientRect().right - root.left)
      .toBeLessThanOrEqual(800 - 12 - 288 - 8);
    expect(breadcrumb().hasAttribute("data-covered")).toBe(false);

    inspector.hidden = true;
    await expect.poll(() => breadcrumb().style.maxWidth).toBe("");
  });

  it("steps aside while an island covers its start, and comes back", async () => {
    const shell = shellAround(420, 700, { "data-palette": "second-row" });
    await createInShell(shell);
    const status = shell.island("status", "top:116px;left:12px;right:12px;height:96px");

    await expect.poll(() => breadcrumb().hasAttribute("data-covered")).toBe(true);
    expect(getComputedStyle(breadcrumb()).visibility).toBe("hidden");

    status.hidden = true;
    await expect.poll(() => breadcrumb().hasAttribute("data-covered")).toBe(false);
    expect(getComputedStyle(breadcrumb()).visibility).toBe("visible");
  });

  it("watches an island that was hidden at the start: showing it", async () => {
    const shell = shellAround(800, 600);
    const status = shell.island("status", "top:64px;left:12px;width:560px;height:72px");
    status.hidden = true;
    await createInShell(shell);
    await nextFrames();
    expect(breadcrumb().hasAttribute("data-covered")).toBe(false);

    status.hidden = false;
    await expect.poll(() => breadcrumb().hasAttribute("data-covered")).toBe(true);
  });

  it("follows the root's state attributes that move an island", async () => {
    const shell = shellAround(420, 300);
    await createInShell(shell);
    // A tall legend that rises into the breadcrumb's band once the pill shows below it.
    const legend = shell.island("legend", "left:12px;bottom:12px;width:184px;height:200px");
    await nextFrames();
    expect(breadcrumb().hasAttribute("data-covered")).toBe(false);

    legend.style.bottom = "60px";
    shell.root.setAttribute("data-problems", "shown");
    await expect.poll(() => breadcrumb().hasAttribute("data-covered")).toBe(true);
  });
});

/** Whether the span shows less than its text. */
const cut = (span: Element | null) =>
  span instanceof HTMLElement && span.scrollWidth > span.clientWidth;

describe("a long path gives way gracefully", () => {
  it("the names above give way first, every level and the view shown staying whole", async () => {
    const shell = shellAround(460, 700, { "data-palette": "second-row" });
    await createInShell(shell);
    const nav = breadcrumb();
    const root = shell.root.getBoundingClientRect();

    expect(nav.getBoundingClientRect().right - root.left).toBeLessThanOrEqual(460 - 12);
    expect(nav.scrollWidth).toBeLessThanOrEqual(nav.clientWidth);
    const items = [...nav.querySelectorAll("li")];
    expect(cut(items[0]!.querySelector(".c4-breadcrumbs-name"))).toBe(true);
    expect(cut(items.at(-1)!.querySelector(".c4-breadcrumbs-name"))).toBe(false);
    for (const level of nav.querySelectorAll(".c4-breadcrumbs-level")) {
      expect(cut(level), level.textContent ?? "").toBe(false);
    }
    // The whole text stays the crumb's text, for a screen reader too.
    expect(items.at(-1)!.querySelector('[aria-current="page"]')!.textContent).toBe(
      "API components",
    );
  });

  it("a cut name keeps a letter and its ellipsis, and a level goes only after the names", async () => {
    const shell = shellAround(420, 700, { "data-palette": "second-row" });
    await createInShell(shell);
    const nav = breadcrumb();
    const names = [...nav.querySelectorAll<HTMLElement>("button .c4-breadcrumbs-name")];
    for (const name of names) {
      if (cut(name)) expect(name.getBoundingClientRect().width).toBeGreaterThanOrEqual(25);
    }
    const levelsCut = [...nav.querySelectorAll("button .c4-breadcrumbs-level")].some(cut);
    if (levelsCut) {
      for (const name of names) {
        expect(Math.min(name.scrollWidth, 27)).toBeGreaterThanOrEqual(
          Math.floor(name.getBoundingClientRect().width),
        );
      }
    }
    expect(nav.scrollWidth).toBeLessThanOrEqual(nav.clientWidth);
  });

  it("at 320px: the levels above go next, the view shown still whole", async () => {
    const shell = shellAround(320, 600, { "data-palette": "second-row" });
    await createInShell(shell);
    const nav = breadcrumb();

    expect(nav.scrollWidth).toBeLessThanOrEqual(nav.clientWidth);
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(cut(current.querySelector(".c4-breadcrumbs-name"))).toBe(false);
    expect(cut(current.querySelector(".c4-breadcrumbs-level"))).toBe(false);
    expect(nav.hasAttribute("data-covered")).toBe(false);
  });

  it("takes its width back once the container widens", async () => {
    const shell = shellAround(420, 700, { "data-palette": "second-row" });
    await createInShell(shell);
    shell.root.style.width = "1440px";
    shell.root.removeAttribute("data-palette");

    await expect
      .poll(() => [...breadcrumb().querySelectorAll(".c4-breadcrumbs-name")].some(cut))
      .toBe(false);
    expect(breadcrumb().getBoundingClientRect().top - shell.root.getBoundingClientRect().top).toBe(
      64,
    );
  });

  it("steps aside in a container too narrow for it", async () => {
    const shell = shellAround(130, 600);
    await createInShell(shell);
    expect(breadcrumb().hasAttribute("data-covered")).toBe(true);
  });
});
