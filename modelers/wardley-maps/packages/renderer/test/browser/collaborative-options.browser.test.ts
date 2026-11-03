import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Modeling from "diagram-js/lib/features/modeling/Modeling";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Element, Shape } from "diagram-js/lib/model/Types";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeWardleyModeler,
  type CollaborativeWardleyOptions,
  type Modeler,
} from "../../src/index.js";
import type WardleyElementFactory from "../../src/model/WardleyElementFactory.js";
import type { WardleyShape } from "../../src/model/di-types.js";
import "../../src/assets/wardley.css";

const MAP = `title Options
component Kettle [0.43, 0.35]
component Power [0.1, 0.71]
Kettle -> Power`;

const INSETS = { top: 88, right: 324, bottom: 64, left: 24 };
/** Enter on a palette entry is a keyboard creation only inside a host chrome. */
const shellStandIn: ModuleDeclaration = { modelerShell: ["value", { host: "web" }] };

const mounted: Array<{ host: HTMLElement; modeler: CollaborativeWardleyModeler }> = [];

afterEach(() => {
  for (const { host, modeler } of mounted.splice(0)) {
    modeler.destroy();
    host.remove();
  }
});

async function mount(
  options: CollaborativeWardleyOptions = {},
  create = createCollaborativeModeler,
): Promise<CollaborativeWardleyModeler> {
  const host = document.createElement("div");
  host.style.width = "1600px";
  host.style.height = "1000px";
  document.body.appendChild(host);
  const modeler = create(options);
  modeler.attachTo(host);
  mounted.push({ host, modeler });
  await modeler.importText(MAP);
  return modeler;
}

function canvasOf(modeler: CollaborativeWardleyModeler): Canvas {
  return modeler.diagram.get<Canvas>("canvas");
}

/** Cmd/Ctrl+Z on the canvas after one edit: whether the canvas took the key and undid it. */
function undoByKey(modeler: CollaborativeWardleyModeler): { prevented: boolean; undone: boolean } {
  const diagram = modeler.diagram as Modeler;
  diagram.setTitle("Edited");
  const svg = canvasOf(modeler).getContainer().querySelector<SVGSVGElement>(":scope > svg")!;
  svg.focus();
  const event = new KeyboardEvent("keydown", {
    key: "z",
    metaKey: true,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  svg.dispatchEvent(event);
  return {
    prevented: event.defaultPrevented,
    undone: !modeler.exportText().includes("title Edited"),
  };
}

/** The plot's centre in screen px from the container's top left. */
function plotCentreOnScreen(modeler: CollaborativeWardleyModeler): { x: number; y: number } {
  const viewbox = canvasOf(modeler).viewbox();
  return {
    x: (1190 / 2 - viewbox.x) * viewbox.scale,
    y: (776 / 2 - viewbox.y) * viewbox.scale,
  };
}

describe("the factory options of contract 1.2", () => {
  it("undoRedoKeys: false leaves Cmd/Ctrl+Z to the host", async () => {
    expect(undoByKey(await mount())).toEqual({ prevented: true, undone: true });
    expect(undoByKey(await mount({ undoRedoKeys: false }))).toEqual({
      prevented: false,
      undone: false,
    });
  });

  it("freeArea: { insets }: the import fits the plot into the free rectangle", async () => {
    for (const create of [createCollaborativeModeler, createCollaborativeViewer]) {
      const centre = plotCentreOnScreen(
        await mount({ freeArea: { insets: () => INSETS } }, create),
      );
      expect(centre.x).toBeCloseTo(24 + (1600 - 348) / 2, 0);
      expect(centre.y).toBeCloseTo(88 + (1000 - 152) / 2, 0);
    }
  });

  it("freeArea: { center } places a keyboard-created element there", async () => {
    const point = { x: 300, y: 250 };
    const modeler = await mount({
      additionalModules: [shellStandIn],
      freeArea: { center: () => point },
    });
    const entry = canvasOf(modeler)
      .getContainer()
      .querySelector<HTMLElement>('.djs-palette .entry[data-action="create.component"]')!;
    entry.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    const [created] = modeler.diagram
      .get<Selection>("selection")
      .get() as unknown as WardleyShape[];
    expect(created!.x + created!.width / 2).toBeCloseTo(point.x, 0);
    expect(created!.y + created!.height / 2).toBeCloseTo(point.y, 0);
  });

  it("fitOnImport: false leaves the view to the host", async () => {
    const zoomedIn = { x: 100, y: 50, width: 800, height: 500 };
    const viewAfterImport = async (modeler: CollaborativeWardleyModeler) => {
      modeler.setViewState(zoomedIn);
      const before = canvasOf(modeler).viewbox();
      expect(before.scale).toBeCloseTo(2, 3);
      await modeler.importText(`${MAP}\ncomponent Grid [0.2, 0.9]`);
      const after = canvasOf(modeler).viewbox();
      return { before: [before.x, before.y, before.scale], after: [after.x, after.y, after.scale] };
    };

    const kept = await viewAfterImport(await mount({ fitOnImport: false }));
    expect(kept.after).toEqual(kept.before);
    const fitted = await viewAfterImport(await mount());
    expect(fitted.after[2]).toBeCloseTo(1, 3);
  });
});

describe("the renderer's own factory options", () => {
  it("openRelativeLink reaches the context pad of the editing mount", async () => {
    const openRelativeLink = vi.fn();
    const modeler = await mount({ openRelativeLink });
    await modeler.importText(`title Linked
url Spec [details/kettle.wmap]
component Kettle [0.43, 0.35] url(Spec)`);

    const kettle = modeler.diagram.get<ElementRegistry>("elementRegistry").get("cmp_kettle");
    modeler.diagram.get<Selection>("selection").select(kettle as Element);
    await new Promise(requestAnimationFrame);
    canvasOf(modeler)
      .getContainer()
      .querySelector<HTMLElement>('.djs-context-pad.open .entry[data-action="open-link"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

    expect(openRelativeLink.mock.calls).toEqual([["details/kettle.wmap"]]);
  });

  it("openExternalLink and chooseLinkTarget reach the context pad of the editing mount", async () => {
    const openExternalLink = vi.fn();
    const chooseLinkTarget = vi.fn(() => Promise.resolve("details/kettle.wmap"));
    const modeler = await mount({ openExternalLink, chooseLinkTarget });
    await modeler.importText(`title Linked
url Spec [https://example.com/kettle]
component Kettle [0.43, 0.35] url(Spec)`);

    const kettle = modeler.diagram.get<ElementRegistry>("elementRegistry").get("cmp_kettle");
    modeler.diagram.get<Selection>("selection").select(kettle as Element);
    await new Promise(requestAnimationFrame);
    const pad = canvasOf(modeler)
      .getContainer()
      .querySelector<HTMLElement>(".djs-context-pad.open")!;
    for (const action of ["open-link", "link-map"]) {
      pad
        .querySelector<HTMLElement>(`.entry[data-action="${action}"]`)!
        .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    }

    expect(openExternalLink.mock.calls).toEqual([["https://example.com/kettle"]]);
    expect(chooseLinkTarget).toHaveBeenCalledTimes(1);
  });
});

describe("elements.bounds", () => {
  it("reads the live box of a listed element in diagram coordinates", async () => {
    const modeler = await mount();
    const kettle = modeler.elements.list().find((element) => element.name === "Kettle")!;
    const box = modeler.elements.bounds(kettle.id)!;
    const shape = modeler.diagram
      .get<{ get(id: string): WardleyShape }>("elementRegistry")
      .get(kettle.id);
    expect(box).toEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height });

    canvasOf(modeler).zoom(2);
    expect(modeler.elements.bounds(kettle.id)).toEqual(box);
  });

  it("answers by the id the document gives an element created on the canvas", async () => {
    const modeler = await mount();
    const diagram = modeler.diagram as Modeler;
    const created = diagram
      .get<WardleyElementFactory>("wardleyElementFactory")
      .createNew("component", "Brand New") as unknown as Shape;
    diagram
      .get<Modeling>("modeling")
      .createShape(created, { x: 400, y: 300 }, canvasOf(modeler).getRootElement() as Shape);

    expect(created.id).not.toBe("cmp_brand_new");
    expect(modeler.elements.bounds("cmp_brand_new")).toMatchObject({
      width: created.width,
      height: created.height,
    });
    expect(modeler.elements.bounds(created.id)).toBeUndefined();
    expect(modeler.elements.bounds("cmp_missing")).toBeUndefined();
  });

  it("answers nothing once the modeler is destroyed", async () => {
    const modeler = await mount();
    const [first] = modeler.elements.list();
    modeler.destroy();
    expect(modeler.elements.bounds(first!.id)).toBeUndefined();
  });
});
