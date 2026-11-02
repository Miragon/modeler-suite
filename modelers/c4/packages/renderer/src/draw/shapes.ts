import type { Box, ShapeName } from "@miragon/c4-schema-model";

/** Structurizr shapes v1 draws as another one (SPEC 6.2); the parser reports `shape-substituted`. */
const SUBSTITUTES = {
  Robot: "Person",
  Bucket: "Cylinder",
  Terminal: "Window",
  Shell: "Window",
} as const satisfies Partial<Record<ShapeName, ShapeName>>;

export type DrawnShape = Exclude<ShapeName, keyof typeof SUBSTITUTES>;

export function drawnShape(shape: ShapeName): DrawnShape {
  return shape in SUBSTITUTES
    ? SUBSTITUTES[shape as keyof typeof SUBSTITUTES]
    : (shape as DrawnShape);
}

export interface Mark {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/** A shape in the coordinates of the box it was laid out in. */
export interface ShapeParts {
  /** Closed silhouettes, filled and stroked in order; the first is the body. */
  readonly bodies: readonly string[];
  /** Lines on the fill (a lid, a title bar, a screen), stroked in the text colour. */
  readonly details: readonly string[];
  /** Small filled marks on the fill (a window's dots), in the text colour. */
  readonly marks: readonly Mark[];
}

/** Where the drill badge sits: its right edge or its centre, and its bottom (SPEC 6.5). */
export interface BadgeSlot {
  readonly align: "right" | "centre";
  readonly x: number;
  readonly bottom: number;
}

export const BADGE_SIZE = 20;
const BAR = 20;
const LID = 14;

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function rectanglePath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) return `M${n(x)},${n(y)}H${n(x + width)}V${n(y + height)}H${n(x)}Z`;
  const arc = (toX: number, toY: number) => `A${n(r)},${n(r)} 0 0 1 ${n(toX)},${n(toY)}`;
  return (
    `M${n(x + r)},${n(y)}H${n(x + width - r)}${arc(x + width, y + r)}` +
    `V${n(y + height - r)}${arc(x + width - r, y + height)}` +
    `H${n(x + r)}${arc(x, y + height - r)}V${n(y + r)}${arc(x + r, y)}Z`
  );
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const arc = (toX: number) => `A${n(rx)},${n(ry)} 0 1 0 ${n(toX)},${n(cy)}`;
  return `M${n(cx - rx)},${n(cy)}${arc(cx + rx)}${arc(cx - rx)}Z`;
}

function polygonPath(points: readonly (readonly [number, number])[]): string {
  return `${points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${n(x)},${n(y)}`).join("")}Z`;
}

function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${n(x1)},${n(y1)}L${n(x2)},${n(y2)}`;
}

/** A person's head and body proportions follow the shorter side, so a resized person stays one. */
function personMetrics(width: number, height: number) {
  const side = Math.min(width, height);
  const headRadius = side / 4.5;
  const bodyTop = side / 2.5;
  const bodyRadius = Math.min(35 * (side / 216), (height - bodyTop) / 2, width / 2);
  return { side, headRadius, bodyTop, bodyRadius };
}

function lidOf(height: number): number {
  return Math.min(LID, height / 6);
}

function capOf(width: number): number {
  return Math.min(LID, width / 6);
}

export function shapeParts(shape: DrawnShape, box: Box): ShapeParts {
  const { x, y, width: w, height: h } = box;
  switch (shape) {
    case "Box":
      return { bodies: [rectanglePath(x, y, w, h, 2)], details: [], marks: [] };
    case "RoundedBox":
      return { bodies: [rectanglePath(x, y, w, h, 10)], details: [], marks: [] };
    case "Person": {
      const { headRadius, bodyTop, bodyRadius } = personMetrics(w, h);
      return {
        bodies: [
          rectanglePath(x, y + bodyTop, w, h - bodyTop, bodyRadius),
          ellipsePath(x + w / 2, y + headRadius, headRadius, headRadius),
        ],
        details: [],
        marks: [],
      };
    }
    case "Cylinder": {
      const ry = lidOf(h);
      const rx = w / 2;
      return {
        bodies: [
          `M${n(x)},${n(y + ry)}A${n(rx)},${n(ry)} 0 0 1 ${n(x + w)},${n(y + ry)}` +
            `V${n(y + h - ry)}A${n(rx)},${n(ry)} 0 0 1 ${n(x)},${n(y + h - ry)}Z`,
        ],
        details: [`M${n(x)},${n(y + ry)}A${n(rx)},${n(ry)} 0 0 0 ${n(x + w)},${n(y + ry)}`],
        marks: [],
      };
    }
    case "Pipe": {
      const rx = capOf(w);
      const ry = h / 2;
      return {
        bodies: [
          `M${n(x + rx)},${n(y)}H${n(x + w - rx)}A${n(rx)},${n(ry)} 0 0 1 ${n(x + w - rx)},${n(y + h)}` +
            `H${n(x + rx)}A${n(rx)},${n(ry)} 0 0 1 ${n(x + rx)},${n(y)}Z`,
        ],
        details: [`M${n(x + w - rx)},${n(y)}A${n(rx)},${n(ry)} 0 0 0 ${n(x + w - rx)},${n(y + h)}`],
        marks: [],
      };
    }
    case "WebBrowser":
    case "Window": {
      const bar = Math.min(BAR, h / 4);
      const dots = [10, 18, 26].map((offset) => ({ cx: x + offset, cy: y + bar / 2, r: 2.5 }));
      const details = [linePath(x, y + bar, x + w, y + bar)];
      if (shape === "WebBrowser" && w > 60) {
        details.push(rectanglePath(x + 36, y + bar / 4, w - 44, bar / 2, 3));
      }
      return { bodies: [rectanglePath(x, y, w, h, 5)], details, marks: dots };
    }
    case "MobileDevicePortrait":
      return {
        bodies: [rectanglePath(x, y, w, h, 10)],
        details: [
          rectanglePath(x + 8, y + 24, w - 16, h - 48, 2),
          linePath(x + w / 2 - 12, y + 12, x + w / 2 + 12, y + 12),
          ellipsePath(x + w / 2, y + h - 12, 5, 5),
        ],
        marks: [],
      };
    case "MobileDeviceLandscape":
      return {
        bodies: [rectanglePath(x, y, w, h, 10)],
        details: [
          rectanglePath(x + 24, y + 8, w - 48, h - 16, 2),
          linePath(x + 12, y + h / 2 - 12, x + 12, y + h / 2 + 12),
          ellipsePath(x + w - 12, y + h / 2, 5, 5),
        ],
        marks: [],
      };
    case "Hexagon":
      return {
        bodies: [
          polygonPath([
            [x + w / 4, y],
            [x + (3 * w) / 4, y],
            [x + w, y + h / 2],
            [x + (3 * w) / 4, y + h],
            [x + w / 4, y + h],
            [x, y + h / 2],
          ]),
        ],
        details: [],
        marks: [],
      };
    case "Folder": {
      const tab = h / 8;
      const r = Math.min(5, tab / 2);
      const arc = (toX: number, toY: number) => `A${n(r)},${n(r)} 0 0 1 ${n(toX)},${n(toY)}`;
      return {
        bodies: [
          `M${n(x + r)},${n(y)}H${n(x + w / 3 - r)}${arc(x + w / 3, y + r)}V${n(y + tab)}` +
            `H${n(x + w - r)}${arc(x + w, y + tab + r)}V${n(y + h - r)}${arc(x + w - r, y + h)}` +
            `H${n(x + r)}${arc(x, y + h - r)}V${n(y + r)}${arc(x + r, y)}Z`,
        ],
        details: [],
        marks: [],
      };
    }
    case "Component": {
      const offset = w / 12;
      const block = { width: w / 6, height: h / 8 };
      const blockAt = (centreY: number) =>
        rectanglePath(x, centreY - block.height / 2, block.width, block.height, 2);
      return {
        bodies: [
          rectanglePath(x + offset, y, w - offset, h, 4),
          blockAt(y + h / 4),
          blockAt(y + (3 * h) / 4),
        ],
        details: [],
        marks: [],
      };
    }
    case "Ellipse":
      return { bodies: [ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2)], details: [], marks: [] };
    case "Circle": {
      const r = Math.min(w, h) / 2;
      return { bodies: [ellipsePath(x + w / 2, y + h / 2, r, r)], details: [], marks: [] };
    }
    case "Diamond":
      return {
        bodies: [
          polygonPath([
            [x + w / 2, y],
            [x + w, y + h / 2],
            [x + w / 2, y + h],
            [x, y + h / 2],
          ]),
        ],
        details: [],
        marks: [],
      };
  }
}

/** The drawn silhouette, for docking: every body of the shape in one path. */
export function outlinePath(shape: DrawnShape, box: Box): string {
  return shapeParts(shape, box).bodies.join("");
}

function inset(
  width: number,
  height: number,
  left: number,
  top: number,
  right = left,
  bottom = top,
): Box {
  return {
    x: left,
    y: top,
    width: Math.max(0, width - left - right),
    height: Math.max(0, height - top - bottom),
  };
}

/**
 * The area the text stack is centred in (SPEC 6.2), relative to the shape's box. Curved and pointed
 * shapes take the largest rectangle inside the outline, so a full stack never crosses it.
 */
export function textAreaOf(shape: DrawnShape, width: number, height: number): Box {
  switch (shape) {
    case "Box":
    case "RoundedBox":
      return inset(width, height, 16, 16);
    case "Person": {
      const { bodyTop } = personMetrics(width, height);
      return inset(width, height, 16, bodyTop + 12, 16, 12);
    }
    case "Cylinder":
      return inset(width, height, 16, 2 * lidOf(height), 16, 16);
    case "Pipe":
      return inset(width, height, 2 * capOf(width), 16);
    case "WebBrowser":
    case "Window": {
      const bar = Math.min(BAR, height / 4);
      return inset(width, height, 16, bar + 8, 16, 16);
    }
    case "MobileDevicePortrait":
      return inset(width, height, 16, 32);
    case "MobileDeviceLandscape":
      return inset(width, height, 32, 16);
    case "Hexagon":
      return inset(width, height, 0.15 * width + 4, 0.2 * height);
    case "Folder":
      return inset(width, height, 16, height / 8 + 8, 16, 16);
    case "Component":
      return inset(width, height, width / 6 + 12, 16, 16, 16);
    case "Ellipse":
      return inset(width, height, 0.15 * width, ((1 - Math.sqrt(0.51)) / 2) * height);
    case "Circle": {
      const side = Math.min(width, height);
      const left = (width - side) / 2 + 0.15 * side;
      const top = (height - side) / 2 + ((1 - Math.sqrt(0.51)) / 2) * side;
      return { x: left, y: top, width: 0.7 * side, height: Math.sqrt(0.51) * side };
    }
    case "Diamond":
      return inset(width, height, width / 4, height / 4);
  }
}

/** Room left and right of a centred chip's lower corners, clear of the outline's stroke. */
const BADGE_CLEARANCE = 6;

/** How far below its centre an ellipse is still `halfWidth` wide on either side. */
function ellipseDepthAt(halfWidth: number, radiusX: number, radiusY: number): number {
  return halfWidth >= radiusX ? 0 : radiusY * Math.sqrt(1 - (halfWidth / radiusX) ** 2);
}

/**
 * Inside the outline at the bottom right, or at the bottom centre of a round or pointed shape,
 * where a wider chip (a child count) sits higher, since those outlines narrow toward the bottom.
 */
export function badgeSlotOf(
  shape: DrawnShape,
  width: number,
  height: number,
  badgeWidth = BADGE_SIZE,
): BadgeSlot {
  const halfChip = badgeWidth / 2 + BADGE_CLEARANCE;
  switch (shape) {
    case "Person":
      return { align: "right", x: width - 20, bottom: height - 18 };
    case "Cylinder":
      return { align: "right", x: width - 12, bottom: height - 12 };
    case "Pipe":
      return { align: "right", x: width - 2 * capOf(width) - 6, bottom: height - 8 };
    case "MobileDevicePortrait":
      return { align: "right", x: width - 16, bottom: height - 32 };
    case "MobileDeviceLandscape":
      return { align: "right", x: width - 32, bottom: height - 16 };
    case "Hexagon":
      return { align: "right", x: (3 * width) / 4, bottom: height - 8 };
    case "Ellipse":
      return {
        align: "centre",
        x: width / 2,
        bottom: Math.min(height - 12, height / 2 + ellipseDepthAt(halfChip, width / 2, height / 2)),
      };
    case "Circle": {
      const radius = Math.min(width, height) / 2;
      return {
        align: "centre",
        x: width / 2,
        bottom: height / 2 + Math.min(radius - 12, ellipseDepthAt(halfChip, radius, radius)),
      };
    }
    case "Diamond":
      return {
        align: "centre",
        x: width / 2,
        bottom: height - Math.max(24, (halfChip * height) / width),
      };
    default:
      return { align: "right", x: width - 8, bottom: height - 8 };
  }
}

/** A person's two arm lines (Structurizr's), relative to the box; drawn below the text. */
export function personArms(width: number, height: number): { xs: [number, number]; top: number } {
  const { side } = personMetrics(width, height);
  return { xs: [width / 5, width - width / 5], top: side / 1.5 };
}

/**
 * The proportions of each shape's default size (SPEC 6.2), for the 24 px previews of the legend and
 * the palette; the canvas takes its sizes from the scene.
 */
export const PREVIEW_PROPORTIONS: Readonly<Record<DrawnShape, { width: number; height: number }>> =
  {
    Box: { width: 240, height: 160 },
    RoundedBox: { width: 240, height: 160 },
    Person: { width: 216, height: 216 },
    Cylinder: { width: 240, height: 160 },
    Pipe: { width: 240, height: 160 },
    WebBrowser: { width: 240, height: 160 },
    Window: { width: 240, height: 160 },
    MobileDevicePortrait: { width: 160, height: 240 },
    MobileDeviceLandscape: { width: 240, height: 160 },
    Hexagon: { width: 240, height: 208 },
    Folder: { width: 240, height: 160 },
    Component: { width: 240, height: 160 },
    Ellipse: { width: 240, height: 160 },
    Circle: { width: 208, height: 208 },
    Diamond: { width: 216, height: 216 },
  };
