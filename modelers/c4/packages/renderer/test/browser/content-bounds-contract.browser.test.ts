/*
 * The contract half of the template's content-bounds test (contract 1.3, SPEC 1.10, 6.5), on the
 * shipped modeler and viewer with the kit's fixtures: the box covers the elements, boundaries,
 * group frames, relationship labels and the title, and stays where it was when Geist arrives. The
 * drawing half on hand-built scenes is `content-bounds.browser.test.ts`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { ElementBounds } from "@miragon/modeler-api";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Canvas from "diagram-js/lib/core/Canvas";
import type { Shape } from "diagram-js/lib/model/Types";
import "../../src/assets/c4.css";
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
} from "../../src/collaborative/index.js";
import type FontRelayout from "../../src/draw/FontRelayout.js";
import type SceneService from "../../src/scene/SceneService.js";
import type { Scene } from "../../src/scene/types.js";
import { BOOKSHOP, LIBRARY } from "./fixtures/texts.js";
import { loadGeist, registerGeist, removeFonts } from "./support/drawingHarness.js";

const mounted: Array<{ modeler: CollaborativeDiagram; host: HTMLElement }> = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.parentElement?.remove();
  }
  removeFonts();
});

function attached(modeler: CollaborativeDiagram): CollaborativeDiagram {
  const host = attachedHost();
  modeler.attachTo(host);
  mounted.push({ modeler, host });
  return modeler;
}

function union(boxes: readonly ElementBounds[]): ElementBounds {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** `inner` inside `outer`, give or take what `getBBox`'s float32 rounding takes off. */
function contains(outer: ElementBounds, inner: ElementBounds, tolerance = 0.01): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function viewBoxOf(svg: string): ElementBounds {
  const [x = NaN, y = NaN, width = NaN, height = NaN] = new DOMParser()
    .parseFromString(svg, "image/svg+xml")
    .documentElement.getAttribute("viewBox")!
    .split(" ")
    .map(Number);
  return { x, y, width, height };
}

function sceneOf(modeler: CollaborativeDiagram): Scene {
  return modeler.diagram.get<SceneService>("c4Scene").current();
}

/** Every part the view draws, in diagram coordinates, as the scene lays it out. */
function partsOf(scene: Scene): ElementBounds[] {
  return [
    ...scene.elements.map(({ box }) => box),
    ...scene.boundaries.map(({ box }) => box),
    ...scene.groups.map(({ box }) => box),
    ...scene.relationships.flatMap(({ labelBox, vertices }) => [
      labelBox,
      ...vertices.map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
    ]),
    scene.title.box,
  ];
}

/** The box around every node the canvas draws, measured on the live SVG, by what it belongs to. */
function drawnBoxes(modeler: CollaborativeDiagram): Map<string, ElementBounds> {
  const registry = modeler.diagram.get<ElementRegistry>("elementRegistry");
  const canvas = modeler.diagram.get<Canvas>("canvas");
  const root = canvas.getRootElement();
  const drawn = new Map<string, ElementBounds>();
  for (const element of registry.getAll()) {
    if (element === root) continue;
    const visual = registry.getGraphics(element).querySelector<SVGGElement>(".djs-visual");
    if (!visual || visual.childElementCount === 0) continue;
    const { x, y, width, height } = visual.getBBox();
    // A shape draws relative to its corner; a connection in diagram coordinates.
    const origin = "waypoints" in element ? { x: 0, y: 0 } : (element as unknown as Shape);
    drawn.set(element.id, { x: origin.x + x, y: origin.y + y, width, height });
  }
  for (const layer of ["c4-frames", "c4-title"]) {
    const group = canvas.getLayer(layer) as SVGGElement;
    if (group.childElementCount === 0) continue;
    const { x, y, width, height } = group.getBBox();
    drawn.set(`layer ${layer}`, { x, y, width, height });
  }
  return drawn;
}

/** LIBRARY with its loans in a group, so the view draws a group frame as well. */
const LIBRARY_GROUPED = LIBRARY.replace(
  /^( +)(loans = container .*)$/m,
  '$1group "Lending" {\n$1    $2\n$1}',
);

const LONG_NAME = Array.from({ length: 25 }, (_, index) => `word${index + 1}`).join(" ");

/** One software system whose name runs far past its box. */
const LONG = `workspace {
    model {
        long = softwareSystem "${LONG_NAME}"
    }
    views {
        systemLandscape "Long" {
            include *
        }
    }
}
`;

/** A group of the model and a group of the shop, of one name, both in the shop's container view. */
const SAME_NAMED_GROUPS = `workspace {
    model {
        group "Internal" {
            staff = person "Staff"
        }
        shop = softwareSystem "Shop" {
            group "Internal" {
                api = container "API"
            }
        }
        staff -> api "Uses"
    }
    views {
        container shop "Containers" {
            include *
        }
    }
}
`;

/** A written view that shows nothing: no element, no boundary, so no title block either. */
const EMPTY_VIEW = `workspace {
    model {
        customer = person "Customer"
    }
    views {
        systemLandscape "Nobody" {
            include *
            exclude customer
        }
    }
}
`;

const MOUNTS = [
  ["modeler", createCollaborativeModeler],
  ["viewer", createCollaborativeViewer],
] as const;

for (const [name, create] of MOUNTS) {
  describe(`contentBounds() of the ${name}`, () => {
    it("is undefined while nothing is drawn: before an import, for an empty text and a view that shows nothing", async () => {
      const modeler = attached(create());
      expect(modeler.contentBounds()).toBeUndefined();
      await modeler.importText("");
      expect(modeler.contentBounds()).toBeUndefined();
      await modeler.importText(EMPTY_VIEW);
      expect(modeler.views.active().key).toBe("Nobody");
      expect(modeler.elements.list()).toEqual([]);
      expect(modeler.contentBounds()).toBeUndefined();
      expect(modeler.diagram.get<Canvas>("canvas").getLayer("c4-title").childElementCount).toBe(0);
    });

    // The shell's fit insets are the only margin a host adds (guide §5.9).
    for (const [fixture, text] of [
      ["BOOKSHOP", BOOKSHOP],
      ["LIBRARY", LIBRARY],
      ["LIBRARY with a group", LIBRARY_GROUPED],
    ] as const) {
      it(`of ${fixture} is the tight box of what the view draws, without padding, whatever the view`, async () => {
        await loadGeist();
        const modeler = attached(create());
        await modeler.importText(text);
        const scene = sceneOf(modeler);
        const listed = modeler.elements.list().map(({ id }) => modeler.elements.bounds(id)!);
        const tight = union(partsOf(scene));
        expect(modeler.contentBounds()).toEqual(tight);
        expect(contains(tight, union(listed))).toBe(true);
        modeler.setViewState({ x: -500, y: -300, width: 400, height: 300 });
        expect(modeler.contentBounds()).toEqual(tight);
      });
    }

    it("covers every label, boundary, group frame and the title the canvas draws, and the export frames them", async () => {
      await loadGeist();
      const modeler = attached(create());
      for (const text of [BOOKSHOP, LIBRARY_GROUPED]) {
        await modeler.importText(text);
        const scene = sceneOf(modeler);
        expect(scene.relationships.length).toBeGreaterThan(0);
        const bounds = modeler.contentBounds()!;
        const drawn = drawnBoxes(modeler);
        expect(drawn.has("layer c4-title")).toBe(true);
        if (text === LIBRARY_GROUPED) {
          expect(scene.boundaries).toHaveLength(1);
          expect(scene.groups).toHaveLength(1);
          expect(drawn.has("boundary:library")).toBe(true);
          expect(drawn.has("layer c4-frames")).toBe(true);
        }
        const exported = viewBoxOf(modeler.diagram.saveSVG().svg);
        for (const [part, box] of drawn) {
          expect(contains(bounds, box), `${part} lies inside the content bounds`).toBe(true);
          expect(contains(exported, box), `${part} lies inside the export`).toBe(true);
        }
      }
    });

    it("draws two groups of one name from different scopes as two frames, each inside its own box", async () => {
      await loadGeist();
      const modeler = attached(create());
      await modeler.importText(SAME_NAMED_GROUPS);
      const { groups } = sceneOf(modeler);
      expect(groups.map(({ path, scopeId }) => [path, scopeId])).toEqual([
        ["Internal", undefined],
        ["Internal", "shop"],
      ]);
      const layer = modeler.diagram.get<Canvas>("canvas").getLayer("c4-frames");
      const frames = [...layer.querySelectorAll<SVGGElement>("[data-group]")];
      expect(frames.map((frame) => frame.getAttribute("data-group"))).toEqual(
        groups.map(({ key }) => key),
      );
      for (const group of groups) {
        const frame = layer.querySelector<SVGGElement>(`[data-group="${CSS.escape(group.key)}"]`);
        expect(contains(group.box, frame!.getBBox()), group.key).toBe(true);
      }
    });

    // The fit and the SVG export frame the boxes, so a line drawn outside them is cut off.
    it("covers a name longer than its box, which ends in an ellipsis inside it", async () => {
      await loadGeist();
      const modeler = attached(create());
      await modeler.importText(LONG);
      const box = modeler.elements.bounds("long")!;
      const visual = modeler.diagram
        .get<ElementRegistry>("elementRegistry")
        .getGraphics("long")
        .querySelector<SVGGElement>(".djs-visual")!;
      const { x, y, width, height } = visual.getBBox();
      const drawn = { x: box.x + x, y: box.y + y, width, height };
      expect(contains(box, drawn)).toBe(true);
      const lines = [...visual.querySelectorAll("text")]
        .map((line) => line.textContent ?? "")
        .filter((line) => line.startsWith("word"));
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.at(-1)).toMatch(/\S…$/);
      expect(
        LONG_NAME.startsWith(
          lines
            .map((line) => line.trim())
            .join(" ")
            .slice(0, -1),
        ),
      ).toBe(true);
      expect(contains(modeler.contentBounds()!, drawn)).toBe(true);
      expect(contains(viewBoxOf(modeler.diagram.saveSVG().svg), drawn)).toBe(true);
    });

    it("stays where it was when Geist arrives after the import, and still covers the drawing", async () => {
      registerGeist();
      const modeler = attached(create());
      await modeler.importText(LIBRARY_GROUPED);
      const before = modeler.contentBounds();

      expect(await modeler.diagram.get<FontRelayout>("c4FontRelayout").settled).toBe(true);

      expect(modeler.contentBounds()).toEqual(before);
      for (const [part, box] of drawnBoxes(modeler)) {
        expect(contains(before!, box), `${part} lies inside the content bounds`).toBe(true);
      }
    });

    it("is undefined once destroyed", async () => {
      const modeler = attached(create());
      await modeler.importText(BOOKSHOP);
      modeler.destroy();
      expect(modeler.contentBounds()).toBeUndefined();
    });
  });
}
