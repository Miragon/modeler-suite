import { afterEach, describe, expect, it } from "vitest";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { attachedHost } from "@miragon/modeler-api/conformance";
import type { ElementBounds } from "@miragon/modeler-api";
import { layoutCanvas } from "@miragon/business-model-canvas-schema-model";
import { parseText } from "@miragon/business-model-canvas-dsl";
import {
  ATTRIBUTION,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeDiagram,
} from "../../src/index.js";
import orders from "./fixtures/orders.bmc?raw";

const mounted: Array<{ modeler: CollaborativeDiagram; host: HTMLElement }> = [];

afterEach(() => {
  for (const { modeler, host } of mounted.splice(0)) {
    modeler.destroy();
    host.parentElement?.remove();
  }
});

function attached(modeler: CollaborativeDiagram): CollaborativeDiagram {
  const host = attachedHost();
  modeler.attachTo(host);
  mounted.push({ modeler, host });
  return modeler;
}

function contains(outer: ElementBounds, inner: ElementBounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
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

const LONG_TEXT = Array.from({ length: 25 }, (_, index) => `word${index + 1}`).join(" ");

const MOUNTS = [
  ["modeler", createCollaborativeModeler],
  ["viewer", createCollaborativeViewer],
] as const;

const frameOf = (text: string) => layoutCanvas(parseText(text).document).bounds;
for (const [name, create] of MOUNTS) {
  describe(`contentBounds() of the ${name}`, () => {
    // An empty canvas starts at its full size, so every block shows from the first look.
    it("frames the whole canvas when it is empty, before an import and after an empty one", async () => {
      const modeler = attached(create());
      expect(modeler.contentBounds()).toEqual(frameOf(""));
      await modeler.importText("");
      expect(modeler.contentBounds()).toEqual(frameOf(""));
    });

    // The shell's fit insets are the only margin a host adds (guide §5.9).
    it("is the frame around every sticky, without padding, whatever the view", async () => {
      const modeler = attached(create());
      await modeler.importText(orders);
      const frame = frameOf(orders);
      expect(modeler.contentBounds()).toEqual(frame);
      for (const { id } of modeler.elements.list()) {
        expect(contains(frame, modeler.elements.bounds(id)!)).toBe(true);
      }
      modeler.setViewState({ x: -500, y: -300, width: 400, height: 300 });
      expect(modeler.contentBounds()).toEqual(frame);
    });

    it("cuts a text longer than its sticky with an ellipsis inside it", async () => {
      const modeler = attached(create());
      await modeler.importText(
        JSON.stringify({ channels: { items: [{ id: "long", text: LONG_TEXT }] } }),
      );
      const sticky = modeler.elements.bounds("long")!;
      const registry = modeler.diagram.get<ElementRegistry>("elementRegistry");
      const label = registry
        .getGraphics("long")
        .querySelector<SVGTextElement>(".djs-visual > text")!;
      const { x, y, width, height } = label.getBBox();
      expect(contains(sticky, { x: sticky.x + x, y: sticky.y + y, width, height })).toBe(true);
      const lines = [...label.querySelectorAll("tspan")].map((line) => line.textContent ?? "");
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.at(-1)).toMatch(/\S…$/);
      expect(
        LONG_TEXT.startsWith(
          lines
            .map((line) => line.trim())
            .join(" ")
            .slice(0, -1),
        ),
      ).toBe(true);
    });

    it("frames the whole canvas and its attribution in every export, an empty one too", async () => {
      const modeler = attached(create());
      await modeler.importText("");
      expect(contains(viewBoxOf(modeler.diagram.saveSVG().svg), frameOf(""))).toBe(true);
      await modeler.importText(orders);
      const { svg } = modeler.diagram.saveSVG();
      expect(svg).toContain(ATTRIBUTION);
      expect(svg).not.toContain("bmc-hint");
      const exported = viewBoxOf(svg);
      expect(contains(exported, frameOf(orders))).toBe(true);
    });

    it("is undefined once destroyed", async () => {
      const modeler = attached(create());
      await modeler.importText(orders);
      modeler.destroy();
      expect(modeler.contentBounds()).toBeUndefined();
    });
  });
}
