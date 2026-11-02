import { describe, expect, it } from "vitest";
import { STRUCTURIZR_PX_PER_UNIT, defaultShape, defaultSize } from "../src/notation.js";
import { defaultTerminology, typeLine } from "../src/terminology.js";
import type { MetadataSymbols, ShapeName } from "../src/types.js";
import { component, container, custom, person, system } from "./support/model.js";

describe("shapes and default sizes (SPEC 6.2)", () => {
  it("is Structurizr's 450 × 300 px box as 240 × 160", () => {
    expect(450 / STRUCTURIZR_PX_PER_UNIT).toBe(240);
    expect(300 / STRUCTURIZR_PX_PER_UNIT).toBe(160);
  });

  it.each<[ShapeName, number, number]>([
    ["Box", 240, 160],
    ["RoundedBox", 240, 160],
    ["Person", 216, 216],
    ["Robot", 216, 216],
    ["Cylinder", 240, 160],
    ["Bucket", 240, 160],
    ["Pipe", 240, 160],
    ["WebBrowser", 240, 160],
    ["Window", 240, 160],
    ["Terminal", 240, 160],
    ["Shell", 240, 160],
    ["MobileDevicePortrait", 160, 240],
    ["MobileDeviceLandscape", 240, 160],
    ["Hexagon", 240, 208],
    ["Folder", 240, 160],
    ["Component", 240, 160],
    ["Ellipse", 240, 160],
    ["Circle", 208, 208],
    ["Diamond", 216, 216],
  ])("%s is %d × %d", (shape, width, height) => {
    expect(defaultSize(shape)).toEqual({ width, height });
  });

  it("draws people as Person and everything else as Box", () => {
    expect(defaultShape("person")).toBe("Person");
    for (const kind of ["softwareSystem", "container", "component", "custom"] as const) {
      expect(defaultShape(kind)).toBe("Box");
    }
  });
});

describe("type lines (SPEC 6.3, getMetadataForElement)", () => {
  const terminology = defaultTerminology();

  it("names the kind, with the technology for containers and components", () => {
    expect(typeLine(person("p"), terminology)).toBe("[Person]");
    expect(typeLine(system("s"), terminology)).toBe("[Software System]");
    expect(typeLine(container("c", "s", { technology: "Java" }), terminology)).toBe(
      "[Container: Java]",
    );
    expect(typeLine(container("c", "s"), terminology)).toBe("[Container]");
    expect(typeLine(component("k", "c", { technology: "Spring Bean" }), terminology)).toBe(
      "[Component: Spring Bean]",
    );
  });

  it("shows a custom element's metadata, and nothing without it", () => {
    expect(typeLine(custom("x", { metadata: "Hardware" }), terminology)).toBe("[Hardware]");
    expect(typeLine(custom("x"), terminology)).toBe("");
  });

  it("uses the workspace's terminology and metadata symbols", () => {
    const words = { ...terminology, softwareSystem: "System", container: "App" };
    expect(typeLine(system("s"), words)).toBe("[System]");
    const symbols: Record<MetadataSymbols, string> = {
      square: "[App: Go]",
      round: "(App: Go)",
      curly: "{App: Go}",
      angle: "<App: Go>",
      "double-angle": "<<App: Go>>",
      none: "App: Go",
    };
    for (const [metadataSymbols, expected] of Object.entries(symbols)) {
      expect(
        typeLine(container("c", "s", { technology: "Go" }), {
          ...words,
          metadataSymbols: metadataSymbols as MetadataSymbols,
        }),
      ).toBe(expected);
    }
  });

  it("starts from Structurizr's English words", () => {
    expect(defaultTerminology()).toEqual({
      person: "Person",
      softwareSystem: "Software System",
      container: "Container",
      component: "Component",
      deploymentNode: "Deployment Node",
      infrastructureNode: "Infrastructure Node",
      relationship: "Relationship",
      metadataSymbols: "square",
    });
  });
});
