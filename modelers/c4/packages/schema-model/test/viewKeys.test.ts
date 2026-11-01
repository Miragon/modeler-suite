import { describe, expect, it } from "vitest";
import { draftKey, generateViewKey } from "../src/views/viewKeys.js";
import { bank } from "./support/bank.js";
import { component, container, system, view, workspace } from "./support/model.js";

describe("generateViewKey (ViewSet.generateViewKey)", () => {
  it("hands out the first unused <Type>-NNN", () => {
    expect(generateViewKey("systemLandscape", new Set())).toBe("SystemLandscape-001");
    expect(
      generateViewKey("systemContext", new Set(["SystemContext-001", "SystemContext-002"])),
    ).toBe("SystemContext-003");
    expect(generateViewKey("container", new Set(["Container-002"]))).toBe("Container-001");
  });

  it("uses Structurizr's type names for every view type", () => {
    const keys = (
      ["component", "dynamic", "deployment", "filtered", "custom", "image"] as const
    ).map((type) => generateViewKey(type, new Set()));
    expect(keys).toEqual([
      "Component-001",
      "Dynamic-001",
      "Deployment-001",
      "Filtered-001",
      "Custom-001",
      "Image-001",
    ]);
  });

  it("compares case-sensitively and keeps counting past three digits", () => {
    expect(generateViewKey("systemLandscape", new Set(["systemlandscape-001"]))).toBe(
      "SystemLandscape-001",
    );
    const taken = new Set(
      Array.from({ length: 999 }, (_, index) => `Dynamic-${String(index + 1).padStart(3, "0")}`),
    );
    expect(generateViewKey("dynamic", taken)).toBe("Dynamic-1000");
  });
});

describe("draftKey (SPEC 4.2)", () => {
  it("names the landscape and the scoped drafts after their scope", () => {
    const model = bank();
    expect(draftKey("systemLandscape", undefined, model)).toBe("SystemLandscape");
    expect(draftKey("systemContext", "banking", model)).toBe("SystemContext-banking");
    expect(draftKey("container", "banking", model)).toBe("Containers-banking");
    expect(draftKey("component", "banking.api", model)).toBe("Components-banking-api");
  });

  it("skips a key a written view holds, case-insensitively", () => {
    const model = bank([
      view("systemlandscape", "systemContext", { scope: "banking" }),
      view("Containers-banking", "systemLandscape"),
      view("Containers-banking-2", "systemLandscape"),
    ]);
    expect(draftKey("systemLandscape", undefined, model)).toBe("SystemLandscape-2");
    expect(draftKey("container", "banking", model)).toBe("Containers-banking-3");
  });

  it("skips Structurizr's generated pattern, which a later keyless view could take", () => {
    const model = workspace({ elements: [system("001")] });
    expect(draftKey("systemContext", "001", model)).toBe("SystemContext-001-2");
    expect(draftKey("container", "001", model)).toBe("Containers-001");
  });

  it("gives two scopes whose slugs collide distinct keys, in document order", () => {
    const model = workspace({
      elements: [
        system("s"),
        container("s.c-d", "s"),
        system("s-c"),
        container("s-c.d", "s-c"),
        component("s.c-d.x", "s.c-d"),
      ],
    });
    expect(draftKey("component", "s.c-d", model)).toBe("Components-s-c-d");
    expect(draftKey("component", "s-c.d", model)).toBe("Components-s-c-d-2");
  });

  it("is deterministic for the same workspace", () => {
    const first = bank();
    const second = bank();
    expect(draftKey("container", "mainframe", first)).toBe(
      draftKey("container", "mainframe", second),
    );
  });
});
