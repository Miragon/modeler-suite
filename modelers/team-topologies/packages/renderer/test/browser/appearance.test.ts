import { afterEach, describe, expect, test } from "vitest";
import type { AppearanceRequest } from "@miragon/modeler-api";
import type Canvas from "diagram-js/lib/core/Canvas";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type { Root, Shape } from "diagram-js/lib/model/Types";
import {
  TEAM_TOPOLOGIES_THEMES,
  createCollaborativeModeler,
  createCollaborativeViewer,
  parseDocumentText,
  type CollaborativeTeamTopologiesModeler,
  type Modeler,
  type TtElement,
  type TtElementFactory,
  type TtLabelEditing,
} from "@miragon/team-topologies-renderer";
import { serializeDocument } from "@miragon/team-topologies-schema-model";
import onlineShop from "../../../../example/sample.tt?raw";

// The `appearance` surface of contract 1.5, along the case packages/api/README.md plans for the
// kit ("Cases for the 1.5 surfaces"): a theme is view state, a light-only modeler stays light on a
// dark page, and the contrast it was asked for holds whatever the page shows.

const VIEW_STATE = { x: 120, y: 80, width: 640, height: 480 };

/** The colours a computed style resolves, the roles and the canvas classes among them. */
const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "box-shadow",
  "caret-color",
  "text-decoration-color",
  "fill",
  "stroke",
] as const;

/** The sample's elements whose template contour lies on the high-contrast underlay (guide §10.6). */
const ON_UNDERLAY = [
  "int_platform_fulfilment",
  "int_testing_checkout",
  "int_testing_discovery",
  "team_checkout",
  "team_discovery",
  "team_fraud",
  "team_fulfilment",
  "team_platform",
  "team_test_automation",
];

const HIGH_CONTRAST_UNDERLAY = "rgb(29, 29, 29)";

interface Mounted {
  modeler: CollaborativeTeamTopologiesModeler;
  host: HTMLElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.remove();
  }
  delete document.documentElement.dataset.cdTheme;
  delete document.documentElement.dataset.cdKontrast;
});

function mount(
  modeler: CollaborativeTeamTopologiesModeler = createCollaborativeModeler(),
): Mounted & { diagram: Modeler } {
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1280px; height: 800px;";
  document.body.append(host);
  modeler.attachTo(host);
  mounted.push({ modeler, host });
  return { modeler, host, diagram: modeler.diagram as Modeler };
}

function addTeam(diagram: Modeler): void {
  const team = diagram
    .get<TtElementFactory>("ttElementFactory")
    .createNewTeam("platform", "Payments platform");
  diagram
    .get<Modeling>("modeling")
    .createShape(
      team as unknown as Shape,
      { x: 1400, y: 700 },
      diagram.get<Canvas>("canvas").getRootElement() as Root,
    );
}

/**
 * The computed colours of every element the modeler drew into `host`, by the element's place in
 * document order (with its tag, classes and element id, so a difference names it) and property.
 */
function computedColours(host: HTMLElement): Record<string, string> {
  const colours: Record<string, string> = {};
  [...host.querySelectorAll("*")].forEach((element, index) => {
    const style = getComputedStyle(element);
    const id = element.getAttribute("data-element-id");
    const name = [index, element.tagName.toLowerCase(), element.getAttribute("class"), id]
      .filter((part) => part !== null && part !== "")
      .join(" ");
    for (const property of COLOUR_PROPERTIES) {
      colours[`${name}: ${property}`] = style.getPropertyValue(property);
    }
  });
  return colours;
}

function pageMode(theme: string, kontrast?: "hoch"): void {
  document.documentElement.dataset.cdTheme = theme;
  if (kontrast) document.documentElement.dataset.cdKontrast = kontrast;
  else delete document.documentElement.dataset.cdKontrast;
}

function underlayStrokes(host: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    [...host.querySelectorAll<SVGElement>(".cd-c-unterleger-hoch")].map((underlay) => [
      underlay.closest("[data-element-id]")!.getAttribute("data-element-id")!,
      getComputedStyle(underlay).stroke,
    ]),
  );
}

describe("appearance.themes", () => {
  test("is the renderer's one constant, light only, the same on every read and on the viewer", () => {
    const modeler = createCollaborativeModeler();
    const viewer = createCollaborativeViewer();
    try {
      const { themes } = modeler.appearance;
      expect(themes).toEqual(["light"]);
      expect(themes).toBe(TEAM_TOPOLOGIES_THEMES);
      expect(modeler.appearance.themes).toBe(themes);
      expect(viewer.appearance.themes).toBe(themes);
      expect(new Set(themes).size).toBe(themes.length);
      expect(Object.isFrozen(themes)).toBe(true);
    } finally {
      modeler.destroy();
      viewer.destroy();
    }
  });
});

describe("appearance.set", () => {
  test("applies before attachTo and before the first import, and holds across imports", async () => {
    const modeler = createCollaborativeModeler();
    expect(() => modeler.appearance.set({ theme: "dark", contrast: "high" })).not.toThrow();
    const { diagram } = mount(modeler);
    const root = diagram.container;
    expect(root.dataset.cdTheme).toBe("light");
    expect(root.dataset.cdKontrast).toBe("hoch");

    await modeler.importText(onlineShop);
    await modeler.importText(onlineShop);
    expect(root.dataset.cdTheme).toBe("light");
    expect(root.dataset.cdKontrast).toBe("hoch");
  });

  test("falls back to light for a theme it does not draw, and a request without contrast ends high contrast", () => {
    const { modeler, diagram } = mount();
    const root = diagram.container;
    modeler.appearance.set({ theme: "dark", contrast: "high" });
    expect([root.dataset.cdTheme, root.dataset.cdKontrast]).toEqual(["light", "hoch"]);

    modeler.appearance.set({ theme: "light" });
    expect([root.dataset.cdTheme, root.dataset.cdKontrast]).toEqual(["light", undefined]);

    const untyped = modeler.appearance.set as (request: unknown) => void;
    for (const request of [{ theme: "sepia", contrast: "maximum" }, null, "dark", 42, {}]) {
      expect(() => untyped(request)).not.toThrow();
      expect([root.dataset.cdTheme, root.dataset.cdKontrast]).toEqual(["light", undefined]);
    }
  });

  test("is view state: no change event, exports, view, selection and undo history as they were", async () => {
    const { modeler, diagram } = mount();
    await modeler.importText(onlineShop);
    const beforeTheEdit = modeler.exportText();
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    addTeam(diagram);
    modeler.elements.reveal("team_fraud");
    modeler.setViewState(VIEW_STATE);
    changes = 0;
    const text = modeler.exportText();
    const image = diagram.saveSVG().svg;
    const view = modeler.getViewState();
    const selection = modeler.elements.selection();
    const commandStack = diagram.get<CommandStack>("commandStack");
    const history = { canUndo: commandStack.canUndo(), canRedo: commandStack.canRedo() };

    const requests: AppearanceRequest[] = [
      { theme: "light" },
      { theme: "dark" },
      { theme: "light", contrast: "high" },
      { theme: "dark", contrast: "high" },
      { theme: "sepia" as never, contrast: "normal" },
    ];
    for (const request of requests) {
      expect(() => modeler.appearance.set(request)).not.toThrow();
      expect(changes).toBe(0);
      expect(modeler.exportText()).toBe(text);
      expect(diagram.saveSVG().svg).toBe(image);
      expect(modeler.getViewState()).toEqual(view);
      expect(modeler.elements.selection()).toEqual(selection);
      expect({ canUndo: commandStack.canUndo(), canRedo: commandStack.canRedo() }).toEqual(history);
    }

    diagram.undo();
    expect(changes).toBe(1);
    expect(modeler.exportText()).toBe(beforeTheEdit);
  });

  test("commits nothing an open label editor holds, and leaves it open with its input", async () => {
    const { modeler, diagram } = mount();
    await modeler.importText(onlineShop);
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const labelEditing = diagram.get<TtLabelEditing>("ttLabelEditing");
    const team = diagram.get<{ get(id: string): unknown }>("elementRegistry").get("team_checkout");
    labelEditing.activate(team as TtElement);
    const field = diagram
      .get<Canvas>("canvas")
      .getContainer()
      .querySelector<HTMLTextAreaElement>("textarea.tt-label-editor")!;
    field.value = "typed, not committed";

    modeler.appearance.set({ theme: "dark", contrast: "high" });
    modeler.appearance.set({ theme: "light" });

    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(onlineShop);
    expect(labelEditing.openEdit()).toMatchObject({
      elementId: "team_checkout",
      value: "typed, not committed",
    });
  });
});

describe("the colours a request draws", () => {
  async function revealedSample(): Promise<Mounted & { diagram: Modeler }> {
    const sample = mount();
    await sample.modeler.importText(onlineShop);
    showTheSameView(sample.modeler);
    return sample;
  }

  function showTheSameView(modeler: CollaborativeTeamTopologiesModeler): void {
    modeler.elements.reveal("team_fraud");
    modeler.setViewState(VIEW_STATE);
  }

  test("a light-only modeler stays light, in the contrast it was asked for, on a dark high-contrast page", async () => {
    const { modeler, host } = await revealedSample();
    modeler.appearance.set({ theme: "light" });
    const normal = computedColours(host);
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const high = computedColours(host);
    expect(high).not.toEqual(normal);

    pageMode("dark", "hoch");
    const pageCases: [AppearanceRequest, Record<string, string>][] = [
      [{ theme: "dark" }, normal],
      [{ theme: "dark", contrast: "high" }, high],
      [{ theme: "sepia" as never }, normal],
      [{ theme: "sepia" as never, contrast: "high" }, high],
    ];
    for (const [request, reference] of pageCases) {
      modeler.appearance.set(request);
      expect(computedColours(host), JSON.stringify(request)).toEqual(reference);
    }

    await modeler.importText(onlineShop);
    showTheSameView(modeler);
    for (const [request, reference] of pageCases) {
      modeler.appearance.set(request);
      expect(computedColours(host), `${JSON.stringify(request)} after a re-import`).toEqual(
        reference,
      );
    }
  });

  test("without a request the modeler follows the page, as both apps draw it", async () => {
    const { modeler, host } = await revealedSample();
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const high = computedColours(host);
    const root = (modeler.diagram as Modeler).container;
    root.removeAttribute("data-cd-theme");
    root.removeAttribute("data-cd-kontrast");

    pageMode("light", "hoch");
    expect(computedColours(host)).toEqual(high);
  });
});

describe("the template contours on the high-contrast underlay (#213, guide §10.6)", () => {
  test("show the underlay in --cd-ui-kontur under high contrast only", async () => {
    const { modeler, host } = mount();
    await modeler.importText(onlineShop);
    const none = Object.fromEntries(ON_UNDERLAY.map((id) => [id, "none"]));
    const kontur = Object.fromEntries(ON_UNDERLAY.map((id) => [id, HIGH_CONTRAST_UNDERLAY]));

    expect(underlayStrokes(host)).toEqual(none);
    modeler.appearance.set({ theme: "light", contrast: "high" });
    expect(underlayStrokes(host)).toEqual(kontur);
    modeler.appearance.set({ theme: "light" });
    expect(underlayStrokes(host)).toEqual(none);

    pageMode("dark", "hoch");
    expect(underlayStrokes(host)).toEqual(none);
    modeler.appearance.set({ theme: "dark", contrast: "high" });
    expect(underlayStrokes(host)).toEqual(kontur);
  });

  test("lie 2px wider under the contour, which keeps the template's colour", async () => {
    const { modeler, host } = mount();
    await modeler.importText(onlineShop);
    modeler.appearance.set({ theme: "light", contrast: "high" });
    const visual = host.querySelector('[data-element-id="team_checkout"] .djs-visual')!;
    const [underlay, contour] = [...visual.children].map((child) => getComputedStyle(child));

    expect(underlay!.stroke).toBe(HIGH_CONTRAST_UNDERLAY);
    expect(underlay!.strokeWidth).toBe("4px");
    expect(underlay!.fill).toBe("rgb(255, 237, 184)");
    expect(contour!.stroke).toBe("rgb(255, 217, 102)");
    expect(contour!.strokeWidth).toBe("2px");
    expect(contour!.fill).toBe("none");
  });

  test("leave a contour the user coloured as it is stored, without an underlay", async () => {
    const { modeler, host } = mount();
    const document = parseDocumentText(onlineShop);
    await modeler.importText(
      serializeDocument({
        ...document,
        nodes: document.nodes.map((node) =>
          node.id === "team_platform" ? { ...node, stroke: "#1D3A8A" } : node,
        ),
      }),
    );
    modeler.appearance.set({ theme: "light", contrast: "high" });

    expect(Object.keys(underlayStrokes(host))).not.toContain("team_platform");
    expect(Object.keys(underlayStrokes(host))).toHaveLength(ON_UNDERLAY.length - 1);
  });

  test("stay out of sight in the SVG export, which carries no cd-c-* class", async () => {
    const { modeler, diagram } = mount();
    await modeler.importText(onlineShop);
    const light = diagram.saveSVG().svg;
    modeler.appearance.set({ theme: "light", contrast: "high" });
    pageMode("dark", "hoch");

    const exported = diagram.saveSVG().svg;
    expect(exported).toBe(light);
    expect(exported).not.toContain("cd-c-");
    const parsed = new DOMParser().parseFromString(exported, "image/svg+xml");
    const team = parsed.querySelector('[data-element-id="team_checkout"] .djs-visual')!;
    const [underlay, contour] = [...team.children] as SVGElement[];
    expect([underlay!.style.stroke, contour!.style.stroke]).toEqual(["none", "rgb(255, 217, 102)"]);
  });
});
