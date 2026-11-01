import { describe, expect, it } from "vitest";
import { parseWorkspace } from "@miragon/c4-dsl";
import { createC4Engine } from "../src/engine/C4Engine.js";
import { buildSceneWith } from "../src/scene/build.js";
import { schemaModelNotation } from "../src/scene/notation.js";

const SAME_NAMED_GROUPS = `workspace {
    model {
        properties {
            "structurizr.groupSeparator" "/"
        }
        group "Core" {
            customer = person "Customer"
        }
        shop = softwareSystem "Shop" {
            group "Core" {
                web = container "Web"
                group "Inner" {
                    api = container "API"
                }
            }
        }
        customer -> web "Uses"
    }
    views {
        container shop "Containers" {
            include *
        }
    }
}
`;

describe("the scene's group frames", () => {
  it("draws a model-level group and a system's group of one name as two frames", () => {
    const parse = parseWorkspace(SAME_NAMED_GROUPS);
    expect(parse.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    const scene = buildSceneWith(parse, "Containers", createC4Engine(), schemaModelNotation);
    expect(
      scene.groups.map(({ key, path, scopeId, depth }) => ({ key, path, scopeId, depth })),
    ).toEqual([
      { key: "/Core", path: "Core", scopeId: undefined, depth: 0 },
      { key: "shop/Core", path: "Core", scopeId: "shop", depth: 0 },
      { key: "shop/Core/Inner", path: "Core/Inner", scopeId: "shop", depth: 1 },
    ]);
    const [model, system] = scene.groups;
    expect(model?.box).not.toEqual(system?.box);
    const customer = scene.boxes.get("customer");
    const web = scene.boxes.get("web");
    expect(customer && model && inside(customer, model.box)).toBe(true);
    expect(web && model && inside(web, model.box)).toBe(false);
    expect(web && system && inside(web, system.box)).toBe(true);
  });
});

function inside(
  box: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    box.x >= frame.x &&
    box.y >= frame.y &&
    box.x + box.width <= frame.x + frame.width &&
    box.y + box.height <= frame.y + frame.height
  );
}
