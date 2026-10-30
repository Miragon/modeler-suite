/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type PopupMenu from "diagram-js/lib/features/popup-menu/PopupMenu";
import type Selection from "diagram-js/lib/features/selection/Selection";
import {
  cmConnectHandlesModule,
  cmHoverTooltipModule,
  cmLegendModule,
  createCollaborativeModeler,
  createTitleDialog,
  type CollaborativeContextMapsModeler,
} from "@miragon/context-maps-renderer";
import {
  emptyDocument,
  serializeDocumentText,
  type CmDocument,
} from "@miragon/context-maps-schema-model";

// The overlays the renderer lays over the canvas and its dialogs in high contrast (guide §5.3, §6,
// §8, §12): no shadow, an edge and the 3px focus ring, under the nearest mode carrier (guide
// §13.3); and the overlays under forced colours and reduced motion (guide §5.14, §7). The focus
// rings of the name and description editors are in inline-editors.test.ts, the palette's forced
// colours and reduced motion in palette-without-shell.test.ts.

const page = document.documentElement;
const modelers: CollaborativeContextMapsModeler[] = [];
const wrappers: HTMLElement[] = [];
const cleanups: (() => void)[] = [];

afterEach(() => {
  page.removeAttribute("data-cd-theme");
  page.removeAttribute("data-cd-kontrast");
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const modeler of modelers.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

interface Carrier {
  theme: string;
  kontrast?: "hoch";
}

interface Mode {
  page?: Carrier;
  /** A mode carrier between the page and the map's host. */
  carrier?: Carrier;
  request?: AppearanceRequest;
}

function carry(element: HTMLElement, carrier: Carrier): void {
  element.setAttribute("data-cd-theme", carrier.theme);
  if (carrier.kontrast) element.setAttribute("data-cd-kontrast", carrier.kontrast);
}

function mapDocument(): CmDocument {
  const doc = emptyDocument("High contrast");
  doc.contexts = [
    {
      id: "billing",
      label: "Billing",
      description: "Bills every order",
      position: { x: 100, y: 200 },
      size: { width: 200, height: 110 },
    },
    {
      id: "shipping",
      label: "Shipping",
      position: { x: 600, y: 200 },
      size: { width: 200, height: 110 },
    },
  ];
  // An anticorruption layer in a customer-supplier relationship draws a validation marker.
  doc.relationships = [
    {
      id: "invoices",
      from: "billing",
      to: "shipping",
      pattern: "customer-supplier",
      downstreamRoles: ["ACL"],
    },
  ];
  return doc;
}

async function mapIn(mode: Mode): Promise<CollaborativeContextMapsModeler> {
  if (mode.page) carry(page, mode.page);
  const modeler = createCollaborativeModeler({
    additionalModules: [cmConnectHandlesModule, cmLegendModule, cmHoverTooltipModule],
  });
  if (mode.request) modeler.appearance.set(mode.request);
  const host = attachedHost();
  const wrapper = host.parentElement!;
  wrappers.push(wrapper);
  if (mode.carrier) carry(wrapper, mode.carrier);
  modeler.attachTo(host);
  modelers.push(modeler);
  await modeler.importText(serializeDocumentText(mapDocument()));
  return modeler;
}

function within(scope: ParentNode, selector: string): HTMLElement {
  const found = scope.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

function selectBilling(modeler: CollaborativeContextMapsModeler): void {
  const billing = modeler.diagram.get<ElementRegistry>("elementRegistry").get("billing");
  modeler.diagram.get<Selection>("selection").select(billing!);
}

function clickPadEntry(modeler: CollaborativeContextMapsModeler, action: string): void {
  selectBilling(modeler);
  within(
    modeler.diagram.container,
    `.djs-context-pad.open [data-action="${action}"]`,
  ).dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
}

/** diagram-js shows the palette's tooltip a moment after the pointer enters an entry. */
async function showPaletteTooltip(map: HTMLElement): Promise<HTMLElement> {
  within(map, '.djs-palette-entries .entry[data-action="lasso-tool"]').dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true }),
  );
  return vi.waitFor(() => within(map, ".djs-hover-tooltip"), { timeout: 5000 });
}

/** The shadow of every overlay the renderer lays over the canvas, each open in turn. */
async function shadowsOf(
  modeler: CollaborativeContextMapsModeler,
): Promise<Record<string, string>> {
  const map = modeler.diagram.container;
  const shadowOf = (selector: string): string => getComputedStyle(within(map, selector)).boxShadow;
  const shadows: Record<string, string> = {
    palette: shadowOf(".djs-palette"),
    "palette tooltip": getComputedStyle(await showPaletteTooltip(map)).boxShadow,
    "validation marker": shadowOf(".cm-validation-marker"),
    "validation tooltip": shadowOf(".cm-validation-tooltip"),
    "hover tooltip": shadowOf(".cm-hover-tooltip"),
    "legend button": shadowOf(".cm-legend-toggle"),
  };
  within(map, ".cm-legend-toggle").click();
  shadows.legend = shadowOf(".cm-legend");
  shadows["legend tip"] = shadowOf(".cm-legend-tip");

  selectBilling(modeler);
  shadows["context pad"] = shadowOf(".djs-context-pad.open");
  shadows["connect handle"] = shadowOf(".cm-connect-handle");

  clickPadEntry(modeler, "subdomain-type");
  shadows["popup menu"] = shadowOf(".djs-popup");
  modeler.diagram.get<PopupMenu>("popupMenu").close();

  clickPadEntry(modeler, "description");
  shadows["description editor"] = shadowOf(".cm-pad-prompt");
  // A destroy blurs an open editor, which commits and restores the focus to a canvas that is gone.
  within(map, ".cm-pad-prompt__field").dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  return shadows;
}

const OVERLAYS = [
  "palette",
  "palette tooltip",
  "validation marker",
  "validation tooltip",
  "hover tooltip",
  "legend button",
  "legend",
  "legend tip",
  "context pad",
  "connect handle",
  "popup menu",
  "description editor",
];

const HIGH_CONTRAST: Record<string, Mode> = {
  "on a high-contrast page": { page: { theme: "light", kontrast: "hoch" } },
  "inside a high-contrast carrier on a page in normal contrast": {
    page: { theme: "light" },
    carrier: { theme: "light", kontrast: "hoch" },
  },
  "for a host's request of high contrast on a page in normal contrast": {
    page: { theme: "light" },
    request: { theme: "light", contrast: "high" },
  },
  "for a host's request of high contrast inside a carrier in normal contrast": {
    carrier: { theme: "light" },
    request: { theme: "light", contrast: "high" },
  },
};

const NORMAL_CONTRAST: Record<string, Mode> = {
  "on a page in normal contrast": { page: { theme: "light" } },
  "inside a carrier in normal contrast on a high-contrast page": {
    page: { theme: "light", kontrast: "hoch" },
    carrier: { theme: "light" },
  },
  "for a host's request of normal contrast on a high-contrast page": {
    page: { theme: "dark", kontrast: "hoch" },
    request: { theme: "light", contrast: "normal" },
  },
};

describe("the overlays on the canvas in high contrast (guide §5.3, §6, §13.3)", () => {
  it.each(Object.entries(NORMAL_CONTRAST))("keep every shadow %s", async (_, mode) => {
    const shadows = await shadowsOf(await mapIn(mode));
    expect(Object.keys(shadows).sort()).toEqual([...OVERLAYS].sort());
    for (const overlay of OVERLAYS) expect(shadows[overlay], overlay).not.toBe("none");
  });

  it.each(Object.entries(HIGH_CONTRAST))("drop every shadow %s", async (_, mode) => {
    const shadows = await shadowsOf(await mapIn(mode));
    expect(shadows).toEqual(Object.fromEntries(OVERLAYS.map((overlay) => [overlay, "none"])));
  });

  // diagram-js draws the palette's tooltip with a shadow as its only edge (guide §5.6).
  it.each(Object.entries({ ...NORMAL_CONTRAST, ...HIGH_CONTRAST }))(
    "give the palette's tooltip a line edge %s",
    async (_, mode) => {
      const map = (await mapIn(mode)).diagram.container;
      const tooltip = getComputedStyle(await showPaletteTooltip(map));
      expect([tooltip.borderTopStyle, tooltip.borderTopWidth, tooltip.borderTopColor]).toEqual([
        "solid",
        "1px",
        colourIn(map, "var(--cd-ui-linie)"),
      ]);
    },
  );
});

/** The focus ring of the legend's two buttons, each focused by the keyboard's rules. */
function legendRings(modeler: CollaborativeContextMapsModeler): Record<string, string> {
  const map = modeler.diagram.container;
  const ringOf = (selector: string): string => {
    const button = within(map, selector);
    button.focus();
    expect(button.matches(":focus-visible"), selector).toBe(true);
    const style = getComputedStyle(button);
    return `${style.outlineStyle} ${style.outlineWidth}`;
  };
  const rings: Record<string, string> = { "legend button": ringOf(".cm-legend-toggle") };
  within(map, ".cm-legend-toggle").click();
  rings["close legend"] = ringOf(".cm-legend__close");
  return rings;
}

describe("the legend's buttons (guide §5.14, §8, §13.3)", () => {
  it.each(Object.entries(NORMAL_CONTRAST))("show a 2px focus ring %s", async (_, mode) => {
    expect(legendRings(await mapIn(mode))).toEqual({
      "legend button": "solid 2px",
      "close legend": "solid 2px",
    });
  });

  it.each(Object.entries(HIGH_CONTRAST))("show a 3px focus ring %s", async (_, mode) => {
    expect(legendRings(await mapIn(mode))).toEqual({
      "legend button": "solid 3px",
      "close legend": "solid 3px",
    });
  });
});

describe("the overlays under forced colours and reduced motion (guide §5.14, §7)", () => {
  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  it("keeps the legend's separator in CanvasText, also on a page without a mode carrier", async () => {
    const map = (await mapIn({})).diagram.container;
    within(map, ".cm-legend-toggle").click();
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    expect(getComputedStyle(within(map, ".cm-legend__divider")).backgroundColor).toBe(
      colourIn(map, "CanvasText"),
    );
  });

  it("keeps no transition on the context pad's entries, the connect handles and the legend button", async () => {
    const modeler = await mapIn({});
    const map = modeler.diagram.container;
    selectBilling(modeler);
    const overlays = {
      "context pad entry": within(map, ".djs-context-pad.open .entry.cm-pad-entry"),
      "connect handle": within(map, ".cm-connect-handle"),
      "legend button": within(map, ".cm-legend-toggle"),
    };
    const transitions = (): Record<string, string> =>
      Object.fromEntries(
        Object.entries(overlays).map(([overlay, element]) => {
          const style = getComputedStyle(element);
          return [overlay, `${style.transitionProperty} ${style.transitionDuration}`];
        }),
      );
    for (const transition of Object.values(transitions())) expect(transition).not.toMatch(/ 0s$/);

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    expect(transitions()).toEqual(
      Object.fromEntries(Object.keys(overlays).map((overlay) => [overlay, "none 0s"])),
    );
  });
});

function colourIn(scope: HTMLElement, colour: string): string {
  const probe = document.createElement("span");
  probe.style.color = colour;
  scope.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/** The map title dialog in a chrome root that the mode's carrier marks, open and hovered. */
async function titleDialogIn(mode: Mode): Promise<Record<string, string>> {
  if (mode.page) carry(page, mode.page);
  const root = document.createElement("div");
  if (mode.carrier) carry(root, mode.carrier);
  const trigger = document.createElement("button");
  root.append(trigger);
  document.body.append(root);
  const dialog = createTitleDialog(
    { root, menu: { trigger }, messages: { close: "Close" } },
    { title: () => "Conference", setTitle: () => undefined },
  );
  cleanups.push(() => {
    dialog.destroy();
    root.remove();
  });
  dialog.open();
  const element = within(root, "dialog.cm-title-dialog");
  const field = within(element, "input");
  expect(document.activeElement).toBe(field);
  const apply = within(element, '[data-variant="primary"]');
  const look = {
    shadow: getComputedStyle(element).boxShadow,
    edge:
      getComputedStyle(element).borderTopColor === colourIn(root, "var(--cd-ui-kontur)")
        ? "kontur"
        : "linie",
    "field ring": getComputedStyle(field).outlineWidth,
    "primary button": getComputedStyle(apply).boxShadow,
  };
  await userEvent.hover(apply);
  return { ...look, "hovered primary button": getComputedStyle(apply).boxShadow };
}

describe("the map's dialogs in high contrast (guide §6, §8, §13.3)", () => {
  it.each([
    ["on a page in normal contrast", { page: { theme: "light" } }],
    [
      "in a chrome in normal contrast on a high-contrast page",
      { page: { theme: "light", kontrast: "hoch" }, carrier: { theme: "light" } },
    ],
  ] as [string, Mode][])("keep their shadows and the 2px ring %s", async (_, mode) => {
    const look = await titleDialogIn(mode);
    expect(look).toMatchObject({ edge: "linie", "field ring": "2px" });
    for (const surface of ["shadow", "primary button", "hovered primary button"]) {
      expect(look[surface], surface).not.toBe("none");
    }
  });

  it.each([
    ["on a high-contrast page", { page: { theme: "light", kontrast: "hoch" } }],
    [
      "in a high-contrast chrome on a page in normal contrast",
      { page: { theme: "light" }, carrier: { theme: "light", kontrast: "hoch" } },
    ],
  ] as [string, Mode][])(
    "drop their shadows and take the --cd-ui-kontur edge and a 3px ring %s",
    async (_, mode) => {
      expect(await titleDialogIn(mode)).toEqual({
        shadow: "none",
        edge: "kontur",
        "field ring": "3px",
        "primary button": "none",
        "hovered primary button": "none",
      });
    },
  );
});
