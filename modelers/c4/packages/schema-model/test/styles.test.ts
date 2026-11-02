import { describe, expect, it } from "vitest";
import {
  resolveBoundaryStyle,
  resolveElementStyle,
  resolveRelationshipStyle,
} from "../src/styles.js";
import type { ElementStyle, RelationshipStyle, Styles } from "../src/types.js";
import { NO_STYLES, container, person, relationship, system } from "./support/model.js";

function elementStyles(...elements: ElementStyle[]): Styles {
  return { elements, relationships: [], themes: [] };
}

function relationshipStyles(...relationships: RelationshipStyle[]): Styles {
  return { elements: [], relationships, themes: [] };
}

describe("resolveElementStyle (SPEC 6.4, R-JSON §1.6)", () => {
  it("draws the default look in roles when no style sets anything", () => {
    expect(resolveElementStyle(system("s"), NO_STYLES)).toEqual({
      shape: "Box",
      width: undefined,
      height: undefined,
      fill: undefined,
      stroke: undefined,
      text: undefined,
      strokeWidth: 2,
      border: "solid",
      metadata: true,
      description: true,
      tags: [],
    });
    expect(resolveElementStyle(person("p"), NO_STYLES).shape).toBe("Person");
  });

  it("cascades by the element's tag order, the last tag winning per property", () => {
    const styles = elementStyles(
      { tag: "Element", shape: "RoundedBox", border: "dashed" },
      { tag: "Software System", background: "#1168bd", color: "#ffffff" },
      { tag: "Existing System", background: "#6b6b6b" },
    );
    const resolved = resolveElementStyle(system("s", { tags: ["Existing System"] }), styles);
    expect(resolved).toMatchObject({
      shape: "RoundedBox",
      border: "dashed",
      fill: "#6b6b6b",
      text: "#ffffff",
      tags: ["Element", "Software System", "Existing System"],
    });
  });

  it("merges two styles of the same tag, the later one winning", () => {
    const styles = elementStyles(
      { tag: "Database", shape: "Cylinder", background: "#ffffff" },
      { tag: "Database", background: "#85bbf0" },
    );
    expect(resolveElementStyle(container("d", "s", { tags: ["Database"] }), styles)).toMatchObject({
      shape: "Cylinder",
      fill: "#85bbf0",
      tags: ["Database"],
    });
  });

  it("mixes the opacity over white before drawing (Structurizr's shadeColor, capped at 90 %)", () => {
    const half = resolveElementStyle(
      system("s"),
      elementStyles({ tag: "Element", background: "#1168bd", opacity: 50 }),
    );
    expect(half.fill).toBe("#88b4de");
    const none = resolveElementStyle(
      system("s"),
      elementStyles({ tag: "Element", background: "#000000", opacity: 0 }),
    );
    expect(none.fill).toBe("#e6e6e6");
  });

  it("converts style sizes to modeler units and keeps the shape default otherwise", () => {
    const size = (style: Omit<ElementStyle, "tag">) => {
      const resolved = resolveElementStyle(
        system("s"),
        elementStyles({ tag: "Element", ...style }),
      );
      return [resolved.width, resolved.height];
    };
    expect(size({ width: 450, height: 300 })).toEqual([240, 160]);
    expect(size({ width: 900 })).toEqual([480, 160]);
    expect(size({ height: 600 })).toEqual([240, 320]);
    expect(size({})).toEqual([undefined, undefined]);
    expect(size({ shape: "MobileDevicePortrait", width: 450, height: 300 })).toEqual([160, 240]);
    expect(size({ shape: "MobileDeviceLandscape", width: 300, height: 450 })).toEqual([240, 160]);
  });

  it("clamps the stroke width to 1..10 px, then to 1..4 modeler units", () => {
    const width = (strokeWidth: number) =>
      resolveElementStyle(system("s"), elementStyles({ tag: "Element", strokeWidth })).strokeWidth;
    expect(width(4)).toBeCloseTo(32 / 15, 5);
    expect(width(1)).toBe(1);
    expect(width(10)).toBe(4);
    expect(width(40)).toBe(4);
  });

  it("honours metadata false and description false", () => {
    const resolved = resolveElementStyle(
      system("s"),
      elementStyles({ tag: "Element", metadata: false, description: false }),
    );
    expect([resolved.metadata, resolved.description]).toEqual([false, false]);
  });

  it("ignores a colour it can't read", () => {
    const resolved = resolveElementStyle(
      system("s"),
      elementStyles({ tag: "Element", background: "teal" }),
    );
    expect(resolved.fill).toBeUndefined();
  });
});

describe("resolveRelationshipStyle (SPEC 6.5)", () => {
  it("draws dashed, direct, labelled in the middle by default", () => {
    expect(resolveRelationshipStyle(relationship("a", "b"), NO_STYLES)).toEqual({
      stroke: undefined,
      text: undefined,
      thickness: 1.5,
      line: "dashed",
      routing: "direct",
      position: 50,
      metadata: true,
      description: true,
      tags: [],
    });
  });

  it("starts from the Relationship style and cascades over the relationship's tags", () => {
    const styles = relationshipStyles(
      { tag: "Relationship", color: "#707070", thickness: 2 },
      { tag: "Async", style: "dotted", thickness: 4, position: 150 },
    );
    const resolved = resolveRelationshipStyle(relationship("a", "b", { tags: ["Async"] }), styles);
    expect(resolved).toMatchObject({
      stroke: "#707070",
      text: "#707070",
      line: "dotted",
      position: 100,
      tags: ["Relationship", "Async"],
    });
    expect(resolved.thickness).toBeCloseTo(32 / 15, 5);
    const withoutTag = { ...relationship("a", "b"), tags: [] };
    expect(resolveRelationshipStyle(withoutTag, styles).stroke).toBe("#707070");
  });

  it("keeps a light line colour but writes the label in a readable one", () => {
    const resolved = resolveRelationshipStyle(
      relationship("a", "b"),
      relationshipStyles({ tag: "Relationship", color: "#cccccc" }),
    );
    expect([resolved.stroke, resolved.text]).toEqual(["#cccccc", "#1d1d1d"]);
  });
});

describe("resolveBoundaryStyle (SPEC 6.5)", () => {
  it("draws a dashed frame without fill by default", () => {
    expect(resolveBoundaryStyle("softwareSystem", NO_STYLES)).toEqual({
      fill: undefined,
      stroke: undefined,
      text: undefined,
      strokeWidth: 2,
      border: "dashed",
      tags: [],
    });
  });

  it("cascades Boundary, then Boundary:SoftwareSystem or Boundary:Container", () => {
    const styles = elementStyles(
      { tag: "Boundary", stroke: "#1168bd" },
      { tag: "Boundary:Container", color: "#cccccc", border: "solid" },
      { tag: "Boundary:SoftwareSystem", strokeWidth: 6 },
    );
    expect(resolveBoundaryStyle("container", styles)).toMatchObject({
      stroke: "#1168bd",
      text: "#1d1d1d",
      border: "solid",
      tags: ["Boundary", "Boundary:Container"],
    });
    expect(resolveBoundaryStyle("softwareSystem", styles)).toMatchObject({
      stroke: "#1168bd",
      text: undefined,
      border: "dashed",
      strokeWidth: 3.2,
      tags: ["Boundary", "Boundary:SoftwareSystem"],
    });
  });

  it("derives the stroke and the caption colour from a self-set fill", () => {
    const resolved = resolveBoundaryStyle(
      "softwareSystem",
      elementStyles({ tag: "Boundary", background: "#08427b" }),
    );
    expect(resolved).toMatchObject({ fill: "#08427b", stroke: "#0c3b68", text: "#ffffff" });
  });
});
