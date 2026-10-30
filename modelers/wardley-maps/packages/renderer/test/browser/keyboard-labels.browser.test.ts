import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Create from "diagram-js/lib/features/create/Create";
import type Dragging from "diagram-js/lib/features/dragging/Dragging";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import { Modeler, restoreEditorState, setAsideEditorState } from "../../src/index.js";
import {
  isWardleyConnection,
  isWardleyShape,
  type WardleyConnection,
  type WardleyShape,
} from "../../src/model/di-types.js";
import type WardleyElementFactory from "../../src/model/WardleyElementFactory.js";
import type WardleyLabelEditing from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyLinkEditing from "../../src/link-editing/WardleyLinkEditing.js";
import type { LabelDeduplicatedEvent } from "../../src/label-editing/WardleyLabelEditing.js";
import type WardleyCopyPaste from "../../src/modeling/WardleyCopyPaste.js";
import type WardleyColorPicker from "../../src/color-picker/WardleyColorPicker.js";
import type EvolutionGrid from "../../src/evolution-grid/EvolutionGrid.js";
import type WardleyDrawTool from "../../src/draw-tool/WardleyDrawTool.js";
import "../../src/assets/wardley.css";

const DSL = `title Keyboard Fixture
anchor Customer [0.95, 0.45]
component Platform [0.55, 0.62]
note Remember the budget [0.30, 0.20]
pioneers [0.9, 0.05, 0.7, 0.3]
Customer -> Platform`;

function findByLabel(registry: ElementRegistry, label: string): WardleyShape {
  const shape = registry.find((el) => isWardleyShape(el) && el.wardleyLabel === label) as
    WardleyShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

function pressKey(
  target: EventTarget,
  key: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
}

function labelInput(): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector(".wardley-label-input");
}

function linkInput(): HTMLInputElement | null {
  return document.querySelector(".wardley-link-input");
}

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Keyboard and in-place label editing (real browser DOM)", () => {
  let container: HTMLElement;
  let modeler: Modeler;
  const hostChrome: HTMLElement[] = [];

  function service<T>(name: string): T {
    return modeler.get<T>(name);
  }

  function shapeLabels(type: string): string[] {
    return service<ElementRegistry>("elementRegistry")
      .filter((el) => isWardleyShape(el) && el.wardleyType === type)
      .map((el) => (el as WardleyShape).wardleyLabel);
  }

  function svg(): SVGElement {
    return container.querySelector("svg")!;
  }

  /** A key pressed with the canvas focused, the only place its keys act. */
  function pressOnCanvas(
    key: string,
    modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
  ): KeyboardEvent {
    svg().focus();
    return pressKey(svg(), key, modifiers);
  }

  function select(label: string): WardleyShape {
    const shape = findByLabel(service<ElementRegistry>("elementRegistry"), label);
    service<Selection>("selection").select(shape);
    return shape;
  }

  function addHostControl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
    const control = document.createElement(tag);
    document.body.appendChild(control);
    hostChrome.push(control);
    return control;
  }

  beforeEach(async () => {
    container = document.createElement("div");
    container.style.width = "1024px";
    container.style.height = "768px";
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    await modeler.importDSL(DSL);
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
    for (const control of hostChrome.splice(0)) control.remove();
  });

  /** The ways a host hides a canvas it keeps; the focus leaves it at the next rendering update. */
  const hostHidings = [
    {
      how: "made it inert",
      hide: () => container.setAttribute("inert", ""),
      show: () => container.removeAttribute("inert"),
    },
    {
      how: "hid it with display: none",
      hide: () => (container.style.display = "none"),
      show: () => container.style.removeProperty("display"),
    },
    {
      how: "hid it with visibility: hidden",
      hide: () => container.style.setProperty("visibility", "hidden"),
      show: () => container.style.removeProperty("visibility"),
    },
  ];

  describe("focus scoping", () => {
    it("leaves keys alone while a host select or button has focus", () => {
      select("Platform");
      const before = modeler.exportDSL();
      const preset = addHostControl("select");
      preset.append(new Option("activities"), new Option("data"));
      const share = addHostControl("button");

      for (const control of [preset, share]) {
        control.focus();
        for (const key of ["ArrowDown", "Backspace", "Escape"]) {
          expect(pressKey(control, key).defaultPrevented).toBe(false);
        }
      }
      preset.focus();
      expect(pressKey(preset, "c").defaultPrevented).toBe(false);

      expect(modeler.exportDSL()).toBe(before);
      expect(service<Dragging>("dragging").context()).toBeFalsy();
      expect(service<Selection>("selection").get()).toHaveLength(1);
    });

    it("leaves undo and the single-key tools to a focused host button", () => {
      select("Platform");
      pressOnCanvas("Backspace");
      expect(shapeLabels("component")).toEqual([]);
      const afterDelete = modeler.exportDSL();

      const zoomIn = addHostControl("button");
      zoomIn.focus();
      for (const [key, modifiers] of [
        ["z", { metaKey: true }],
        ["y", { metaKey: true }],
        ["c", {}],
        ["n", {}],
        ["l", {}],
      ] as const) {
        expect(pressKey(zoomIn, key, modifiers).defaultPrevented, key).toBe(false);
      }
      expect(modeler.exportDSL()).toBe(afterDelete);
      expect(service<Dragging>("dragging").context()).toBeFalsy();
    });

    it.each([
      ["with nothing focused", () => {}],
      ["while the host hides the canvas", () => (container.style.display = "none")],
      ["while the host makes the canvas inert", () => container.setAttribute("inert", "")],
    ])("leaves a key on the page alone %s", (_case, hostChange) => {
      const platform = select("Platform");
      svg().focus();
      svg().blur();
      hostChange();
      expect(document.activeElement).toBe(document.body);

      for (const [key, modifiers] of [
        ["Backspace", {}],
        ["ArrowLeft", {}],
        ["c", {}],
        ["a", { metaKey: true }],
      ] as const) {
        expect(pressKey(document.body, key, modifiers).defaultPrevented, key).toBe(false);
      }
      expect(shapeLabels("component")).toEqual(["Platform"]);
      expect(service<Selection>("selection").get()).toEqual([platform]);
    });

    it.each([
      ["hides the focused canvas", () => (container.style.display = "none")],
      ["makes the focused canvas inert", () => container.setAttribute("inert", "")],
    ])("leaves a real key alone when the host %s", async (_case, hostChange) => {
      const platform = select("Platform");
      svg().focus();
      hostChange();
      await userEvent.keyboard("{Backspace}");
      expect(shapeLabels("component")).toEqual(["Platform"]);
      expect(service<Selection>("selection").get()).toEqual([platform]);
    });

    it.each(hostHidings)(
      "leaves a key alone that reaches the focused canvas before the browser moves the focus off it, once the host $how",
      ({ hide }) => {
        const platform = select("Platform");
        pressOnCanvas("ArrowRight");
        const before = modeler.exportDSL();
        hide();
        expect(document.activeElement).toBe(svg());

        for (const [key, modifiers] of [
          ["Backspace", {}],
          ["Delete", {}],
          ["ArrowLeft", {}],
          ["Escape", {}],
          ["c", {}],
          ["l", {}],
          ["a", { metaKey: true }],
          ["z", { metaKey: true }],
          ["d", { metaKey: true }],
        ] as const) {
          expect(pressKey(svg(), key, modifiers).defaultPrevented, key).toBe(false);
        }
        expect(modeler.exportDSL()).toBe(before);
        expect(service<Selection>("selection").get()).toEqual([platform]);
        expect(service<Dragging>("dragging").context()).toBeFalsy();
      },
    );

    it("takes a real key on the focused canvas while the host shows it", async () => {
      select("Platform");
      svg().focus();
      await userEvent.keyboard("{Backspace}");
      expect(shapeLabels("component")).toEqual([]);
    });

    it("leaves a key in an editor the host placed inside the canvas container alone", () => {
      select("Platform");
      const editor = document.createElement("div");
      editor.className = "monaco-editor";
      editor.tabIndex = 0;
      if ("EditContext" in window) {
        (editor as unknown as { editContext: unknown }).editContext = new (
          window as unknown as { EditContext: new () => unknown }
        ).EditContext();
      }
      service<Canvas>("canvas").getContainer().appendChild(editor);
      editor.focus();

      expect(pressKey(editor, "Backspace").defaultPrevented).toBe(false);
      expect(shapeLabels("component")).toEqual(["Platform"]);
    });

    it("leaves a key that composes text (IME) to the composition", () => {
      select("Platform");
      svg().focus();
      const event = new KeyboardEvent("keydown", {
        key: "Backspace",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      svg().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(shapeLabels("component")).toEqual(["Platform"]);
    });

    it("takes a keydown without a key (autofill) without an error", () => {
      select("Platform");
      const button = addHostControl("button");
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener("error", onError);
      try {
        for (const target of [document.body, svg(), button]) {
          target.dispatchEvent(new Event("keydown", { bubbles: true, cancelable: true }));
        }
      } finally {
        window.removeEventListener("error", onError);
      }
      expect(errors).toEqual([]);
      expect(shapeLabels("component")).toEqual(["Platform"]);
    });

    it("ignores keys inside dialogs", () => {
      select("Platform");
      const dialog = addHostControl("div");
      dialog.setAttribute("role", "dialog");
      const close = document.createElement("button");
      dialog.appendChild(close);
      pressKey(close, "Backspace");
      expect(shapeLabels("component")).toEqual(["Platform"]);
    });

    it("still deletes with Backspace when the canvas has focus", () => {
      select("Platform");
      const event = pressKey(svg(), "Backspace");
      expect(event.defaultPrevented).toBe(true);
      expect(shapeLabels("component")).toEqual([]);
    });

    it("does not make the container a second tab stop", () => {
      expect(container.hasAttribute("tabindex")).toBe(false);
      expect(container.querySelector(".djs-container")?.hasAttribute("tabindex")).toBe(false);
    });
  });

  describe("selection keys", () => {
    it("Escape clears the selection", () => {
      select("Platform");
      pressOnCanvas("Escape");
      expect(service<Selection>("selection").get()).toEqual([]);
    });

    it("Escape only closes an open colour picker, keeping the selection", async () => {
      const note = select("Remember the budget");
      service<WardleyColorPicker>("wardleyColorPicker").open(note, 200, 200);
      await nextTask();
      const swatch = document.activeElement as HTMLElement;
      expect(swatch.closest(".wardley-color-picker")).not.toBeNull();
      pressKey(swatch, "Escape");
      expect(container.querySelector(".wardley-color-picker")).toBeNull();
      expect(service<Selection>("selection").get()).toEqual([note]);
    });

    it("leaves an Escape in a host field to the host while the colour picker is open", async () => {
      const note = select("Remember the budget");
      service<WardleyColorPicker>("wardleyColorPicker").open(note, 200, 200);
      await nextTask();
      const field = addHostControl("input");
      const seenByHost: string[] = [];
      field.addEventListener("keydown", (event) => seenByHost.push(event.key));
      field.focus();

      expect(pressKey(field, "Escape").defaultPrevented).toBe(false);
      expect(seenByHost).toEqual(["Escape"]);
      expect(container.querySelector(".wardley-color-picker")).not.toBeNull();
      service<WardleyColorPicker>("wardleyColorPicker").close();
    });

    it.each([
      ["a palette entry", "palette"],
      ["a host button inside the diagram container", "button"],
      ["a host overlay inside the diagram container", "overlay"],
    ] as const)(
      "leaves an Escape on %s to that control while the colour picker is open",
      async (_name, kind) => {
        const note = select("Remember the budget");
        service<WardleyColorPicker>("wardleyColorPicker").open(note, 200, 200);
        await nextTask();
        const diagramContainer = service<Canvas>("canvas").getContainer();
        let target: HTMLElement;
        if (kind === "palette") {
          target = diagramContainer.querySelector<HTMLElement>(
            '.djs-palette .entry[data-action="lasso-tool"]',
          )!;
        } else if (kind === "button") {
          target = document.createElement("button");
          target.textContent = "Share";
          diagramContainer.appendChild(target);
        } else {
          target = document.createElement("div");
          target.tabIndex = 0;
          target.textContent = "2 comments";
          service<Overlays>("overlays").add(note, { position: { top: 0, left: 0 }, html: target });
        }
        const seenByControl: string[] = [];
        target.addEventListener("keydown", (event) => seenByControl.push(event.key));
        target.focus();
        expect(document.activeElement).toBe(target);

        expect(pressKey(target, "Escape").defaultPrevented).toBe(false);
        expect(seenByControl).toEqual(["Escape"]);
        expect(container.querySelector(".wardley-color-picker")).not.toBeNull();
        service<WardleyColorPicker>("wardleyColorPicker").close();
        if (kind === "button") target.remove();
      },
    );

    it("closes an open colour picker on an Escape aimed at the canvas, keeping the selection", async () => {
      const note = select("Remember the budget");
      service<WardleyColorPicker>("wardleyColorPicker").open(note, 200, 200);
      await nextTask();

      expect(pressOnCanvas("Escape").defaultPrevented).toBe(true);
      expect(container.querySelector(".wardley-color-picker")).toBeNull();
      expect(service<Selection>("selection").get()).toEqual([note]);
    });

    it("Cmd/Ctrl+A selects every map element instead of page text", () => {
      const event = pressOnCanvas("a", { metaKey: true });
      expect(event.defaultPrevented).toBe(true);
      const selected = service<Selection>("selection").get();
      const registry = service<ElementRegistry>("elementRegistry");
      const all = registry.filter((el) => isWardleyShape(el) || isWardleyConnection(el));
      expect(selected).toHaveLength(all.length);
      expect(selected.length).toBe(5);
    });
  });

  describe("single-key tools without a pointer", () => {
    it.each([
      ["c", "component", "Component"],
      ["u", "anchor", "User"],
      ["n", "note", "Note"],
      ["p", "pipeline", "Pipeline"],
    ])(
      "%s creates a %s at the visible plot centre and opens its name editor",
      (key, type, label) => {
        pressOnCanvas(key);
        const created = service<Selection>("selection").get()[0] as WardleyShape;
        expect(created.wardleyType).toBe(type);
        expect(created.wardleyLabel).toBe(label);
        expect(labelInput()?.value).toBe(label);
        expect(document.activeElement).toBe(labelInput());

        const viewbox = service<Canvas>("canvas").viewbox();
        const centerX = created.x + created.width / 2;
        expect(centerX).toBeGreaterThan(viewbox.x);
        expect(centerX).toBeLessThan(viewbox.x + viewbox.width);
      },
    );

    it.each(["Enter", "Escape"])(
      "takes the next tool key right after %s in the name editor",
      (closingKey) => {
        pressOnCanvas("p");
        pressKey(labelInput()!, closingKey);
        expect(document.activeElement).toBe(svg());
        pressKey(document.activeElement!, "n");
        expect(shapeLabels("note")).toEqual(["Remember the budget", "Note"]);
      },
    );

    it("typing into the new editor names the element and does not trigger more tools", () => {
      pressOnCanvas("c");
      const field = labelInput()!;
      pressKey(field, "n");
      field.value = "Kettle";
      pressKey(field, "Enter");
      expect(shapeLabels("component")).toEqual(["Platform", "Kettle"]);
      expect(shapeLabels("note")).toEqual(["Remember the budget"]);
    });

    it("steps repeated creates apart instead of stacking them", () => {
      pressOnCanvas("c");
      pressKey(labelInput()!, "Escape");
      pressOnCanvas("c");
      pressKey(labelInput()!, "Escape");
      const registry = service<ElementRegistry>("elementRegistry");
      const first = findByLabel(registry, "Component");
      const second = findByLabel(registry, "Component 2");
      expect(Math.abs(first.y - second.y)).toBeGreaterThan(30);
    });

    it("starts a new column at the plot bottom instead of piling up on the edge", () => {
      for (let index = 0; index < 14; index++) {
        pressOnCanvas("c");
        pressKey(labelInput()!, "Escape");
      }
      const created = service<ElementRegistry>("elementRegistry").filter(
        (el) => isWardleyShape(el) && el.wardleyLabel.startsWith("Component"),
      ) as WardleyShape[];
      const positions = created.map((shape) => `${shape.x},${shape.y}`);
      expect(new Set(positions).size).toBe(created.length);
      const plotBottom = service<EvolutionGrid>("evolutionGrid").toCanvas({
        visibility: 0,
        evolution: 0,
      }).y;
      for (const shape of created) expect(shape.y + shape.height / 2).toBeLessThan(plotBottom);
    });

    it("A starts a connection from the single selected node", () => {
      select("Customer");
      expect(pressOnCanvas("a").defaultPrevented).toBe(true);
      const context = service<Dragging>("dragging").context() as { prefix?: string } | null;
      expect(context?.prefix).toBe("connect");
      service<Dragging>("dragging").cancel(false);
    });

    it("A does nothing for regions or multiple nodes", () => {
      select("pioneers");
      expect(pressOnCanvas("a").defaultPrevented).toBe(false);
      pressOnCanvas("a", { metaKey: true });
      expect(pressOnCanvas("a").defaultPrevented).toBe(false);
      expect(service<Dragging>("dragging").context()).toBeFalsy();
    });
  });

  describe("draw tool keys", () => {
    function drawTool(): WardleyDrawTool {
      return service<WardleyDrawTool>("wardleyDrawTool");
    }

    function placePoint(x: number, y: number): void {
      const rect = svg().getBoundingClientRect();
      const at = { clientX: rect.left + x, clientY: rect.top + y };
      svg().dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...at }),
      );
    }

    function drawings(): number {
      return shapeLabels("drawing").length;
    }

    it("leaves the single-key tools without effect while it holds the points of a line", () => {
      select("Customer");
      drawTool().activate();
      placePoint(300, 300);
      placePoint(420, 360);
      for (const key of ["c", "u", "n", "p", "a", "l"]) {
        expect(pressOnCanvas(key).defaultPrevented).toBe(false);
      }

      expect(service<Dragging>("dragging").context()).toBeFalsy();
      expect(labelInput()).toBeNull();
      expect(shapeLabels("component")).toEqual(["Platform"]);
      expect(shapeLabels("anchor")).toEqual(["Customer"]);
      expect(shapeLabels("note")).toEqual(["Remember the budget"]);
      expect(drawTool().holdsLine()).toBe(true);
      expect(pressOnCanvas("Enter").defaultPrevented).toBe(true);
      expect(drawings()).toBe(1);
      expect(pressOnCanvas("c").defaultPrevented).toBe(true);
      expect(shapeLabels("component")).toEqual(["Platform", "Component"]);
    });

    it("focuses the canvas on the first point, so Enter there finishes the line", () => {
      const title = addHostControl("input");
      title.focus();
      drawTool().activate();
      placePoint(300, 300);
      expect(document.activeElement).toBe(svg());
      placePoint(420, 360);

      expect(pressKey(svg(), "Enter").defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
      expect(drawings()).toBe(1);
    });

    it.each([
      ["a host input", "Enter", "input"],
      ["a host input", "Escape", "input"],
      ["a host button", "Enter", "button"],
      ["an open host menu", "Escape", "menu"],
    ] as const)("leaves %s its %s while drawing", (_name, key, kind) => {
      drawTool().activate();
      placePoint(300, 300);
      placePoint(420, 360);
      let control: HTMLElement;
      if (kind === "menu") {
        const menu = addHostControl("div");
        menu.setAttribute("role", "menu");
        control = document.createElement("button");
        control.setAttribute("role", "menuitem");
        menu.appendChild(control);
      } else {
        control = addHostControl(kind);
      }
      const seenByHost: string[] = [];
      control.addEventListener("keydown", (event) => seenByHost.push(event.key));
      control.focus();

      expect(pressKey(control, key).defaultPrevented).toBe(false);
      expect(seenByHost).toEqual([key]);
      expect(drawTool().isActive()).toBe(true);
      expect(drawings()).toBe(0);
      drawTool().cancel();
    });

    it.each(["a Monaco editor", "an EditContext editor"] as const)(
      "leaves Enter and Escape to %s the host placed inside the canvas container",
      (kind) => {
        drawTool().activate();
        placePoint(300, 300);
        placePoint(420, 360);
        const editor = document.createElement("div");
        const input = document.createElement("div");
        input.tabIndex = 0;
        if (kind === "a Monaco editor") {
          editor.className = "monaco-editor";
        } else {
          (input as unknown as { editContext: unknown }).editContext = new (
            window as unknown as { EditContext: new () => unknown }
          ).EditContext();
        }
        editor.appendChild(input);
        service<Canvas>("canvas").getContainer().appendChild(editor);
        input.focus();

        expect(pressKey(input, "Enter").defaultPrevented).toBe(false);
        expect(pressKey(input, "Escape").defaultPrevented).toBe(false);
        expect(drawTool().isActive()).toBe(true);
        expect(drawings()).toBe(0);
        drawTool().cancel();
        editor.remove();
      },
    );

    it("still cancels with Escape on the palette entry that started it with Enter", () => {
      const entry = container.querySelector<HTMLElement>(
        '.djs-palette .entry[data-action="draw-tool"]',
      )!;
      entry.focus();
      pressKey(entry, "Enter");
      expect(drawTool().isActive()).toBe(true);
      expect(document.activeElement).toBe(entry);

      expect(pressKey(entry, "Escape").defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
    });

    it.each(hostHidings)(
      "leaves Escape on the palette entry that started it to the page once the host $how",
      ({ hide, show }) => {
        const entry = drawEntry(container);
        entry.focus();
        pressKey(entry, "Enter");
        expect(drawTool().isActive()).toBe(true);
        hide();
        expect(document.activeElement).toBe(entry);

        expect(pressKey(entry, "Escape").defaultPrevented).toBe(false);
        expect(drawTool().isActive()).toBe(true);
        show();
        expect(pressKey(entry, "Escape").defaultPrevented).toBe(true);
        expect(drawTool().isActive()).toBe(false);
      },
    );

    it.each(hostHidings)(
      "keeps the line it holds when Enter, Space or Escape reach its palette entry once the host $how",
      ({ hide, show }) => {
        const entry = drawEntry(container);
        drawTool().activate();
        placePoint(300, 300);
        placePoint(420, 360);
        entry.focus();
        hide();
        expect(document.activeElement).toBe(entry);

        for (const key of ["Enter", " ", "Escape"]) {
          expect(pressKey(entry, key).defaultPrevented, key).toBe(false);
        }
        expect(drawTool().holdsLine()).toBe(true);
        expect(drawings()).toBe(0);

        show();
        expect(pressKey(entry, "Escape").defaultPrevented).toBe(true);
        expect(drawTool().isActive()).toBe(false);
        expect(drawings()).toBe(1);
      },
    );

    function drawEntry(root: ParentNode): HTMLElement {
      return root.querySelector<HTMLElement>('.djs-palette .entry[data-action="draw-tool"]')!;
    }

    /**
     * Host chrome inside the diagram container: a target check against the whole container took
     * its Enter and Escape.
     */
    function hostTargetInsideContainer(kind: "button" | "overlay" | "zoom"): HTMLElement {
      const diagramContainer = service<Canvas>("canvas").getContainer();
      if (kind === "button") {
        const button = document.createElement("button");
        button.textContent = "Share";
        diagramContainer.appendChild(button);
        return button;
      }
      if (kind === "overlay") {
        const marker = document.createElement("div");
        marker.tabIndex = 0;
        marker.textContent = "2 comments";
        const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
        service<Overlays>("overlays").add(platform, {
          position: { top: 0, left: 0 },
          html: marker,
        });
        return marker;
      }
      const zoomPanel = document.createElement("div");
      zoomPanel.className = "cd-shell-zoom";
      zoomPanel.setAttribute("role", "group");
      zoomPanel.setAttribute("aria-label", "Zoom");
      const zoomIn = document.createElement("button");
      zoomIn.setAttribute("aria-label", "Zoom in");
      zoomPanel.appendChild(zoomIn);
      diagramContainer.appendChild(zoomPanel);
      return zoomIn;
    }

    it.each([
      ["a host button inside the diagram container", "button"],
      ["a focusable element in an overlay next to the canvas", "overlay"],
      ["a zoom panel inside the diagram container", "zoom"],
      ["<body>", "body"],
    ] as const)("leaves Enter and Escape on %s to the page while drawing", (_name, kind) => {
      drawTool().activate();
      placePoint(300, 300);
      placePoint(420, 360);
      let target: HTMLElement;
      if (kind === "body") {
        target = document.body;
        (document.activeElement as HTMLElement | null)?.blur();
      } else {
        target = hostTargetInsideContainer(kind);
        target.focus();
      }
      expect(document.activeElement).toBe(target);
      const reachedWindow: string[] = [];
      const onWindowKeydown = (event: KeyboardEvent) => reachedWindow.push(event.key);
      window.addEventListener("keydown", onWindowKeydown);
      try {
        expect(pressKey(target, "Enter").defaultPrevented).toBe(false);
        expect(pressKey(target, "Escape").defaultPrevented).toBe(false);
      } finally {
        window.removeEventListener("keydown", onWindowKeydown);
      }

      expect(reachedWindow).toEqual(["Enter", "Escape"]);
      expect(drawTool().isActive()).toBe(true);
      expect(drawings()).toBe(0);
      expect(pressOnCanvas("Enter").defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
      expect(drawings()).toBe(1);
    });

    it.each([
      ["the canvas <svg>", "Enter", "canvas"],
      ["the canvas <svg>", "Escape", "canvas"],
      ["a shape inside the canvas <svg>", "Enter", "shape"],
      ["a shape inside the canvas <svg>", "Escape", "shape"],
      ["the palette entry that starts the tool", "Enter", "entry"],
      ["the palette entry that starts the tool", "Escape", "entry"],
    ] as const)("ends the drawing with a key on %s (%s)", (_name, key, kind) => {
      drawTool().activate();
      placePoint(300, 300);
      placePoint(420, 360);
      const registry = service<ElementRegistry>("elementRegistry");
      const entry = drawEntry(container);
      const target: globalThis.Element = {
        canvas: svg(),
        shape: registry.getGraphics(findByLabel(registry, "Platform")),
        entry,
      }[kind];
      if (kind === "entry") entry.focus();
      else svg().focus();

      expect(pressKey(target, key).defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
      expect(drawings()).toBe(1);
    });

    it.each(hostHidings)(
      "leaves Enter and Escape on the focused canvas to the page once the host $how",
      ({ hide, show }) => {
        drawTool().activate();
        placePoint(300, 300);
        placePoint(420, 360);
        svg().focus();
        hide();
        expect(document.activeElement).toBe(svg());

        expect(pressKey(svg(), "Enter").defaultPrevented).toBe(false);
        expect(pressKey(svg(), "Escape").defaultPrevented).toBe(false);
        expect(drawTool().isActive()).toBe(true);
        expect(drawings()).toBe(0);
        show();
        expect(pressOnCanvas("Enter").defaultPrevented).toBe(true);
        expect(drawings()).toBe(1);
      },
    );

    it("leaves Enter and Escape on another entry of its own palette to the palette", () => {
      drawTool().activate();
      placePoint(300, 300);
      placePoint(420, 360);
      const lassoEntry = container.querySelector<HTMLElement>(
        '.djs-palette .entry[data-action="lasso-tool"]',
      )!;
      lassoEntry.focus();
      const reachedWindow: string[] = [];
      const onWindowKeydown = (event: KeyboardEvent) => reachedWindow.push(event.key);
      window.addEventListener("keydown", onWindowKeydown);
      try {
        expect(pressKey(lassoEntry, "Escape").defaultPrevented).toBe(false);
        expect(drawTool().isActive()).toBe(true);
        // The palette's own keyboard takes Enter and activates the entry it is aimed at.
        expect(pressKey(lassoEntry, "Enter").defaultPrevented).toBe(true);
      } finally {
        window.removeEventListener("keydown", onWindowKeydown);
      }

      expect(reachedWindow).toEqual(["Escape"]);
      const dragging = service<Dragging>("dragging");
      expect((dragging.context() as { prefix?: string } | null)?.prefix).toBe("lasso.selection");
      dragging.cancel(false);
      expect(drawTool().isActive()).toBe(true);
      expect(drawings()).toBe(0);
      expect(pressOnCanvas("Enter").defaultPrevented).toBe(true);
      expect(drawTool().isActive()).toBe(false);
      expect(drawings()).toBe(1);
    });

    it("leaves Enter and Escape on another modeler's draw entry to that modeler", async () => {
      const otherContainer = addHostControl("div");
      otherContainer.style.width = "640px";
      otherContainer.style.height = "480px";
      const other = new Modeler({ container: otherContainer });
      try {
        await other.importDSL(DSL);
        drawTool().activate();
        placePoint(300, 300);
        placePoint(420, 360);
        const otherEntry = drawEntry(otherContainer);
        otherEntry.focus();

        expect(pressKey(otherEntry, "Escape").defaultPrevented).toBe(false);
        pressKey(otherEntry, "Enter");
        expect(other.get<WardleyDrawTool>("wardleyDrawTool").isActive()).toBe(true);
        expect(drawTool().isActive()).toBe(true);
        expect(drawings()).toBe(0);
      } finally {
        other.destroy();
      }
    });
  });

  describe("undo/redo ownership", () => {
    it("handles Cmd+Z by default", () => {
      const platform = select("Platform");
      const x = platform.x;
      service<Modeling>("modeling").moveShape(platform, { x: 40, y: 0 });
      expect(pressOnCanvas("z", { metaKey: true }).defaultPrevented).toBe(true);
      expect(platform.x).toBeCloseTo(x, 1);
    });

    it("leaves Cmd+Z/Shift+Z/Y to the host with undoRedoKeys false", async () => {
      modeler.destroy();
      modeler = new Modeler({ container, undoRedoKeys: false });
      await modeler.importDSL(DSL);
      const platform = select("Platform");
      service<Modeling>("modeling").moveShape(platform, { x: 40, y: 0 });
      const moved = platform.x;

      expect(pressOnCanvas("z", { metaKey: true }).defaultPrevented).toBe(false);
      expect(pressOnCanvas("z", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
      expect(pressOnCanvas("y", { metaKey: true }).defaultPrevented).toBe(false);
      expect(platform.x).toBe(moved);
      expect(modeler.canUndo()).toBe(true);
    });
  });

  describe("copy naming", () => {
    it("duplicates 'Cup 2' to 'Cup 3' and keeps note texts", async () => {
      await modeler.importDSL(`title Copy
component Cup [0.5, 0.5]
component Cup 2 [0.4, 0.4]
note Cup 2 [0.3, 0.3]`);
      const registry = service<ElementRegistry>("elementRegistry");
      const copies = registry.filter((el) => isWardleyShape(el) && el.wardleyLabel === "Cup 2");
      expect(copies).toHaveLength(2);
      service<Selection>("selection").select(copies);
      pressOnCanvas("d", { metaKey: true });
      expect(shapeLabels("component").sort()).toEqual(["Cup", "Cup 2", "Cup 3"]);
      expect(shapeLabels("note")).toEqual(["Cup 2", "Cup 2"]);
    });

    const ANCHORED_PIPELINE = `title Pipeline copy
component Platform [0.6, 0.5]
pipeline Platform [0.3, 0.8]
{
  component A [0.4]
  component B [0.7]
}`;

    function pipelineGroups(): Record<string, string[]> {
      const map = modeler.exportMap();
      const groups: Record<string, string[]> = {};
      for (const pipeline of map.elements.filter((el) => el.elementType === "pipeline")) {
        groups[pipeline.label] = map.elements
          .filter((el) => el.elementType === "component" && el.pipelineId === pipeline.id)
          .map((el) => el.label)
          .sort();
      }
      return groups;
    }

    it("duplicates a pipeline with its anchor as a new anchored group", async () => {
      await modeler.importDSL(ANCHORED_PIPELINE);
      pressOnCanvas("a", { metaKey: true });
      pressOnCanvas("d", { metaKey: true });

      expect(pipelineGroups()).toEqual({
        Platform: ["A", "B"],
        "Platform 2": ["A 2", "B 2"],
      });
      const dsl = modeler.exportDSL();
      expect(dsl).toMatch(/^component Platform 2 \[/mu);
      expect(dsl).toMatch(/^pipeline Platform 2 \[[^\]]+\]$/mu);
    });

    it("pastes a pipeline with its anchor as a new anchored group", async () => {
      await modeler.importDSL(ANCHORED_PIPELINE);
      pressOnCanvas("a", { metaKey: true });
      service<WardleyCopyPaste>("wardleyCopyPaste").copy();
      const dragging = service<Dragging>("dragging");
      dragging.setOptions({ manual: true });
      service<WardleyCopyPaste>("wardleyCopyPaste").paste();
      placeActiveCreate({ x: 400, y: 600 });
      await nextTask();

      expect(pipelineGroups()).toEqual({
        Platform: ["A", "B"],
        "Platform 2": ["A 2", "B 2"],
      });
      expect(modeler.exportDSL()).toMatch(/^pipeline Platform 2 \[[^\]]+\]$/mu);
    });

    it("does not open the name editor for pasted copies", async () => {
      select("Platform");
      service<WardleyCopyPaste>("wardleyCopyPaste").copy();
      const dragging = service<Dragging>("dragging");
      dragging.setOptions({ manual: true });
      service<WardleyCopyPaste>("wardleyCopyPaste").paste();
      placeActiveCreate({ x: 300, y: 300 });
      await nextTask();
      expect(shapeLabels("component")).toEqual(["Platform", "Platform 2"]);
      expect(labelInput()).toBeNull();
    });
  });

  describe("paste ownership (element clipboard vs. system clipboard)", () => {
    function copyWithKeyboard(label: string): void {
      select(label);
      pressOnCanvas("c", { metaKey: true });
    }

    function pasteIsAttachedToCursor(): boolean {
      return !!service<Dragging>("dragging").context();
    }

    afterEach(() => service<Dragging>("dragging").cancel(true));

    it("pastes copied elements right away while they are the newest clipboard content", () => {
      copyWithKeyboard("Platform");
      const event = pressOnCanvas("v", { metaKey: true });
      expect(event.defaultPrevented).toBe(true);
      expect(pasteIsAttachedToCursor()).toBe(true);
    });

    it("lets the host consume a newer system clipboard paste after the window lost focus", async () => {
      copyWithKeyboard("Platform");
      window.dispatchEvent(new Event("blur"));
      const keydown = pressOnCanvas("v", { metaKey: true });
      expect(keydown.defaultPrevented).toBe(false);
      const consume = (e: Event) => e.preventDefault();
      document.addEventListener("paste", consume, { once: true });
      document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true }));
      await nextTask();
      expect(pasteIsAttachedToCursor()).toBe(false);
    });

    it("still pastes the copied elements when the host leaves the paste alone", async () => {
      copyWithKeyboard("Platform");
      document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true }));
      pressOnCanvas("v", { metaKey: true });
      document.body.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true }));
      await nextTask();
      expect(pasteIsAttachedToCursor()).toBe(true);
    });
  });

  /** Finishes the running create drag at a diagram point (manual dragging mode). */
  function placeActiveCreate(point: { x: number; y: number }): void {
    const canvas = service<Canvas>("canvas");
    const dragging = service<Dragging>("dragging");
    const viewbox = canvas.viewbox();
    const rect = canvas.getContainer().getBoundingClientRect();
    const root = canvas.getRootElement();
    const event = new MouseEvent("mousemove", {
      clientX: rect.left + (point.x - viewbox.x) * viewbox.scale,
      clientY: rect.top + (point.y - viewbox.y) * viewbox.scale,
    });
    dragging.hover({ element: root, gfx: canvas.getGraphics(root as unknown as Shape) });
    dragging.move(event, false);
    dragging.end(event);
  }

  describe("name editor after placing from the palette", () => {
    it.each([
      ["component", "Component"],
      ["note", "Note"],
    ] as const)("opens for a %s with the placeholder selected", async (type, label) => {
      service<Dragging>("dragging").setOptions({ manual: true });
      const shape = service<WardleyElementFactory>("wardleyElementFactory").createNew(type, label);
      service<Create>("create").start(new MouseEvent("mousedown"), shape as unknown as Shape);
      placeActiveCreate({ x: 500, y: 400 });
      await nextTask();

      const field = labelInput()!;
      expect(field.value).toBe(label);
      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(label.length);
      field.value = "Named";
      pressKey(field, "Enter", { metaKey: type === "note" });
      expect(shapeLabels(type)).toContain("Named");
    });

    it("does not open for regions", async () => {
      service<Dragging>("dragging").setOptions({ manual: true });
      const region = service<WardleyElementFactory>("wardleyElementFactory").createNew(
        "attitude",
        "Settlers",
        { attitudeKind: "settlers" },
      );
      service<Create>("create").start(new MouseEvent("mousedown"), region as unknown as Shape);
      placeActiveCreate({ x: 500, y: 400 });
      await nextTask();
      expect(labelInput()).toBeNull();
      expect(shapeLabels("attitude")).toContain("settlers");
    });
  });

  describe("in-place editor", () => {
    function labelEditing(): WardleyLabelEditing {
      return service<WardleyLabelEditing>("wardleyLabelEditing");
    }

    it("hides the label it replaces and sits on top of it", () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      const gfx = service<Canvas>("canvas").getGraphics(platform);
      const nameText = [...gfx.querySelectorAll("text")].find(
        (text) => text.textContent === "Platform",
      )!;
      const labelBox = nameText.getBoundingClientRect();
      labelEditing().activate(platform);

      expect(getComputedStyle(nameText).visibility).toBe("hidden");
      const fieldBox = labelInput()!.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(labelBox.left);
      expect(fieldBox.right).toBeGreaterThanOrEqual(labelBox.right);
      expect(fieldBox.top).toBeLessThanOrEqual(labelBox.top + 2);
      expect(fieldBox.bottom).toBeGreaterThanOrEqual(labelBox.bottom - 2);

      pressKey(labelInput()!, "Escape");
      expect(getComputedStyle(nameText).visibility).toBe("visible");
    });

    it("scales the font with the zoom and grows with the text", () => {
      service<Canvas>("canvas").zoom(2);
      labelEditing().activate(findByLabel(service<ElementRegistry>("elementRegistry"), "Platform"));
      const field = labelInput()!;
      expect(getComputedStyle(field).fontSize).toBe("26px");
      const narrow = field.getBoundingClientRect().width;
      field.value = "Platform with a considerably longer name";
      field.dispatchEvent(new Event("input"));
      expect(field.getBoundingClientRect().width).toBeGreaterThan(narrow * 2);
    });

    it("copies the label's weight and alignment (centred bold user label)", () => {
      const customer = findByLabel(service<ElementRegistry>("elementRegistry"), "Customer");
      const nameText = [
        ...service<Canvas>("canvas").getGraphics(customer).querySelectorAll("text"),
      ].find((text) => text.textContent === "Customer")!;
      const labelBox = nameText.getBoundingClientRect();
      labelEditing().activate(customer);
      const field = labelInput()!;

      expect(getComputedStyle(field).fontWeight).toBe("700");
      expect(getComputedStyle(field).textAlign).toBe("center");
      const fieldBox = field.getBoundingClientRect();
      const labelCenter = labelBox.left + labelBox.width / 2;
      expect(Math.abs(fieldBox.left + fieldBox.width / 2 - labelCenter)).toBeLessThan(1);
    });

    it("edits notes over their own box with a save hint", () => {
      const note = findByLabel(service<ElementRegistry>("elementRegistry"), "Remember the budget");
      const noteBox = service<Canvas>("canvas").getGraphics(note).getBoundingClientRect();
      labelEditing().activate(note);
      const field = labelInput()!;
      expect(field.tagName).toBe("TEXTAREA");
      const fieldBox = field.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(noteBox.left + 1);
      expect(fieldBox.right).toBeGreaterThanOrEqual(noteBox.right - 1);
      expect(document.querySelector(".wardley-label-hint")?.textContent).toBe(
        "Cmd/Ctrl+Enter to save · Esc to cancel",
      );
      pressKey(field, "Escape");
      expect(document.querySelector(".wardley-label-hint")).toBeNull();
    });

    it("does not edit regions", () => {
      labelEditing().activate(findByLabel(service<ElementRegistry>("elementRegistry"), "pioneers"));
      expect(labelInput()).toBeNull();
    });

    it.each(["Enter", "Escape"])("hands focus back to the canvas after %s", async (key) => {
      const platform = select("Platform");
      labelEditing().activate(platform);
      pressKey(labelInput()!, key);
      expect(labelInput()).toBeNull();
      await nextTask();
      expect(document.activeElement).toBe(svg());
      expect(container.querySelector(".djs-context-pad.open")).not.toBeNull();
    });

    it("exposes the open edit to hosts and cancels it", () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      expect(labelEditing().getActiveEdit()).toBeNull();
      labelEditing().activate(platform, { value: "Platform v2" });
      expect(labelEditing().getActiveEdit()).toMatchObject({
        elementId: platform.id,
        value: "Platform v2",
      });
      labelEditing().cancel();
      expect(labelInput()).toBeNull();
      expect(platform.wardleyLabel).toBe("Platform");
    });
  });

  describe("a view change while an editor is open (a host restoring or fitting the view)", () => {
    const afterViewChange = () => new Promise((resolve) => queueMicrotask(() => resolve(null)));

    function nameText(shape: WardleyShape): SVGTextElement {
      return [...service<Canvas>("canvas").getGraphics(shape).querySelectorAll("text")].find(
        (text) => text.textContent === shape.wardleyLabel,
      )!;
    }

    it("keeps the name editor open with the typed text and moves it with the label", async () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      const before = modeler.exportDSL();
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      const field = labelInput()!;
      field.value = "Plat";
      const changes: unknown[] = [];
      service<EventBus>("eventBus").on("commandStack.changed", (event: unknown) => {
        changes.push(event);
      });

      const canvas = service<Canvas>("canvas");
      const viewbox = canvas.viewbox();
      canvas.viewbox({ x: viewbox.x + 120, y: viewbox.y + 80, width: 640, height: 480 });
      await afterViewChange();

      expect(labelInput()).toBe(field);
      expect(field.value).toBe("Plat");
      expect(document.activeElement).toBe(field);
      expect(changes).toEqual([]);
      expect(modeler.exportDSL()).toBe(before);
      const labelBox = nameText(platform).getBoundingClientRect();
      const fieldBox = field.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(labelBox.left);
      expect(fieldBox.right).toBeGreaterThanOrEqual(labelBox.right);
      expect(
        Math.abs(fieldBox.top + fieldBox.height / 2 - (labelBox.top + labelBox.height / 2)),
      ).toBeLessThan(2);

      field.value = "Platform Services";
      pressKey(field, "Enter");
      expect(modeler.exportDSL()).toContain("component Platform Services [0.55, 0.62]");
    });

    it("scales the open name editor with a zoom", async () => {
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(
        findByLabel(service<ElementRegistry>("elementRegistry"), "Platform"),
      );
      service<Canvas>("canvas").zoom(2);
      await afterViewChange();
      expect(getComputedStyle(labelInput()!).fontSize).toBe("26px");
    });

    // Zoomed in, so the pan constraint leaves the scrolled view where it is.
    const zoomIn = () => {
      const canvas = service<Canvas>("canvas");
      const { width, height } = canvas.getSize();
      canvas.zoom(1.5, { x: width / 2, y: height / 2 });
    };

    it("keeps an open link annotation editor and moves it by the scroll", async () => {
      zoomIn();
      const link = service<ElementRegistry>("elementRegistry").find(isWardleyConnection)!;
      service<WardleyLabelEditing>("wardleyLabelEditing").activateConnection(link as never);
      const field = labelInput()!;
      field.value = "needs rev";
      const at = field.getBoundingClientRect();

      service<Canvas>("canvas").scroll({ dx: 50, dy: 30 });
      await afterViewChange();

      expect(labelInput()).toBe(field);
      expect(field.value).toBe("needs rev");
      expect(field.getBoundingClientRect().left - at.left).toBeCloseTo(50, 0);
      expect(field.getBoundingClientRect().top - at.top).toBeCloseTo(30, 0);
      expect(modeler.exportDSL()).not.toContain("needs rev");
    });

    it("keeps an open link address editor and moves it by the scroll", async () => {
      zoomIn();
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      const before = modeler.exportDSL();
      service<WardleyLinkEditing>("wardleyLinkEditing").activate(platform);
      const field = document.querySelector<HTMLInputElement>(".wardley-link-input")!;
      field.value = "https://exa";
      field.setSelectionRange(4, 4);
      const at = field.getBoundingClientRect();

      service<Canvas>("canvas").scroll({ dx: 40, dy: 25 });
      await afterViewChange();

      expect(document.querySelector(".wardley-link-input")).toBe(field);
      expect(service<WardleyLinkEditing>("wardleyLinkEditing").getActiveEdit()).toEqual({
        elementId: platform.id,
        value: "https://exa",
        selection: { start: 4, end: 4 },
      });
      expect(field.getBoundingClientRect().left - at.left).toBeCloseTo(40, 0);
      expect(field.getBoundingClientRect().top - at.top).toBeCloseTo(25, 0);
      expect(modeler.exportDSL()).toBe(before);
    });

    it("moves the name editor with its label when a host resize redraws the element", async () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      const field = labelInput()!;
      field.value = "Platform servic";
      const labelBefore = nameText(platform);

      await modeler.setMapSize(1500, 950);
      expect(nameText(platform)).not.toBe(labelBefore);
      service<Canvas>("canvas").zoom(1.5);
      await afterViewChange();

      expect(labelInput()).toBe(field);
      expect(field.value).toBe("Platform servic");
      const labelBox = nameText(platform).getBoundingClientRect();
      const fieldBox = field.getBoundingClientRect();
      expect(fieldBox.left).toBeLessThanOrEqual(labelBox.left);
      expect(fieldBox.right).toBeGreaterThanOrEqual(labelBox.right);
      expect(
        Math.abs(fieldBox.top + fieldBox.height / 2 - (labelBox.top + labelBox.height / 2)),
      ).toBeLessThan(2);
    });

    it("moves the link annotation and link address editors with a redraw of their element", async () => {
      const registry = service<ElementRegistry>("elementRegistry");
      const canvas = service<Canvas>("canvas");
      const link = registry.find(isWardleyConnection) as WardleyConnection;
      const platform = findByLabel(registry, "Platform");
      const offsetFrom = (field: HTMLElement | null, element: WardleyShape | WardleyConnection) => {
        const fieldBox = field!.getBoundingClientRect();
        const box = canvas.getGraphics(element).getBoundingClientRect();
        return {
          x: fieldBox.left - (box.left + box.width / 2),
          y: fieldBox.top - (box.top + box.height / 2),
        };
      };

      service<WardleyLabelEditing>("wardleyLabelEditing").activateConnection(link);
      const annotation = offsetFrom(labelInput(), link);
      await modeler.setMapSize(1500, 950);
      expect(offsetFrom(labelInput(), link).x).toBeCloseTo(annotation.x, 0);
      expect(offsetFrom(labelInput(), link).y).toBeCloseTo(annotation.y, 0);
      service<WardleyLabelEditing>("wardleyLabelEditing").cancel();

      service<WardleyLinkEditing>("wardleyLinkEditing").activate(platform);
      const address = () => document.querySelector<HTMLElement>(".wardley-link-input");
      const before = offsetFrom(address(), platform);
      await modeler.setMapSize(1100, 700);
      expect(offsetFrom(address(), platform).x).toBeCloseTo(before.x, 0);
      expect(offsetFrom(address(), platform).y).toBeCloseTo(before.y, 0);
    });

    it("still commits on a click on the canvas", () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      labelInput()!.value = "Payments";
      const rect = svg().getBoundingClientRect();
      const at = { bubbles: true, button: 0, clientX: rect.left + 8, clientY: rect.top + 8 };
      svg().dispatchEvent(new MouseEvent("mousedown", at));
      document.dispatchEvent(new MouseEvent("mouseup", at));
      expect(labelInput()).toBeNull();
      expect(modeler.exportDSL()).toContain("component Payments [0.55, 0.62]");
    });
  });

  describe("duplicate names", () => {
    it("keeps the editor open with an inline error on Enter", () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      const field = labelInput()!;
      field.value = "Customer";
      pressKey(field, "Enter");

      expect(labelInput()).toBe(field);
      expect(field.classList.contains("wardley-label-input--error")).toBe(true);
      expect(document.querySelector(".wardley-label-error")?.textContent).toBe(
        "“Customer” already exists. Names must be unique because links refer to them.",
      );
      expect(platform.wardleyLabel).toBe("Platform");

      field.value = "Customer Platform";
      field.dispatchEvent(new Event("input"));
      expect(document.querySelector(".wardley-label-error")).toBeNull();
      pressKey(field, "Enter");
      expect(platform.wardleyLabel).toBe("Customer Platform");
    });

    it("applies a free variant and tells the host when focus leaves", () => {
      const deduplicated: LabelDeduplicatedEvent[] = [];
      service<EventBus>("eventBus").on("wardley.label.deduplicated", (event: unknown) => {
        deduplicated.push(event as LabelDeduplicatedEvent);
      });
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      const field = labelInput()!;
      field.value = "Customer";
      field.blur();

      expect(platform.wardleyLabel).toBe("Customer 2");
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]).toMatchObject({ requested: "Customer", applied: "Customer 2" });
      expect(deduplicated[0]!.element).toBe(platform);
    });

    it("lets notes repeat names", () => {
      const note = findByLabel(service<ElementRegistry>("elementRegistry"), "Remember the budget");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(note);
      const field = labelInput()!;
      field.value = "Platform";
      pressKey(field, "Enter", { metaKey: true });
      expect(note.wardleyLabel).toBe("Platform");
    });
  });

  it("commits open name and link-annotation edits for the host", () => {
    const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
    const labelEditing = service<WardleyLabelEditing>("wardleyLabelEditing");
    labelEditing.activate(platform);
    labelInput()!.value = "Payments";
    modeler.commitPendingEdits();
    expect(labelInput()).toBeNull();
    expect(modeler.exportDSL()).toContain("component Payments [0.55, 0.62]");

    const link = service<ElementRegistry>("elementRegistry").find(isWardleyConnection)!;
    labelEditing.activateConnection(link as never);
    labelInput()!.value = "needs review";
    modeler.commitPendingEdits();
    expect(modeler.exportDSL()).toContain("Customer -> Payments; needs review");
  });

  describe("focus after naming", () => {
    function renameWithEnter(label: string, next: string): void {
      const shape = findByLabel(service<ElementRegistry>("elementRegistry"), label);
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(shape);
      const field = labelInput()!;
      field.value = next;
      pressKey(field, "Enter");
    }

    it("shows no focus ring around the canvas after a pointer-opened edit", () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      renameWithEnter("Platform", "Payments");
      expect(document.activeElement).toBe(svg());
      expect(svg().matches(":focus-visible")).toBe(false);
    });

    it("keeps the focus ring after a keyboard-opened edit", async () => {
      pressKey(document.body, "Shift");
      renameWithEnter("Platform", "Payments");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(svg());
      expect(svg().matches(":focus-visible")).toBe(true);
    });

    function editSelectedLink(): WardleyConnection {
      const link = service<ElementRegistry>("elementRegistry").find(
        isWardleyConnection,
      ) as WardleyConnection;
      service<Selection>("selection").select(link);
      service<WardleyLabelEditing>("wardleyLabelEditing").activateConnection(link);
      labelInput()!.value = "needs review";
      return link;
    }

    it.each(["Enter", "Escape"])(
      "takes the next canvas key right after %s in the link annotation editor",
      (closingKey) => {
        const link = editSelectedLink();
        pressKey(labelInput()!, closingKey);
        expect(labelInput()).toBeNull();
        expect(document.activeElement).toBe(svg());

        expect(pressKey(document.activeElement!, "Backspace").defaultPrevented).toBe(true);
        expect(service<ElementRegistry>("elementRegistry").get(link.id)).toBeUndefined();
      },
    );

    it("shows no focus ring around the canvas after a pointer-opened link annotation edit", () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      editSelectedLink();
      pressKey(labelInput()!, "Enter");
      expect(modeler.exportDSL()).toContain("Customer -> Platform; needs review");
      expect(document.activeElement).toBe(svg());
      expect(svg().matches(":focus-visible")).toBe(false);
    });
  });

  describe("editor state across a re-import (external edit)", () => {
    const CHANGED = `${DSL}\n// added in the text editor`;
    const CUSTOMER = "anchor Customer [0.95, 0.45]";
    const CUSTOMER_MOVED = "anchor Customer [0.9, 0.4]";
    const MOVED_BY_PEER = DSL.replace(CUSTOMER, CUSTOMER_MOVED);

    async function reimport(text: string): Promise<void> {
      const state = setAsideEditorState(modeler);
      await modeler.importDSL(text);
      restoreEditorState(modeler, state);
    }

    /** What a key press does in a text field: replaces the selection and leaves the caret after it. */
    function typeAtCaret(field: HTMLInputElement | HTMLTextAreaElement, text: string): void {
      field.setRangeText(text, field.selectionStart ?? 0, field.selectionEnd ?? 0, "end");
    }

    it("keeps the selection and the typed name with its caret", async () => {
      const platform = select("Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      const field = labelInput()!;
      field.value = "Bee";
      field.setSelectionRange(3, 3);

      await reimport(CHANGED);

      const restored = labelInput()!;
      expect(restored.value).toBe("Bee");
      expect([restored.selectionStart, restored.selectionEnd]).toEqual([3, 3]);
      expect(document.activeElement).toBe(restored);
      restored.setRangeText("s", 3, 3, "end");
      pressKey(restored, "Enter");
      expect(modeler.exportDSL()).toContain("component Bees [0.55, 0.62]");
    });

    it("keeps an open link annotation editor with its caret, matched by its ends", async () => {
      const link = service<ElementRegistry>("elementRegistry").find(isWardleyConnection)!;
      service<WardleyLabelEditing>("wardleyLabelEditing").activateConnection(link as never);
      const field = labelInput()!;
      field.value = "needs revie";
      field.setSelectionRange(11, 11);

      await reimport(MOVED_BY_PEER);

      const restored = labelInput()!;
      expect(restored.value).toBe("needs revie");
      expect([restored.selectionStart, restored.selectionEnd]).toEqual([11, 11]);
      typeAtCaret(restored, "w");
      pressKey(restored, "Enter");
      expect(modeler.exportDSL()).toContain("Customer -> Platform; needs review");
    });

    it("keeps an open link address editor with its caret", async () => {
      const platform = select("Platform");
      service<WardleyLinkEditing>("wardleyLinkEditing").activate(platform);
      const field = linkInput()!;
      field.value = "https://example.com/te";
      field.setSelectionRange(22, 22);

      await reimport(MOVED_BY_PEER);

      const restored = linkInput()!;
      expect(restored.value).toBe("https://example.com/te");
      expect([restored.selectionStart, restored.selectionEnd]).toEqual([22, 22]);
      expect(document.activeElement).toBe(restored);
      typeAtCaret(restored, "a");
      pressKey(restored, "Enter");
      const exported = modeler.exportDSL();
      expect(exported).toContain("url Platform URL [https://example.com/tea]");
      expect(exported).toContain(CUSTOMER_MOVED);
    });

    it("selects a stored address on open and keeps a part selected across a re-import", async () => {
      const platform = select("Platform");
      const linkEditing = service<WardleyLinkEditing>("wardleyLinkEditing");
      linkEditing.setLink(platform, "https://example.com/tea");
      linkEditing.activate(platform);
      const field = linkInput()!;
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, 23]);
      field.setSelectionRange(20, 23);

      await reimport(modeler.exportDSL().replace(CUSTOMER, CUSTOMER_MOVED));

      const restored = linkInput()!;
      expect(restored.value).toBe("https://example.com/tea");
      expect([restored.selectionStart, restored.selectionEnd]).toEqual([20, 23]);
      typeAtCaret(restored, "cup");
      pressKey(restored, "Enter");
      const exported = modeler.exportDSL();
      expect(exported).toContain("url Platform URL [https://example.com/cup]");
      expect(exported).toContain(CUSTOMER_MOVED);
    });

    it("selects what still exists and focuses the canvas when the edited element is gone", async () => {
      select("Customer");
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);

      await reimport(
        DSL.replace("component Platform [0.55, 0.62]\n", "").replace("Customer -> Platform", ""),
      );

      expect(labelInput()).toBeNull();
      expect(document.activeElement).toBe(svg());
    });

    it("keeps the selection of an element created on the canvas, by its id in the document", async () => {
      const factory = service<WardleyElementFactory>("wardleyElementFactory");
      const created = factory.createNew("component", "Brand New") as unknown as Shape;
      service<Modeling>("modeling").createShape(
        created,
        { x: 400, y: 300 },
        service<Canvas>("canvas").getRootElement() as Shape,
      );
      expect(created.id).not.toBe("cmp_brand_new");
      service<Selection>("selection").select(created as unknown as Element);

      await reimport(modeler.exportDSL());

      expect(
        service<Selection>("selection")
          .get()
          .map((element) => element.id),
      ).toEqual(["cmp_brand_new"]);
    });

    it("keeps the typed text of an element renamed on the canvas", async () => {
      const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
      labelInput()!.value = "Payments";
      pressKey(labelInput()!, "Enter");
      const payments = findByLabel(service<ElementRegistry>("elementRegistry"), "Payments");
      service<WardleyLabelEditing>("wardleyLabelEditing").activate(payments);
      labelInput()!.value = "Payments v2";

      await reimport(modeler.exportDSL());

      expect(labelInput()?.value).toBe("Payments v2");
    });

    it("restores the canvas ids after a rejected re-import", async () => {
      const factory = service<WardleyElementFactory>("wardleyElementFactory");
      const created = factory.createNew("component", "Brand New") as unknown as Shape;
      service<Modeling>("modeling").createShape(
        created,
        { x: 400, y: 300 },
        service<Canvas>("canvas").getRootElement() as Shape,
      );
      service<Selection>("selection").select(created as unknown as Element);
      const state = setAsideEditorState(modeler);
      await expect(modeler.importMap({ invalid: true } as never)).rejects.toThrow();
      restoreEditorState(modeler, state, { importRejected: true });
      expect(service<Selection>("selection").get()).toEqual([created]);
    });

    it("keeps the selection of an unrelated element", async () => {
      select("Customer");
      await reimport(DSL.replace("[0.55, 0.62]", "[0.5, 0.6]"));
      expect(
        service<Selection>("selection")
          .get()
          .map((element) => (element as WardleyShape).wardleyLabel),
      ).toEqual(["Customer"]);
    });
  });

  it("removes nothing but the field when the edited element disappears", () => {
    const platform = findByLabel(service<ElementRegistry>("elementRegistry"), "Platform");
    service<WardleyLabelEditing>("wardleyLabelEditing").activate(platform);
    service<Modeling>("modeling").removeElements([platform as unknown as Element]);
    expect(labelInput()).toBeNull();
    expect(service<WardleyLabelEditing>("wardleyLabelEditing").getActiveEdit()).toBeNull();
  });
});
