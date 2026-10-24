import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { Modeler } from "@miragon/team-topologies-renderer";
import { emptyDocument, type TtDocument } from "@miragon/team-topologies-schema-model";

/**
 * The keyboard acts only while the canvas itself has the focus (diagram-js 15's rule), so every
 * pointer action that leaves the focus elsewhere and opens nothing hands it back to the canvas.
 * No modeler shell here: hosts that embed the renderer without it must get the same.
 */

const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function topologyDocument(): TtDocument {
  return {
    ...emptyDocument("Keys"),
    nodes: [
      {
        id: "team_a",
        type: "stream-aligned",
        label: "A",
        position: { x: 80, y: 200 },
        size: { width: 200, height: 80 },
      },
      {
        id: "team_b",
        type: "platform",
        label: "B",
        position: { x: 520, y: 200 },
        size: { width: 200, height: 80 },
      },
    ],
    annotations: [
      {
        id: "ann_free",
        text: "Open question",
        position: { x: 300, y: 360 },
        size: { width: 160, height: 48 },
      },
    ],
  };
}

interface Mounted {
  modeler: Modeler;
  container: HTMLElement;
  svg: SVGSVGElement;
  /** Page text beside the canvas, the kind of host content a click moves the focus away to. */
  text: HTMLElement;
}

function mount(): Mounted {
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
  const modeler = new Modeler({ container });
  modeler.importDocument(topologyDocument(), { fit: false });
  const svg = container.querySelector<SVGSVGElement>(".djs-container > svg")!;
  return { modeler, container, svg, text };
}

function select(modeler: Modeler, id: string): void {
  const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
  modeler.get<{ select(element: unknown): void }>("selection").select(registry.get(id));
}

function selectedCount(modeler: Modeler): number {
  return modeler.get<{ get(): unknown[] }>("selection").get().length;
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

/** Past diagram-js' scheduled pad updates. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

test("the keys act on the focused canvas", async () => {
  const { modeler, svg } = mount();
  try {
    select(modeler, "team_a");
    svg.focus();
    await userEvent.keyboard("{Backspace}");
    expect(exists(modeler, "team_a")).toBe(false);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "team_a")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

test("after a click on host text the keys leave the diagram alone", async () => {
  const { modeler, svg, text } = mount();
  try {
    select(modeler, "team_a");
    svg.focus();
    await userEvent.click(text);
    expect(document.activeElement).toBe(document.body);

    await userEvent.keyboard("{Backspace}");
    await userEvent.keyboard("{Delete}");
    expect(exists(modeler, "team_a")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

for (const hide of ["display: none", "inert", "nothing"] as const) {
  test(`a key with the page focused passes the canvas (${hide} on its container)`, () => {
    const { modeler, container } = mount();
    try {
      modeler.get<{ setTitle(title: string): void }>("ttModeling").setTitle("Renamed");
      select(modeler, "team_a");
      if (hide === "display: none") container.style.display = "none";
      if (hide === "inert") container.inert = true;

      expect(press(document.body, { key: "Backspace" }).defaultPrevented).toBe(false);
      expect(press(document.body, { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
      expect(press(document.body, { key: "a", metaKey: true }).defaultPrevented).toBe(false);
      expect(press(document, { key: "Delete" }).defaultPrevented).toBe(false);
      expect(exists(modeler, "team_a")).toBe(true);
      expect(modeler.exportDocument().title).toBe("Renamed");
      expect(selectedCount(modeler)).toBe(1);
    } finally {
      modeler.destroy();
    }
  });
}

test("an editor inside the canvas container keeps its keys", () => {
  const { modeler, container } = mount();
  try {
    select(modeler, "team_a");
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
    expect(exists(modeler, "team_a")).toBe(true);
    expect(selectedCount(modeler)).toBe(1);
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
    select(modeler, "team_a");
    for (const target of [svg, document.body]) {
      target.dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true }));
    }
    expect(errors).toEqual([]);

    expect(press(svg, { key: "Backspace", isComposing: true }).defaultPrevented).toBe(false);
    expect(exists(modeler, "team_a")).toBe(true);
  } finally {
    window.removeEventListener("error", onError);
    modeler.destroy();
  }
});

test("a pointer on the palette hands the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "team_a");
    await userEvent.click(paletteEntry(container, "lasso-tool"));
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Delete}");
    expect(exists(modeler, "team_a")).toBe(false);

    await userEvent.click(paletteEntry(container, "team.platform"));
    expect(document.activeElement).toBe(svg);
    await userEvent.click(svg, { position: { x: 450, y: 560 } });
    expect(modeler.exportDocument().nodes).toHaveLength(2);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Delete}");
    expect(modeler.exportDocument().nodes.map((node) => node.id)).toEqual(["team_b"]);
  } finally {
    modeler.destroy();
  }
});

test("a drag from a palette entry hands the keys to the canvas", () => {
  const { modeler, container, svg } = mount();
  try {
    const entry = paletteEntry(container, "team.enabling");
    const box = entry.getBoundingClientRect();
    entry.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      }),
    );
    expect(document.activeElement).toBe(svg);
    modeler.get<{ cancel(): void }>("dragging").cancel();
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

test("pad entries that open nothing hand the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "team_b");
    await settle();
    await userEvent.click(padEntry(container, "delete"));
    expect(exists(modeler, "team_b")).toBe(false);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "team_b")).toBe(true);

    select(modeler, "ann_free");
    await settle();
    await userEvent.click(padEntry(container, "connect"));
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Escape}");
  } finally {
    modeler.destroy();
  }
});

test("Enter on the pad's delete hands the keys to the canvas", async () => {
  const { modeler, container, svg } = mount();
  try {
    select(modeler, "team_b");
    await settle();
    const deleteEntry = padEntry(container, "delete");
    deleteEntry.focus();
    await userEvent.keyboard("{Enter}");
    expect(exists(modeler, "team_b")).toBe(false);
    expect(document.activeElement).toBe(svg);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(exists(modeler, "team_b")).toBe(true);
  } finally {
    modeler.destroy();
  }
});

test("pad entries that open the label editor keep the focus there", async () => {
  const { modeler, container, svg } = mount();
  try {
    for (const action of ["edit-label", "append-annotation"]) {
      select(modeler, "team_a");
      await settle();
      await userEvent.click(padEntry(container, action));
      expect(document.activeElement, action).toBe(
        container.querySelector("textarea.tt-label-editor"),
      );
      await userEvent.keyboard("{Escape}");
      expect(document.activeElement, action).toBe(svg);
    }
  } finally {
    modeler.destroy();
  }
});

test("a focused pad entry stays with its pad when diagram-js rebuilds or closes it", async () => {
  const { modeler, container, svg } = mount();
  const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
  const modeling = modeler.get<{
    moveElements(elements: unknown[], delta: { x: number; y: number }): void;
    removeElements(elements: unknown[]): void;
  }>("modeling");
  const commandStack = modeler.get<{ undo(): void }>("commandStack");
  const readOnly = modeler.get<{ setReadOnly(readOnly: boolean): void }>("ttReadOnly");
  try {
    select(modeler, "team_a");
    await settle();
    padEntry(container, "edit-label").focus();

    modeling.moveElements([registry.get("team_a")], { x: 30, y: 0 });
    await settle();
    expect(document.activeElement).toBe(padEntry(container, "edit-label"));
    commandStack.undo();
    await settle();
    expect(document.activeElement).toBe(padEntry(container, "edit-label"));

    readOnly.setReadOnly(true);
    await settle();
    expect(container.querySelector(".djs-context-pad")).toBeNull();
    expect(document.activeElement).toBe(svg);
    readOnly.setReadOnly(false);

    select(modeler, "team_b");
    await settle();
    padEntry(container, "append-annotation").focus();
    modeling.removeElements([registry.get("team_b")]);
    await settle();
    expect(document.activeElement).toBe(svg);
  } finally {
    modeler.destroy();
  }
});

test("a rebuilt pad leaves the focus alone once it has moved on to the page", async () => {
  const { modeler, container, text } = mount();
  const registry = modeler.get<{ get(id: string): unknown }>("elementRegistry");
  const modeling = modeler.get<{
    moveElements(elements: unknown[], delta: { x: number; y: number }): void;
  }>("modeling");
  try {
    select(modeler, "team_a");
    await settle();
    padEntry(container, "edit-label").focus();
    await userEvent.click(text);
    expect(document.activeElement).toBe(document.body);

    modeling.moveElements([registry.get("team_a")], { x: 30, y: 0 });
    await settle();

    expect(document.activeElement).toBe(document.body);
  } finally {
    modeler.destroy();
  }
});
