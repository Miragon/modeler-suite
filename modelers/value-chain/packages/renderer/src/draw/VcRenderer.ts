import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import TextUtil from "diagram-js/lib/util/Text";
import { createLine } from "diagram-js/lib/util/RenderUtil";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type GraphicsFactory from "diagram-js/lib/core/GraphicsFactory";
import type { Connection, Element, Shape } from "diagram-js/lib/model/Types";
import { append as svgAppend, attr as svgAttr, create as svgCreate } from "tiny-svg";
import type { Bounds } from "@miragon/value-chain-schema-model";
import { SURROUND_LABEL, shapeColors } from "./fill.js";
import {
  chevronPath,
  chevronPathAt,
  ellipsePathAt,
  labelInset,
  shapeHoldsLine,
} from "./geometry.js";
import { labelLines, linesBox } from "./labelBox.js";
import {
  COLORS,
  FONT,
  LABEL_HALO_WIDTH,
  LABEL_PADDING,
  ROLE_CLASSES,
  STROKE_WIDTH,
} from "./styles.js";
import {
  isOrgUnit,
  isVcConnection,
  isVcShape,
  type VcConnection,
  type VcShape,
} from "../model/di-types.js";

/** BaseRenderer default is 1000; 1500 wins the render.shape/render.connection event. */
const VC_RENDER_PRIORITY = 1500;

/** Arrowhead geometry mirrors the bpmn-js sequence flow marker. */
const ARROW_PATH = "M 1 5 L 11 10 L 1 15 Z";

let rendererInstances = 0;

export default class VcRenderer extends BaseRenderer {
  static $inject = ["eventBus", "elementRegistry", "graphicsFactory"];

  private readonly textUtil = new TextUtil({
    style: {
      fontFamily: FONT.family,
      fontSize: FONT.size,
      fontWeight: "normal",
      lineHeight: FONT.lineHeight,
    },
  });

  /** Unique per instance so marker ids never collide across diagrams on one page. */
  private readonly markerSuffix = `${(rendererInstances += 1)}`;

  /** Each shape's label box as last drawn, relative to the shape. */
  private readonly labelBoxes = new WeakMap<Shape, Bounds>();

  constructor(
    eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly graphicsFactory: GraphicsFactory,
  ) {
    super(eventBus, VC_RENDER_PRIORITY);
    this.relayoutLabelsWhenTheFontArrives(eventBus);
  }

  /**
   * A label drawn before the web font arrived was measured in the fallback font: its lines sit off
   * centre, and may wrap differently, once the font renders. Such labels are laid out again then.
   */
  private relayoutLabelsWhenTheFontArrives(eventBus: EventBus): void {
    const fonts = typeof document === "undefined" ? undefined : document.fonts;
    const font = `${FONT.size}px ${FONT.family}`;
    if (!fonts || fonts.check(font)) {
      return;
    }
    let destroyed = false;
    eventBus.on("diagram.destroy", () => {
      destroyed = true;
    });
    fonts.load(font).then(
      (faces) => {
        if (destroyed || faces.length === 0) {
          return;
        }
        for (const element of this.elementRegistry.getAll()) {
          if (isVcShape(element) && element.vcLabel) {
            this.graphicsFactory.update(
              "shape",
              element,
              this.elementRegistry.getGraphics(element),
            );
          }
        }
      },
      () => undefined,
    );
  }

  override canRender(element: Element): boolean {
    return isVcShape(element) || isVcConnection(element);
  }

  override drawShape(visuals: SVGElement, element: Shape): SVGElement {
    const shape = element as VcShape;
    const colors = shapeColors(shape.color);
    const orgUnit = isOrgUnit(shape);

    const path = svgCreate("path");
    svgAttr(path, {
      d: orgUnit
        ? ellipsePathAt(0, 0, shape.width, shape.height)
        : chevronPath(shape.width, shape.height),
      fill: colors.fill,
      stroke: COLORS.ink,
      "stroke-width": STROKE_WIDTH,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    // A colour of the shape's own is its fill only: the contour stays in the ink role, so a Black
    // step keeps its outline on the dark ground.
    path.classList.add(ROLE_CLASSES.inkStroke);
    if (colors.roles) path.classList.add(colors.roles.fill);
    svgAppend(visuals, path);

    this.labelBoxes.delete(element);
    if (shape.vcLabel) {
      const inset = orgUnit ? LABEL_PADDING + 5 : labelInset(shape.width, shape.height);
      const label = this.textUtil.createText(shape.vcLabel, {
        box: { width: shape.width, height: shape.height },
        align: "center-middle",
        padding: {
          top: LABEL_PADDING,
          bottom: LABEL_PADDING,
          left: inset,
          right: inset,
        },
        style: {
          fill: colors.label,
          stroke: colors.halo,
          "stroke-width": LABEL_HALO_WIDTH,
          "stroke-linejoin": "round",
          "paint-order": "stroke",
        },
      });
      if (colors.roles) label.classList.add(colors.roles.label, colors.roles.halo);
      svgAppend(visuals, label);
      const lines = labelLines(label as SVGTextElement);
      for (const line of lines) {
        if (!shapeHoldsLine(orgUnit, shape.width, shape.height, line.box)) {
          svgAttr(line.element, { fill: SURROUND_LABEL.label, stroke: SURROUND_LABEL.halo });
          line.element.classList.add(SURROUND_LABEL.roles.label, SURROUND_LABEL.roles.halo);
        }
      }
      const box = linesBox(lines);
      if (box) this.labelBoxes.set(element, box);
    }

    return path;
  }

  /**
   * The box the shape's label covers in diagram coordinates, a long label on a small shape well
   * past the shape; undefined without a label. Measured when the shape was last drawn, that is once
   * per content change, so zoom and scroll leave it alone.
   */
  labelBounds(shape: Shape): Bounds | undefined {
    const box = this.labelBoxes.get(shape);
    if (!box) return undefined;
    return { x: shape.x + box.x, y: shape.y + box.y, width: box.width, height: box.height };
  }

  override drawConnection(visuals: SVGElement, element: Connection): SVGElement {
    const connection = element as VcConnection;
    const stroke = COLORS.ink;

    const attrs: Record<string, string | number> = {
      stroke,
      "stroke-width": STROKE_WIDTH,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      fill: "none",
    };
    if (connection.vcType === "sequence") {
      attrs["stroke-dasharray"] = "8, 5";
    }
    // assignments (org unit ↔ step) are plain lines without an arrowhead
    if (connection.vcType !== "assignment") {
      const svg = visuals.ownerSVGElement;
      if (svg) {
        attrs["marker-end"] = this.arrowMarker(svg, stroke);
      }
    }

    const line = createLine(connection.waypoints, attrs);
    line.classList.add(ROLE_CLASSES.inkStroke);
    svgAppend(visuals, line);
    return line;
  }

  override getShapePath(shape: Shape): string {
    if (isOrgUnit(shape)) {
      return ellipsePathAt(shape.x, shape.y, shape.width, shape.height);
    }
    return chevronPathAt(shape.x, shape.y, shape.width, shape.height);
  }

  override getConnectionPath(connection: Connection): string {
    const [first, ...rest] = connection.waypoints;
    if (!first) {
      return "";
    }
    return `M${first.x},${first.y}${rest.map((point) => `L${point.x},${point.y}`).join("")}`;
  }

  private arrowMarker(svg: SVGSVGElement, color: string): string {
    const id = `vc-arrow-${this.markerSuffix}-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
    if (!svg.querySelector(`marker[id="${id}"]`)) {
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = svgCreate("defs") as SVGDefsElement;
        svgAppend(svg, defs);
      }
      const marker = svgCreate("marker");
      svgAttr(marker, {
        id,
        viewBox: "0 0 20 20",
        refX: 11,
        refY: 10,
        markerWidth: 10,
        markerHeight: 10,
        orient: "auto",
      });
      const arrow = svgCreate("path");
      svgAttr(arrow, {
        d: ARROW_PATH,
        fill: color,
        stroke: color,
        "stroke-width": 1,
        "stroke-linejoin": "round",
      });
      arrow.classList.add(ROLE_CLASSES.inkFill, ROLE_CLASSES.inkStroke);
      svgAppend(marker, arrow);
      svgAppend(defs, marker);
    }
    return `url(#${id})`;
  }
}
