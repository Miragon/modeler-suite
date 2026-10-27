import { afterEach, expect, test } from "vitest";
import { Modeler, isCmContext } from "@miragon/context-maps-renderer";
import type { CmContext, CmLabelEditing, CmReadOnly } from "@miragon/context-maps-renderer";
import { SAMPLE_DOCUMENT } from "@miragon/context-maps-schema-model";

const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function mountModeler(options: ConstructorParameters<typeof Modeler>[0] = {}): Modeler {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:0;top:0;width:900px;height:640px";
  const container = document.createElement("div");
  wrapper.append(container);
  document.body.appendChild(wrapper);
  wrappers.push(wrapper);
  const modeler = new Modeler({ container, ...options });
  modeler.importDocument(SAMPLE_DOCUMENT);
  return modeler;
}

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function canvasSvg(modeler: Modeler): SVGSVGElement {
  return modeler.container.querySelector<SVGSVGElement>(".djs-container > svg")!;
}

interface SelectionLike {
  get(): Array<{ id: string }>;
  select(elements: unknown): void;
}

test("Cmd/Ctrl+A on the canvas selects every context and relationship and prevents the key", () => {
  const modeler = mountModeler();
  try {
    const selection = modeler.get<SelectionLike>("selection");
    const event = press(canvasSvg(modeler), { key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(selection.get()).toHaveLength(
      SAMPLE_DOCUMENT.contexts.length + SAMPLE_DOCUMENT.relationships.length,
    );
  } finally {
    modeler.destroy();
  }
});

test("keys from outside the canvas or already handled never reach the canvas", () => {
  const modeler = mountModeler();
  try {
    const selection = modeler.get<SelectionLike>("selection");
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(press(outside, { key: "a", metaKey: true }).defaultPrevented).toBe(false);
    outside.remove();

    const handled = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    canvasSvg(modeler).dispatchEvent(handled);
    expect(selection.get()).toHaveLength(0);
  } finally {
    modeler.destroy();
  }
});

test("Delete on a focused palette entry is the palette's and keeps the selection", () => {
  const modeler = mountModeler();
  try {
    const selection = modeler.get<SelectionLike>("selection");
    const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
    selection.select(registry.get("ctx_cfp"));
    const entry = modeler.container.querySelector<HTMLElement>(
      '.djs-palette [data-action="lasso-tool"]',
    )!;
    expect(press(entry, { key: "Delete" }).defaultPrevented).toBe(false);
    expect(registry.get("ctx_cfp")).toBeDefined();
  } finally {
    modeler.destroy();
  }
});

test("without undo keys Cmd/Ctrl+Z goes on to the host, unprevented and unhandled", () => {
  const modeler = mountModeler({ undoRedoKeys: false });
  try {
    modeler.setMeta({ title: "Renamed" });
    for (const init of [
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
      { key: "y", ctrlKey: true },
    ]) {
      expect(press(canvasSvg(modeler), init).defaultPrevented).toBe(false);
    }
    expect(modeler.exportDocument().title).toBe("Renamed");
  } finally {
    modeler.destroy();
  }
});

test("Enter on a creating palette entry places a selected context in the free rectangle", () => {
  const insets = { top: 88, right: 24, bottom: 64, left: 24 };
  const modeler = mountModeler({ freeArea: { insets: () => insets } });
  try {
    const entry = modeler.container.querySelector<HTMLElement>(
      '.djs-palette [data-action="context.core"]',
    )!;
    expect(entry.getAttribute("title")).toBeNull();
    expect(entry.getAttribute("aria-label")).toBe("Core domain");

    const keyboardClick = () =>
      entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    const ids = () =>
      new Set(
        modeler
          .get<{ getAll(): unknown[] }>("elementRegistry")
          .getAll()
          .filter(isCmContext)
          .map((context) => (context as CmContext).id),
      );
    const before = ids();
    keyboardClick();
    const created = [...ids()].filter((id) => !before.has(id));
    expect(created).toHaveLength(1);

    const selection = modeler.get<SelectionLike>("selection");
    expect(selection.get().map((element) => element.id)).toEqual(created);
    expect(modeler.get<CmLabelEditing>("cmLabelEditing").openEdit()?.elementId).toBe(created[0]);

    const canvas = modeler.get<{
      viewbox(): { x: number; y: number; scale: number; outer: { width: number; height: number } };
    }>("canvas");
    const viewbox = canvas.viewbox();
    const shape = modeler.get<{ get(id: string): CmContext }>("elementRegistry").get(created[0]!);
    const centreOnScreen = {
      x: (shape.x + shape.width / 2 - viewbox.x) * viewbox.scale,
      y: (shape.y + shape.height / 2 - viewbox.y) * viewbox.scale,
    };
    expect(centreOnScreen.x).toBeCloseTo((900 - 24 - 24) / 2 + 24, 0);
    expect(centreOnScreen.y).toBeCloseTo((640 - 88 - 64) / 2 + 88, 0);

    modeler.get<CmLabelEditing>("cmLabelEditing").cancel();
    keyboardClick();
    const second = [...ids()].filter((id) => !before.has(id) && id !== created[0]);
    const next = modeler.get<{ get(id: string): CmContext }>("elementRegistry").get(second[0]!);
    expect(next.x - shape.x).toBe(24);
    expect(next.y - shape.y).toBe(24);
  } finally {
    modeler.destroy();
  }
});

test("the read-only lock leaves no context pad, move, delete or label editor", () => {
  const modeler = mountModeler();
  try {
    const lock = modeler.get<CmReadOnly>("cmReadOnly");
    const registry = modeler.get<{ get(id: string): CmContext }>("elementRegistry");
    const selection = modeler.get<SelectionLike>("selection");
    const rules = modeler.get<{ allowed(action: string, context: unknown): unknown }>("rules");
    const context = registry.get("ctx_cfp");

    lock.setReadOnly(true);
    selection.select(context);
    expect(modeler.container.querySelectorAll(".djs-context-pad .entry")).toHaveLength(0);
    expect(rules.allowed("elements.move", { shapes: [context], delta: { x: 40, y: 0 } })).toBe(
      false,
    );
    press(canvasSvg(modeler), { key: "Delete" });
    expect(registry.get("ctx_cfp")).toBeDefined();
    modeler.get<CmLabelEditing>("cmLabelEditing").activate(context);
    expect(modeler.get<CmLabelEditing>("cmLabelEditing").openEdit()).toBeUndefined();
    expect(press(canvasSvg(modeler), { key: "a", metaKey: true }).defaultPrevented).toBe(true);

    const title = modeler.exportDocument().title;
    modeler.setMeta({ title: "Renamed on a locked canvas" });
    expect(modeler.exportDocument().title).toBe(title);

    lock.setReadOnly(false);
    selection.select(context);
    expect(modeler.container.querySelectorAll(".djs-context-pad .entry").length).toBeGreaterThan(0);
  } finally {
    modeler.destroy();
  }
});

test("the SVG export takes the canvas, also when a palette icon comes first", () => {
  const modeler = mountModeler();
  try {
    const container = modeler.container.querySelector(".djs-container")!;
    const palette = container.querySelector(".djs-palette")!;
    container.insertBefore(palette, canvasSvg(modeler));
    canvasSvg(modeler).setAttribute("role", "application");
    canvasSvg(modeler).setAttribute("aria-label", "Context map");

    const { svg } = modeler.saveSVG();
    expect(svg).toContain('data-element-id="ctx_cfp"');
    expect(svg).not.toMatch(/<svg[^>]*(tabindex|role=|aria-label)/);
  } finally {
    modeler.destroy();
  }
});
