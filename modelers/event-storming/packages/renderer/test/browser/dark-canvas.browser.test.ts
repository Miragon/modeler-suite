import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ContextPad from "diagram-js/lib/features/context-pad/ContextPad";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type PreviewSupport from "diagram-js/lib/features/preview-support/PreviewSupport";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element } from "diagram-js/lib/model/Types";
import {
  COLORS,
  EVENT_STORMING_THEMES,
  Modeler,
  POPUP_PROVIDER_ID,
  type AggregatesDialogChrome,
  type AggregatesDialogOptions,
  type EventStormingAggregates,
  type EventStormingColorPicker,
  type EventStormingLabelEditing,
} from "../../src/index.js";
import type EventStormingDrawTool from "../../src/draw-tool/EventStormingDrawTool.js";
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from "../../src/model/di-types.js";
import tokens from "../../src/theme/cd-tokens.generated.json";
import diagramJsCss from "diagram-js/assets/diagram-js.css?raw";
import "../../src/assets/event-storming.css";

/**
 * Event Storming's dark canvas (#215, guide §10): invisible while `EVENT_STORMING_THEMES` stays
 * light only, so these tests put the dark carrier on the container themselves, as a host will once
 * the modelers switch together (#219).
 */

/** Every sticky kind, a note, arrows with an annotation, three drawings and a spelling variant. */
const BOARD = `title Dark board
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290] (id agg_order)
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
aggregate order [1000, 290] (id agg_order_2)
aggregate Payment [1200, 290] (id agg_payment)
readmodel Order Status [620, 120]
external Payment Provider [420, 520] (color #4fc3f7)
hotspot Double payment on retry? [620, 520]
note Design-level session [80, 80]
line [[100,700],[300,760],[260,820]]
line [[400,700],[600,760]] (dashed) (color #4A4A4A)
line [[700,700],[900,760]] (color #FFB84D)

Customer -> Place Order
Place Order -> #agg_order
#agg_order -> Order Placed
Order Placed -> Order Status; async`;

type Roles = Readonly<Record<string, string>>;
type Mode = readonly [theme: "light" | "dark", roles: Roles];

const LIGHT: Roles = tokens.hell;
const DARK: Roles = tokens.dunkel;
const BOTH_MODES: readonly Mode[] = [
  ["light", LIGHT],
  ["dark", DARK],
];

/** `#RRGGBB` as the browser computes it. */
function rgb(hex: string): string {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`;
}

/** A role of the vendored tokens as the browser computes it. */
function role(roles: Roles, name: string): string {
  const value = roles[name];
  if (!value) throw new Error(`no ${name} in the vendored tokens`);
  return rgb(value);
}

function channels(computed: string): number[] {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(computed);
  if (!match) throw new Error(`"${computed}" is no opaque rgb() colour`);
  return match.slice(1).map(Number);
}

/** WCAG 2.x contrast of two computed opaque colours. */
function contrast(first: string, second: string): number {
  const luminance = (computed: string) => {
    const [red = 0, green = 0, blue = 0] = channels(computed).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter = 0, darker = 0] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const style = (element: globalThis.Element, pseudo?: string) => getComputedStyle(element, pseudo);

function required<Found>(found: Found | null | undefined, what: string): Found {
  if (found === null || found === undefined) throw new Error(`no ${what}`);
  return found;
}

function mountModeler(): { host: HTMLElement; container: HTMLElement; modeler: Modeler } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const container = document.createElement("div");
  host.appendChild(container);
  return { host, container, modeler: new Modeler({ container, width: "1400px", height: "900px" }) };
}

function clearPageMode(): void {
  document.documentElement.removeAttribute("data-cd-theme");
  document.documentElement.removeAttribute("data-cd-kontrast");
}

describe("the dark canvas behind themes: ['light'] (guide §10, #215)", () => {
  let host: HTMLElement;
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    ({ host, container, modeler } = mountModeler());
    await modeler.importDSL(BOARD);
  });

  afterEach(() => {
    modeler.destroy();
    host.remove();
    clearPageMode();
  });

  /** The mode carrier on the modeler's container, as `appearance.set` writes it. */
  function setMode(theme: "light" | "dark" | undefined, highContrast = false): void {
    if (theme) container.setAttribute("data-cd-theme", theme);
    else container.removeAttribute("data-cd-theme");
    if (highContrast) container.setAttribute("data-cd-kontrast", "hoch");
    else container.removeAttribute("data-cd-kontrast");
  }

  const registry = () => modeler.get<ElementRegistry>("elementRegistry");
  const shapes = () => registry().filter(isEventStormingShape) as EventStormingShape[];
  const stickies = () => shapes().filter((shape) => shape.eventStormingType !== "drawing");
  const drawing = (color: string | undefined) =>
    required(
      shapes().find((shape) => shape.eventStormingType === "drawing" && shape.color === color),
      `drawing in ${color ?? "the default ink"}`,
    );
  const byLabel = (label: string) =>
    required(
      shapes().find((shape) => shape.eventStormingLabel === label),
      `sticky "${label}"`,
    );
  const arrows = () => registry().filter(isEventStormingConnection) as EventStormingConnection[];
  const annotated = () =>
    required(
      arrows().find((arrow) => arrow.linkLabel),
      "annotated arrow",
    );
  const visual = (element: { id: string }): SVGGElement =>
    required(
      registry().getGraphics(element.id).querySelector<SVGGElement>(".djs-visual"),
      `visual of ${element.id}`,
    );
  const lineOf = (element: { id: string }): SVGElement =>
    required(
      visual(element).querySelector<SVGElement>(
        ":scope > :is(polyline, polygon):not(.cd-c-unterleger, .event-storming-arrowhead)",
      ),
      `line of ${element.id}`,
    );
  const headOf = (arrow: { id: string }): SVGElement =>
    required(
      visual(arrow).querySelector<SVGElement>(":scope > polygon.event-storming-arrowhead"),
      `head of ${arrow.id}`,
    );
  const ground = () => style(container).backgroundColor;

  it("stays light by default: the board reports light only and no host asks for dark", () => {
    expect(EVENT_STORMING_THEMES).toEqual(["light"]);
    expect(container.hasAttribute("data-cd-theme")).toBe(false);
    expect(ground()).toBe(role(LIGHT, "--cd-ui-grund"));
    expect(style(lineOf(annotated())).stroke).toBe(role(LIGHT, "--cd-ui-kontur"));
    expect(style(lineOf(drawing(undefined))).stroke).toBe(role(LIGHT, "--cd-ui-text"));
  });

  it("draws the board, the arrows, their annotation and the default ink through the dark roles", () => {
    expect(arrows().length).toBe(4);
    for (const [theme, roles] of BOTH_MODES) {
      setMode(theme);
      expect(ground(), theme).toBe(role(roles, "--cd-ui-grund"));
      expect(style(container).backgroundImage, theme).toContain(role(roles, "--cd-ui-linie"));
      for (const arrow of arrows()) {
        expect(style(lineOf(arrow)).stroke, theme).toBe(role(roles, "--cd-ui-kontur"));
        expect(style(headOf(arrow)).fill, theme).toBe(role(roles, "--cd-ui-kontur"));
        expect(contrast(style(headOf(arrow)).fill, ground()), theme).toBeGreaterThanOrEqual(3);
      }
      const annotation = required(visual(annotated()).querySelector("text"), "annotation");
      expect(annotation.textContent).toBe("async");
      expect(style(annotation).fill, theme).toBe(role(roles, "--cd-ui-text-leise"));
      expect(contrast(style(annotation).fill, ground()), theme).toBeGreaterThanOrEqual(4.5);
      const ink = style(lineOf(drawing(undefined))).stroke;
      expect(ink, theme).toBe(role(roles, "--cd-ui-text"));
      expect(contrast(ink, ground()), theme).toBeGreaterThanOrEqual(3);
    }
  });

  it("maps diagram-js onto the dark roles in either stylesheet order (guide §10.3)", () => {
    setMode("dark");
    const parent = required(
      container.querySelector(":scope > .djs-parent.bio-theme-parent"),
      "diagram-js parent",
    );
    const mapped = () => {
      const computed = style(parent);
      return ["--bio-surface", "--lasso-fill-color", "--resizer-fill-color"].map((name) =>
        computed.getPropertyValue(name).trim().toUpperCase(),
      );
    };
    const expected = [DARK["--cd-ui-flaeche-hoch"], "TRANSPARENT", DARK["--cd-ui-plot"]];
    expect(mapped()).toEqual(expected);

    // A bundler that puts diagram-js.css last: cd-canvas.css still wins.
    const reordered = document.createElement("style");
    reordered.textContent = diagramJsCss;
    document.head.append(reordered);
    try {
      expect(mapped()).toEqual(expected);
    } finally {
      reordered.remove();
    }
  });

  it("keeps every sticky as paper: fill, border and text as in light, readable on the dark board", () => {
    const paper = () =>
      stickies().map((sticky) => {
        const rect = required(visual(sticky).querySelector("rect"), `rect of ${sticky.id}`);
        const texts = [...visual(sticky).querySelectorAll("text")].map((text) => style(text).fill);
        return { id: sticky.id, fill: style(rect).fill, stroke: style(rect).stroke, texts };
      });
    setMode("light");
    const light = paper();
    setMode("dark");
    const dark = paper();

    expect(dark).toEqual(light);
    expect(dark.length).toBe(11);
    for (const sticky of dark) {
      expect(contrast(sticky.stroke, ground()), sticky.id).toBeGreaterThanOrEqual(3);
      expect(sticky.texts.length, sticky.id).toBeGreaterThan(0);
      for (const text of sticky.texts) {
        expect(contrast(text, sticky.fill), sticky.id).toBeGreaterThanOrEqual(4.5);
      }
    }
    const external = dark.find((sticky) => sticky.id === byLabel("Payment Provider").id);
    expect(external?.fill).toBe(rgb("#4FC3F7"));
  });

  it("keeps a colour the user set and lays one that is weak on the dark plot on an underlay", () => {
    const weak = drawing("#4A4A4A");
    const strong = drawing("#FFB84D");
    const underlay = required(
      visual(weak).querySelector<SVGElement>(":scope > .cd-c-unterleger"),
      "underlay",
    );
    expect(visual(weak).firstElementChild).toBe(underlay);
    expect(visual(strong).querySelector(".cd-c-unterleger")).toBe(null);
    expect(visual(drawing(undefined)).querySelector(".cd-c-unterleger")).toBe(null);
    expect(lineOf(weak).classList.length).toBe(0);
    expect(lineOf(strong).classList.length).toBe(0);
    expect(Number.parseFloat(style(underlay).strokeWidth)).toBe(
      Number.parseFloat(style(lineOf(weak)).strokeWidth) + 2,
    );
    expect(style(underlay).strokeDasharray).toBe(style(lineOf(weak)).strokeDasharray);

    for (const theme of [undefined, "light", "dark"] as const) {
      setMode(theme);
      expect(style(lineOf(weak)).stroke, theme).toBe(rgb("#4A4A4A"));
      expect(style(lineOf(strong)).stroke, theme).toBe(rgb("#FFB84D"));
      expect(style(underlay).stroke, theme).toBe(
        theme === "dark" ? role(DARK, "--cd-ui-kontur") : "none",
      );
    }
    expect(contrast(style(underlay).stroke, ground())).toBeGreaterThanOrEqual(3);
    expect(contrast(style(lineOf(strong)).stroke, ground())).toBeGreaterThanOrEqual(3);

    // High contrast shows no underlay in light mode: it belongs to the dark plot alone.
    setMode("light", true);
    expect(style(underlay).stroke).toBe("none");
  });

  it("keeps an arrow's line and head in one colour, also in high contrast", () => {
    const arrow = annotated();
    for (const [theme, highContrast, roles] of [
      ["light", true, tokens.hochkontrast.hell],
      ["dark", true, tokens.hochkontrast.dunkel],
      ["light", false, LIGHT],
      ["dark", false, DARK],
    ] as const) {
      setMode(theme, highContrast);
      const label = `${theme}${highContrast ? " high contrast" : ""}`;
      expect(style(lineOf(arrow)).stroke, label).toBe(role(roles, "--cd-ui-kontur"));
      expect(style(headOf(arrow)).fill, label).toBe(role(roles, "--cd-ui-kontur"));
    }
  });

  it("puts the handles of a selected drawing on the dark board", () => {
    modeler.get<Selection>("selection").select(drawing(undefined) as unknown as Element);
    const handles = [...container.querySelectorAll(".event-storming-drawing-handle")];
    expect(handles.length).toBe(3);
    for (const [theme, roles] of BOTH_MODES) {
      setMode(theme);
      for (const handle of handles) {
        expect(style(handle).fill, theme).toBe(role(roles, "--cd-ui-grund"));
        expect(style(handle).stroke, theme).toBe(role(roles, "--cd-ui-text"));
      }
    }
  });

  it("draws the draw tool's line and points in the drawing ink on the dark board", () => {
    const drawTool = modeler.get<EventStormingDrawTool>("eventStormingDrawTool");
    drawTool.activate();
    const svg = required(container.querySelector<SVGSVGElement>(".djs-container > svg"), "svg");
    const box = svg.getBoundingClientRect();
    for (const [x, y] of [
      [box.left + 300, box.top + 400],
      [box.left + 500, box.top + 420],
    ] as const) {
      svg.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y }),
      );
    }
    const preview = required(
      container.querySelector(".layer-event-storming-draw-preview"),
      "draw preview",
    );
    const line = required(preview.querySelector("polyline"), "preview line");
    const points = [...preview.querySelectorAll("circle")];
    expect(points.length).toBe(2);

    for (const [theme, roles] of BOTH_MODES) {
      setMode(theme);
      expect(style(line).stroke, theme).toBe(role(roles, "--cd-ui-text"));
      for (const point of points) {
        expect(style(point).fill, theme).toBe(role(roles, "--cd-ui-grund"));
        expect(style(point).stroke, theme).toBe(role(roles, "--cd-ui-text"));
      }
    }
    drawTool.cancel();
  });

  it("leaves diagram-js's drag and connect previews in the dragger colour, dark and light", () => {
    const layer = modeler.get<Canvas>("canvas").getLayer("dark-canvas-test-preview", 1000);
    const previewSupport = modeler.get<PreviewSupport>("previewSupport");
    const preview = (element: { id: string }) =>
      previewSupport.addDragger(element as unknown as Element, layer);
    const arrowPreview = preview(annotated());
    const weakPreview = preview(drawing("#4A4A4A"));
    const inkPreview = preview(drawing(undefined));
    const inside = (dragger: SVGElement, selector: string) =>
      required(dragger.querySelector(selector), selector);

    for (const [theme, roles] of BOTH_MODES) {
      setMode(theme);
      const dragger = role(roles, "--cd-ui-interaktion");
      expect(style(inside(arrowPreview, "polyline")).stroke, theme).toBe(dragger);
      expect(style(inside(arrowPreview, "polygon")).fill, theme).toBe("none");
      expect(style(inside(arrowPreview, "polygon")).stroke, theme).toBe(dragger);
      expect(style(inside(arrowPreview, "text")).fill, theme).toBe(dragger);
      expect(style(inside(inkPreview, "polyline")).stroke, theme).toBe(dragger);
      expect(style(inside(weakPreview, ".cd-c-unterleger")).stroke, theme).toBe("none");
    }
  });

  it("fades a dragged element to grey on the dark board only (guide §1, §10.3)", () => {
    const sticky = byLabel("Order Placed");
    modeler.get<Canvas>("canvas").addMarker(sticky, "djs-dragging");
    const gfx = registry().getGraphics(sticky.id);
    setMode("light");
    expect(style(gfx).filter).toBe("none");
    setMode("dark");
    expect(style(gfx).filter).toBe("grayscale(1)");
    // The rule follows the nearest carrier: a light container on a dark page stays as it is.
    document.documentElement.setAttribute("data-cd-theme", "dark");
    setMode("light");
    expect(style(gfx).filter).toBe("none");
    setMode(undefined);
    expect(style(gfx).filter).toBe("grayscale(1)");
  });

  it("draws the in-canvas chrome through the dark roles, the spelling dot's rim fixed black", async () => {
    const order = byLabel("Order");
    modeler.get<Selection>("selection").select(order as unknown as Element);
    modeler.get<ContextPad>("contextPad").open(order as unknown as Element);
    const pad = required(container.querySelector<HTMLElement>(".djs-context-pad.open"), "pad");
    const outline = required(
      registry().getGraphics(order.id).querySelector(".djs-outline"),
      "outline",
    );

    modeler
      .get<EventStormingColorPicker>("eventStormingColorPicker")
      .open(drawing(undefined), 600, 400);
    const picker = required(
      container.querySelector<HTMLElement>(".event-storming-color-picker"),
      "colour picker",
    );
    const noColour = required(
      picker.querySelector<HTMLElement>(".event-storming-cp-none"),
      "no colour swatch",
    );
    const swatches = [...picker.querySelectorAll<HTMLElement>(".event-storming-cp-swatch")];

    const dot = required(
      container.querySelector<HTMLElement>(".event-storming-spelling-variant"),
      "spelling variant dot",
    );
    dot.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const tooltip = required(
      container.querySelector<HTMLElement>(".event-storming-spelling-tooltip"),
      "spelling tooltip",
    );

    const editing = modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
    editing.activate(byLabel("Payment"));
    const field = required(
      container.querySelector<HTMLTextAreaElement>("textarea.event-storming-label-input"),
      "label editor",
    );
    field.value = "Or";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const suggestions = required(
      container.querySelector<HTMLElement>(".event-storming-label-suggestions"),
      "label suggestions",
    );
    const surfaces = { pad, picker, tooltip, field, suggestions };

    for (const [theme, roles] of BOTH_MODES) {
      setMode(theme);
      for (const [name, surface] of Object.entries(surfaces)) {
        const label = `${name} ${theme}`;
        expect(style(surface).backgroundColor, label).toBe(role(roles, "--cd-ui-flaeche-hoch"));
        expect(style(surface).color, label).toBe(role(roles, "--cd-ui-text"));
      }
      for (const [name, surface] of Object.entries({ pad, picker, tooltip, suggestions })) {
        expect(style(surface).borderTopColor, `${name} ${theme}`).toBe(
          role(roles, "--cd-ui-linie"),
        );
      }
      expect(style(noColour).backgroundColor, theme).toBe(role(roles, "--cd-ui-flaeche-hoch"));
      for (const swatch of swatches) {
        expect(style(swatch).borderTopColor, theme).toBe(role(roles, "--cd-ui-linie"));
      }
      expect(style(outline).stroke, theme).toBe(role(roles, "--cd-ui-interaktion"));
      expect(style(dot, "::after").borderTopColor, theme).toBe(role(tokens.fest, "--cd-schwarz"));
      expect(style(dot, "::after").backgroundColor, theme).toBe(role(roles, "--cd-ui-warning"));
    }
    // The swatches are the sticky fills and keep them, as the stickies do.
    expect(swatches.map((swatch) => style(swatch).backgroundColor)).toContain(rgb("#FFB84D"));
    // On the dark board the dot's amber carries it alone (guide §8).
    expect(contrast(style(dot, "::after").backgroundColor, ground())).toBeGreaterThanOrEqual(3);
    editing.cancel();
  });

  it("opens the note editor, its toolbar and the kind chooser dark", () => {
    setMode("dark");
    const editing = modeler.get<EventStormingLabelEditing>("eventStormingLabelEditing");
    editing.activate(byLabel("Design-level session"));
    const toolbar = required(
      container.querySelector<HTMLElement>(".event-storming-note-toolbar"),
      "note toolbar",
    );
    const editor = required(
      container.querySelector<HTMLElement>(".event-storming-note-editor"),
      "note editor",
    );
    for (const surface of [toolbar, editor]) {
      expect(style(surface).backgroundColor).toBe(role(DARK, "--cd-ui-flaeche-hoch"));
    }
    expect(style(editor).color).toBe(role(DARK, "--cd-ui-text"));
    expect(style(required(toolbar.querySelector("button"), "toolbar button")).color).toBe(
      role(DARK, "--cd-ui-text"),
    );
    editing.cancel();

    modeler
      .get<PopupMenu>("popupMenu")
      .open(byLabel("Order Placed") as unknown as Element, POPUP_PROVIDER_ID, { x: 600, y: 300 });
    const popup = required(document.querySelector<HTMLElement>(".djs-popup"), "kind chooser");
    expect(container.contains(popup)).toBe(true);
    expect(style(popup).backgroundColor).toBe(role(DARK, "--cd-ui-flaeche-hoch"));
    expect(style(required(popup.querySelector(".entry"), "entry")).color).toBe(
      role(DARK, "--cd-ui-text"),
    );
  });

  it("draws the aggregates table in the dark roles of the dialog's carrier", () => {
    const chrome = document.createElement("div");
    chrome.setAttribute("data-cd-theme", "dark");
    host.appendChild(chrome);
    const dialogChrome: AggregatesDialogChrome = {
      container: chrome,
      openDialog(options: AggregatesDialogOptions) {
        const dialog = document.createElement("dialog");
        dialog.className = options.className;
        const body = document.createElement("div");
        options.render(body);
        dialog.append(body);
        options.container.append(dialog);
        dialog.show();
        return { isOpen: () => dialog.open, close: () => dialog.remove() };
      },
    };
    modeler.get<EventStormingAggregates>("eventStormingAggregates").showDialog(dialogChrome);
    const inDialog = (selector: string) =>
      required(chrome.querySelector<HTMLElement>(selector), selector);
    expect(style(inDialog(".event-storming-aggregates-table")).color).toBe(
      role(DARK, "--cd-ui-text"),
    );
    const heading = inDialog(".event-storming-aggregates-heading");
    expect(style(heading).color).toBe(role(DARK, "--cd-ui-text-leise"));
    expect(style(heading).borderBottomColor).toBe(role(DARK, "--cd-ui-linie"));
    expect(style(inDialog(".event-storming-aggregates-entry")).color).toBe(
      role(DARK, "--cd-ui-text"),
    );
  });
});

describe("the export from a dark canvas (guide §10.7, §13.4)", () => {
  let host: HTMLElement;
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(async () => {
    ({ host, container, modeler } = mountModeler());
    await modeler.importDSL(BOARD);
  });

  afterEach(() => {
    modeler.destroy();
    host.remove();
    clearPageMode();
  });

  /** The PNG the apps make of the SVG: 2× on the light ground (guide §10.7), drawn as an image. */
  async function pngDigest(svg: string): Promise<string> {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = required(canvas.getContext("2d"), "2D context");
    context.fillStyle = COLORS.paper;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((made) => (made ? resolve(made) : reject(new Error("no PNG"))), "image/png"),
    );
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const darkModes: ReadonlyArray<readonly [label: string, apply: () => void]> = [
    ["a dark container", () => container.setAttribute("data-cd-theme", "dark")],
    [
      "a dark high-contrast container",
      () => {
        container.setAttribute("data-cd-theme", "dark");
        container.setAttribute("data-cd-kontrast", "hoch");
      },
    ],
    ["a dark page", () => document.documentElement.setAttribute("data-cd-theme", "dark")],
  ];

  it("is byte-identical to the light SVG and PNG and carries the light values only", async () => {
    const light = (await modeler.saveSVG()).svg;
    const lightPng = await pngDigest(light);
    expect(light).not.toMatch(/cd-c-|event-storming-arrowhead/);
    expect(light).toContain(`stroke: ${role(LIGHT, "--cd-ui-kontur")}`);
    expect(light).toContain(`fill: ${role(LIGHT, "--cd-ui-text-leise")}`);
    expect(light).toContain(`stroke: ${role(LIGHT, "--cd-ui-text")}`);
    expect(light).toContain('class="event-storming-kind-caption"');

    for (const [label, apply] of darkModes) {
      apply();
      const dark = (await modeler.saveSVG()).svg;
      expect(dark, label).toBe(light);
      expect(await pngDigest(dark), label).toBe(lightPng);
      container.removeAttribute("data-cd-theme");
      container.removeAttribute("data-cd-kontrast");
      clearPageMode();
    }
  });

  it("stays light when the exported SVG is placed into a dark page with the renderer's CSS", async () => {
    container.setAttribute("data-cd-theme", "dark");
    const { svg } = await modeler.saveSVG();
    const page = document.createElement("div");
    page.setAttribute("data-cd-theme", "dark");
    page.innerHTML = svg.replace(/^<\?xml[^>]*>\s*/, "");
    host.appendChild(page);
    const placed = (selector: string) =>
      required(page.querySelector<SVGElement>(selector), `${selector} in the placed SVG`);

    expect(style(placed(".djs-connection .djs-visual > polyline")).stroke).toBe(
      role(LIGHT, "--cd-ui-kontur"),
    );
    expect(style(placed(".djs-connection .djs-visual > text")).fill).toBe(
      role(LIGHT, "--cd-ui-text-leise"),
    );
    const inkLine = [...page.querySelectorAll<SVGElement>(".djs-shape .djs-visual > polyline")].map(
      (line) => style(line).stroke,
    );
    expect(inkLine).toContain(role(LIGHT, "--cd-ui-text"));
    expect(inkLine).not.toContain(role(DARK, "--cd-ui-text"));
  });

  it("leaves the live canvas's classes in place while it exports", async () => {
    container.setAttribute("data-cd-theme", "dark");
    const classed = () =>
      container.querySelectorAll('[class*="cd-c-"], .event-storming-arrowhead').length;
    const before = classed();
    expect(before).toBeGreaterThan(5);
    await modeler.saveSVG();
    expect(classed()).toBe(before);
  });
});
