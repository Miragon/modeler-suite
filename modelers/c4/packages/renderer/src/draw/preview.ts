import type {
  LineStyle,
  ResolvedBoundaryStyle,
  ResolvedElementStyle,
  ResolvedRelationshipStyle,
  ShapeName,
} from "@miragon/c4-schema-model";
import { selfSetTextColour } from "../text/elementTextLayout.js";
import { chevronPath, polylinePath } from "./lines.js";
import { markupElement, type Markup, type MarkupAttributes } from "./markup.js";
import { drawnShape, PREVIEW_PROPORTIONS, rectanglePath, shapeParts } from "./shapes.js";
import { paintOf, ROLE_LIGHT, type Paint } from "./styles.js";

/** Guide §11: notation previews in palette and legend are 24 px (WYSIWYG). */
export const PREVIEW_SIZE = 24;
const PREVIEW_STROKE = 1.5;

type ElementLook = Pick<ResolvedElementStyle, "fill" | "stroke" | "text" | "border">;

/** Fill and stroke as attributes, each role also as its class (SPEC 6.4: never one without the other). */
function painted(
  fill: Paint | "none",
  stroke: Paint | undefined,
  extra: MarkupAttributes = {},
): MarkupAttributes {
  const classes: string[] = [];
  const attributes: Record<string, string | number | undefined> = { ...extra };
  if (fill === "none") attributes.fill = "none";
  else if ("colour" in fill) attributes.fill = fill.colour;
  else {
    classes.push(fill.role);
    attributes.fill = ROLE_LIGHT[fill.role].value;
  }
  if (stroke && "colour" in stroke) attributes.stroke = stroke.colour;
  else if (stroke) {
    classes.push(stroke.role);
    attributes.stroke = ROLE_LIGHT[stroke.role].value;
  }
  return classes.length > 0 ? { class: classes.join(" "), ...attributes } : attributes;
}

function previewSvg(viewBox: string, ...children: readonly Markup[]): Markup {
  return markupElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      viewBox,
      "aria-hidden": "true",
      focusable: "false",
    },
    ...children,
  );
}

function previewDash(line: LineStyle, unit: number): string | undefined {
  if (line === "solid") return undefined;
  const [dash, gap] = line === "dotted" ? [1, 2] : [3, 2];
  return `${dash * unit} ${gap * unit}`;
}

/**
 * A 24 px miniature of a shape in its look (SPEC 5.1, 6.6): the canvas's outline and inner lines,
 * scaled from the shape's default proportions, without text. Without a look: the default look.
 */
export function shapePreviewSvg(shape: ShapeName, look?: ElementLook): Markup {
  const drawn = drawnShape(shape);
  const { width, height } = PREVIEW_PROPORTIONS[drawn];
  const unit = Math.max(width, height) / PREVIEW_SIZE;
  const margin = PREVIEW_STROKE * unit;
  const parts = shapeParts(drawn, { x: 0, y: 0, width, height });
  const fill = paintOf(look?.fill, "cd-c-fill-plot");
  const stroke = paintOf(look?.stroke, "cd-c-stroke-text");
  const detail = paintOf(look ? selfSetTextColour(look) : undefined, "cd-c-stroke-text");
  const strokeWidth = PREVIEW_STROKE * unit;
  return previewSvg(
    `${-margin} ${-margin} ${width + 2 * margin} ${height + 2 * margin}`,
    ...parts.bodies.map((d) =>
      markupElement(
        "path",
        painted(fill, stroke, {
          d,
          "stroke-width": strokeWidth,
          "stroke-dasharray": previewDash(look?.border ?? "solid", unit),
          "stroke-linejoin": "round",
        }),
      ),
    ),
    ...parts.details.map((d) =>
      markupElement("path", painted("none", detail, { d, "stroke-width": strokeWidth / 1.5 })),
    ),
  );
}

/** A boundary's frame: dashed, no fill unless a style sets one. */
export function boundaryPreviewSvg(
  style?: Pick<ResolvedBoundaryStyle, "fill" | "stroke" | "border">,
): Markup {
  return previewSvg(
    `0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`,
    markupElement(
      "path",
      painted(
        style?.fill === undefined ? "none" : { colour: style.fill },
        paintOf(style?.stroke, "cd-c-stroke-kontur"),
        {
          d: rectanglePath(2, 5, 20, 14, 2),
          "stroke-width": PREVIEW_STROKE,
          "stroke-dasharray": previewDash(style?.border ?? "dashed", 1),
        },
      ),
    ),
  );
}

/** A group's dotted frame. */
export function groupPreviewSvg(): Markup {
  return previewSvg(
    `0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`,
    markupElement(
      "path",
      painted(
        "none",
        { role: "cd-c-stroke-kontur" },
        {
          d: rectanglePath(2, 5, 20, 14, 3),
          "stroke-width": 1.5,
          "stroke-dasharray": "1.5 2.5",
        },
      ),
    ),
  );
}

/** A relationship's line and open chevron in its look. */
export function relationshipPreviewSvg(
  style?: Pick<ResolvedRelationshipStyle, "stroke" | "line">,
): Markup {
  const stroke = paintOf(style?.stroke, "cd-c-stroke-kontur");
  const line = [
    { x: 2, y: 12 },
    { x: 21, y: 12 },
  ];
  const chevron = chevronPath(line);
  return previewSvg(
    `0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`,
    markupElement(
      "path",
      painted("none", stroke, {
        d: polylinePath(line),
        "stroke-width": PREVIEW_STROKE,
        "stroke-dasharray": previewDash(style?.line ?? "dashed", 1),
      }),
    ),
    ...(chevron
      ? [
          markupElement(
            "path",
            painted("none", stroke, {
              d: chevron,
              transform: "translate(21 12) scale(0.6) translate(-21 -12)",
              "stroke-width": PREVIEW_STROKE / 0.6,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
            }),
          ),
        ]
      : []),
  );
}
