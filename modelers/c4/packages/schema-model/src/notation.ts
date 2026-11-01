import type { ColourStyle, ElementKind, ShapeName, Size } from "./types.js";

/** Structurizr's 450 × 300 px box is the modeler's 240 × 160 (SPEC 3.6). */
export const STRUCTURIZR_PX_PER_UNIT = 15 / 8;

/*
 * The classic C4 palette tuned to the guide's contrast rule (text 4.5:1, lines 3:1; SPEC 6.4).
 * Foreign notation colours the user writes into the file with "Apply C4 colours", not brand
 * colours; the notation-contrast test measures them.
 */
// brand-lint-disable
export const C4_COLOUR_STYLES: readonly ColourStyle[] = Object.freeze([
  { tag: "Person", background: "#08427B", color: "#FFFFFF", stroke: "#052E57" },
  { tag: "Software System", background: "#1168BD", color: "#FFFFFF", stroke: "#0B4F91" },
  { tag: "Container", background: "#2D72B8", color: "#FFFFFF", stroke: "#1F5A96" },
  { tag: "Component", background: "#85BBF0", color: "#1D1D1D", stroke: "#4F86C0" },
  { tag: "Existing System", background: "#6B6B6B", color: "#FFFFFF", stroke: "#4D4D4D" },
]);
// brand-lint-enable

const BOX: Size = { width: 240, height: 160 };
const PERSON: Size = { width: 216, height: 216 };

/*
 * SPEC 6.2. Robot, Bucket, Terminal and Shell are drawn as Person, Cylinder and Window in v1 and
 * take their substitute's size.
 */
const DEFAULT_SIZES: Readonly<Record<ShapeName, Size>> = {
  Box: BOX,
  RoundedBox: BOX,
  Person: PERSON,
  Robot: PERSON,
  Cylinder: BOX,
  Bucket: BOX,
  Pipe: BOX,
  WebBrowser: BOX,
  Window: BOX,
  Terminal: BOX,
  Shell: BOX,
  MobileDevicePortrait: { width: 160, height: 240 },
  MobileDeviceLandscape: BOX,
  Hexagon: { width: 240, height: 208 },
  Folder: BOX,
  Component: BOX,
  Ellipse: BOX,
  Circle: { width: 208, height: 208 },
  Diamond: { width: 216, height: 216 },
};

/** In modeler units (SPEC 6.2). */
export function defaultSize(shape: ShapeName): Size {
  return DEFAULT_SIZES[shape];
}

export function defaultShape(kind: ElementKind): ShapeName {
  return kind === "person" ? "Person" : "Box";
}
