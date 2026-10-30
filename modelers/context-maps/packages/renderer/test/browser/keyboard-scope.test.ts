import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { Modeler, cmConnectHandlesModule } from "@miragon/context-maps-renderer";
import { emptyDocument, type CmDocument } from "@miragon/context-maps-schema-model";

/**
 * The keyboard acts only while the canvas itself has the focus (diagram-js 15's rule), so every
 * pointer action that leaves the focus elsewhere and opens nothing hands it back to the canvas.
 * No modeler shell here: hosts that embed the renderer without it must get the same.
 */

const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function mapDocument(): CmDocument {
  const doc = emptyDocument("m");
  doc.contexts = [
    { id: "a", label: "A", position: { x: 100, y: 200 }, size: { width: 200, height: 110 } },
    { id: "b", label: "B", position: { x: 600, y: 200 }, size: { width: 200, height: 110 } },
  ];
  doc.relationships = [{ id: "r", from: "a", to: "b", pattern: "customer-supplier" }];
  return doc;
}

interface Mounted {
  modeler: Modeler;
  wrapper: HTMLElement;
  container: HTMLElement;
  svg: SVGSVGElement;
  /** Page text beside the canvas, the kind of host content a click moves the focus away to. */
  text: HTMLElement;
}

function mount(additionalModules: (typeof cmConnectHandlesModule)[] = []): Mounted {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:absolute;left:0;top:0;width:900px;height:700px";
  const text = document.createElement("p");
  text.textContent = "Host text";
  text.style.cssText = "margin:0;height:40px";
  const container = document.createElement("div");
  container.style.cssText = "width:900px;height:640px";
  wrapper.append(text, container);
  document.body.appendChild(wrapper);
  wrappers.push(wrapper);
  const modeler = new Modeler({ container, additionalModules });
  modeler.importDocument(mapDocument());
  const svg = container.querySelector<SVGSVGElement>(".djs-container > svg")!;
  return { modeler, wrapper, container, svg, text };
}

function select(modeler: Modeler, id: string): void {
  const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
  modeler.get<{ select(element: unknown): void }>("selection").select(registry.get(id));
}

function exists(modeler: Modeler, id: string): boolean {
  return modeler.get<{ get(id: string): unknown }>("elementRegistry").get(id) !== undefined;
}

/** A click with no pointer behind it, the one Enter or Space on a focused entry sends. */
function keyboardClick(entry: HTMLElement): void {
  entry.tabIndex = 0;
  entry.focus();
  entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
}

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function padEntry(container: HTMLElement, action: string): HTMLElement {
  const entry = container.querySelector<HTMLElement>(
    `.djs-context-pad.open [data-action="${action}"]`,
  );
  expect(entry, `pad entry "${action}"`).not.toBeNull();
  return entry!;
}

function paletteEntry(container: HTMLElement, action: string): HTMLElement {
  return container.querySelector<HTMLElement>(`.djs-palette [data-action="${action}"]`)!;
}

/** Past diagram-js' scheduled pad and popup updates. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

test("the keys act on the focused canvas", async () => {
  const { modeler, svg } = mount();
  try {
    select(modeler, "a");
    svg.focus();
    await userEvent.keyboard("{Backspace}");
    expect(exists(modeler, "a")).toBe(false);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "a")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

test("after a click on host text the keys leave the map alone", async () => {
  const { modeler, svg, text } = mount();
  try {
    select(modeler, "a");
    svg.focus();
    await userEvent.click(text);
    expect(document.activeElement).toBe(document.body);

    await userEvent.keyboard("{Backspace}");
    await userEvent.keyboard("{Delete}");
    expect(exists(modeler, "a")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

for (const hide of ["display: none", "inert", "nothing"] as const) {
  test(`a key with the page focused passes the canvas (${hide} on its container)`, () => {
    const { modeler, container } = mount();
    try {
      modeler.setMeta({ title: "Renamed" });
      select(modeler, "a");
      if (hide === "display: none") container.style.display = "none";
      if (hide === "inert") container.inert = true;

      expect(press(document.body, { key: "Backspace" }).defaultPrevented).toBe(false);
      expect(press(document.body, { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
      expect(press(document.body, { key: "a", metaKey: true }).defaultPrevented).toBe(false);
      expect(exists(modeler, "a")).toBe(true);
      expect(modeler.exportDocument().title).toBe("Renamed");
      expect(modeler.get<{ get(): unknown[] }>("selection").get()).toHaveLength(1);
    } finally {
      modeler.destroy();
    }
  });
}

for (const hide of ["inert", "display: none", "visibility: hidden"] as const) {
  test(`a key that reaches the canvas before the browser moves the focus off it passes, once the host set ${hide} on its container`, () => {
    const { modeler, container, svg } = mount();
    try {
      modeler.setMeta({ title: "Renamed" });
      select(modeler, "a");
      svg.focus();
      if (hide === "inert") container.inert = true;
      else if (hide === "display: none") container.style.display = "none";
      else container.style.visibility = "hidden";
      expect(document.activeElement).toBe(svg);

      for (const init of [
        { key: "Backspace" },
        { key: "Delete" },
        { key: "z", ctrlKey: true },
        { key: "a", metaKey: true },
      ]) {
        expect(press(svg, init).defaultPrevented, init.key).toBe(false);
      }
      expect(exists(modeler, "a")).toBe(true);
      expect(modeler.exportDocument().title).toBe("Renamed");
      expect(modeler.get<{ get(): unknown[] }>("selection").get()).toHaveLength(1);
    } finally {
      modeler.destroy();
    }
  });
}

test("an editor inside the canvas container keeps its keys", () => {
  const { modeler, container } = mount();
  try {
    select(modeler, "a");
    const editContextField = document.createElement("div");
    editContextField.tabIndex = 0;
    (editContextField as HTMLElement & { editContext?: unknown }).editContext = new (
      globalThis as unknown as { EditContext: new () => unknown }
    ).EditContext();
    const monaco = document.createElement("div");
    monaco.className = "monaco-editor";
    const monacoInput = document.createElement("div");
    monacoInput.tabIndex = 0;
    monaco.append(monacoInput);
    container.querySelector(".djs-container")!.append(editContextField, monaco);

    for (const field of [editContextField, monacoInput]) {
      field.focus();
      expect(press(field, { key: "Backspace" }).defaultPrevented).toBe(false);
      expect(press(field, { key: "a", ctrlKey: true }).defaultPrevented).toBe(false);
    }
    expect(exists(modeler, "a")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

test("a keydown without a key or inside an IME composition does nothing", () => {
  const { modeler, svg } = mount();
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent): void => {
    errors.push(event.error);
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  try {
    select(modeler, "a");
    for (const target of [svg, document.body]) {
      target.dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true }));
    }
    expect(errors).toEqual([]);

    expect(press(svg, { key: "Backspace", isComposing: true }).defaultPrevented).toBe(false);
    expect(exists(modeler, "a")).toBe(true);
  } finally {
    window.removeEventListener("error", onError);
    modeler.destroy();
  }
});

test("a pointer on the palette hands the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "a");
    await userEvent.click(paletteEntry(container, "lasso-tool"));
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Delete}");
    expect(exists(modeler, "a")).toBe(false);

    await userEvent.click(paletteEntry(container, "context.core"));
    expect(document.activeElement).toBe(svg);
    await userEvent.click(svg, { position: { x: 450, y: 520 } });
    expect(modeler.exportDocument().contexts).toHaveLength(2);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Delete}");
    expect(modeler.exportDocument().contexts.map((context) => context.id)).toEqual(["b"]);
  } finally {
    modeler.destroy();
  }
});

test("Enter or Space on a focused tool entry leave the focus on the entry", () => {
  const { modeler, container } = mount();
  try {
    const lasso = paletteEntry(container, "lasso-tool");
    keyboardClick(lasso);
    expect(document.activeElement).toBe(lasso);
  } finally {
    modeler.destroy();
  }
});

test("Enter or Space on an entry that goes away with its action hand the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "b");
    await settle();
    keyboardClick(padEntry(container, "delete"));
    expect(exists(modeler, "b")).toBe(false);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "b")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

test("pad entries that open nothing hand the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "r");
    await settle();
    await userEvent.click(padEntry(container, "swap-ends"));
    expect(document.activeElement).toBe(svg);
    expect(modeler.exportDocument().relationships[0]?.from).toBe("b");
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(modeler.exportDocument().relationships[0]?.from).toBe("a");

    select(modeler, "b");
    await settle();
    await userEvent.click(padEntry(container, "delete"));
    expect(exists(modeler, "b")).toBe(false);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "b")).toBe(true);

    select(modeler, "a");
    await settle();
    await userEvent.click(padEntry(container, "connect"));
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Escape}");
  } finally {
    modeler.destroy();
  }
});

test("pad entries that open a menu, an editor or a prompt keep the focus there", async () => {
  const { modeler, container } = mount();
  try {
    const opened: Record<string, string> = {
      pattern: ".djs-popup",
      "edit-label": ".djs-direct-editing-parent",
      description: ".cm-pad-prompt",
    };
    for (const [action, selector] of Object.entries(opened)) {
      select(modeler, "r");
      await settle();
      await userEvent.click(padEntry(container, action));
      await settle();
      expect(document.activeElement?.closest(selector), action).not.toBeNull();
      await userEvent.keyboard("{Escape}");
      await settle();
    }

    select(modeler, "a");
    await settle();
    await userEvent.click(padEntry(container, "append-context"));
    await settle();
    expect(document.activeElement?.closest(".djs-popup")).not.toBeNull();
  } finally {
    modeler.destroy();
  }
});

test("a press on a connect handle hands the keys to the canvas", async () => {
  const { modeler, container, svg, text } = mount([cmConnectHandlesModule]);
  try {
    svg.focus();
    await userEvent.click(text);
    select(modeler, "a");
    expect(document.activeElement).toBe(document.body);

    const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
    const canvas = modeler.get<{ getGraphics(element: unknown): SVGElement }>("canvas");
    const eventBus = modeler.get<{ createEvent(data: unknown): Event }>("eventBus");
    const dragging = modeler.get<{
      hover(event: Event): void;
      move(event: Event): void;
      end(): void;
    }>("dragging");
    // The rules allow one relationship per pair of contexts.
    modeler
      .get<{ removeElements(elements: unknown[]): void }>("modeling")
      .removeElements([registry.get("r")]);
    const target = registry.get("b");
    const handle = container.querySelector<HTMLElement>('.cm-connect-handle[data-side="right"]')!;
    handle.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 340, clientY: 295 }),
    );
    dragging.move(eventBus.createEvent({ x: 500, y: 255, clientX: 500, clientY: 295 }));
    dragging.hover(eventBus.createEvent({ element: target, gfx: canvas.getGraphics(target) }));
    dragging.move(eventBus.createEvent({ x: 700, y: 255, clientX: 700, clientY: 295 }));
    dragging.end();
    expect(modeler.exportDocument().relationships).toMatchObject([{ from: "a", to: "b" }]);
    expect(document.activeElement).toBe(svg);

    await userEvent.keyboard("{Control>}z{/Control}");
    expect(modeler.exportDocument().relationships).toEqual([]);
  } finally {
    modeler.destroy();
  }
});
