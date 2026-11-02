import { describe, expect, it } from "vitest";
import { groupKey, type Box, type ElementId } from "@miragon/c4-schema-model";
import { layoutView, viewFrames } from "../src/index.js";
import { layoutInput, type ViewSpec } from "./support/views.js";

const SPEC: ViewSpec = {
  elements: ["user", "web", "api", "db", "mail"],
  relationships: [
    ["user", "web"],
    ["web", "api"],
    ["api", "db"],
    ["api", "mail"],
  ],
  boundaries: [{ elementId: "shop", members: ["web", "api", "db"], depth: 0 }],
  groups: [{ path: "Back end", name: "Back end", members: ["api", "db"], depth: 0 }],
  stored: {
    user: { x: 0, y: 0 },
    web: { x: 400, y: 0 },
    api: { x: 400, y: 320 },
    db: { x: 400, y: 640 },
    mail: { x: 800, y: 320 },
  },
};

function boxesOf(spec: ViewSpec): Map<ElementId, Box> {
  return new Map(layoutView(layoutInput(spec)).boxes);
}

describe("viewFrames", () => {
  it("derives the frames layoutView draws from the same boxes", () => {
    const input = layoutInput(SPEC);
    const geometry = layoutView(input);
    const frames = viewFrames(input.members, geometry.boxes);
    expect(frames.boundaries.get("shop")?.box).toEqual(geometry.boundaries.get("shop"));
    const backEnd = groupKey(undefined, "Back end");
    expect(frames.groups.get(backEnd)?.box).toEqual(geometry.groups.get(backEnd));
  });

  it("follows a member to its new box, around the group frame inside it", () => {
    const input = layoutInput(SPEC);
    const boxes = boxesOf(SPEC);
    boxes.set("db", { x: 0, y: 640, width: 240, height: 160 });
    const frame = viewFrames(input.members, boxes).boundaries.get("shop");
    expect(frame?.box.x).toBe(0 - 32 - 32);
    expect(frame?.box.y).toBe(0 - 32);
  });

  it("names the elements outside a frame that it now overlaps, and none it frames", () => {
    const input = layoutInput(SPEC);
    const boxes = boxesOf(SPEC);
    expect(viewFrames(input.members, boxes).boundaries.get("shop")?.intruders).toEqual([]);
    boxes.set("db", { x: 0, y: 640, width: 240, height: 160 });
    expect(viewFrames(input.members, boxes).boundaries.get("shop")?.intruders).toEqual(["user"]);
  });

  it("keeps the given box of a boundary that frames nothing drawn", () => {
    const spec: ViewSpec = {
      elements: ["user"],
      boundaries: [{ elementId: "shop", members: [], depth: 0 }],
      stored: { user: { x: 0, y: 0 } },
    };
    const input = layoutInput(spec);
    const leaf = { x: 600, y: 0, width: 320, height: 200 };
    const frames = viewFrames(input.members, boxesOf(spec), new Map([["shop", leaf]]));
    expect(frames.boundaries.get("shop")).toEqual({ box: leaf, intruders: [] });
  });

  it("grows a leaf boundary around an element that joins it", () => {
    const spec: ViewSpec = {
      elements: ["user", "new"],
      boundaries: [{ elementId: "shop", members: ["new"], depth: 0 }],
      stored: { user: { x: 0, y: 0 }, new: { x: 600, y: 0 } },
    };
    const input = layoutInput(spec);
    const frames = viewFrames(input.members, boxesOf(spec), new Map());
    expect(frames.boundaries.get("shop")?.box).toEqual({
      x: 600 - 32,
      y: 0 - 32,
      width: 240 + 64,
      height: 160 + 64 + 40,
    });
  });
});
