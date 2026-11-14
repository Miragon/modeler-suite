import { describe, expect, test } from "vitest";
import {
  BLOCK_HEADING_HEIGHT,
  BLOCK_IDS,
  BLOCK_PADDING,
  STICKY_GAP,
  STICKY_SIZE,
  blockAt,
  createEmptyDocument,
  insertSticky,
  layoutCanvas,
  slotAt,
  withColumns,
  type BlockId,
  type CanvasDocument,
} from "../src/index.js";

function withStickies(blockId: BlockId, count: number, document = createEmptyDocument()) {
  let next: CanvasDocument = document;
  for (let index = 0; index < count; index++) {
    next = insertSticky(next, blockId, index, {
      id: `${blockId}-${index}`,
      text: `${index}`,
      attributes: [],
      notes: [],
    });
  }
  return next;
}

const rectOf = (document: CanvasDocument, blockId: BlockId) =>
  layoutCanvas(document).blocks.find((block) => block.blockId === blockId)!.rect;

describe("layoutCanvas", () => {
  test("lays the nine blocks out as the canvas does, without gaps", () => {
    const layout = layoutCanvas(createEmptyDocument());
    expect(layout.blocks.map((block) => block.blockId).sort()).toEqual([...BLOCK_IDS].sort());
    const area = layout.blocks.reduce((sum, { rect }) => sum + rect.width * rect.height, 0);
    const framed = layout.bounds.height - layout.header.height - layout.footer.height;
    expect(area).toBe(layout.bounds.width * framed);
    const partners = rectOf(createEmptyDocument(), "key-partners");
    const activities = rectOf(createEmptyDocument(), "key-activities");
    const resources = rectOf(createEmptyDocument(), "key-resources");
    expect(activities.x).toBe(partners.x + partners.width);
    expect(resources.y).toBe(activities.y + activities.height);
    expect(activities.height + resources.height).toBe(partners.height);
    const cost = rectOf(createEmptyDocument(), "cost-structure");
    const revenue = rectOf(createEmptyDocument(), "revenue-streams");
    expect(cost.width).toBe(revenue.width);
    expect(cost.y).toBe(partners.y + partners.height);
  });

  test("grows the whole top row when one block overflows, and stacked pairs together", () => {
    const empty = createEmptyDocument();
    const crowded = withStickies("key-resources", 12);
    const resources = rectOf(crowded, "key-resources");
    expect(resources.height).toBeGreaterThan(rectOf(empty, "key-resources").height);
    expect(rectOf(crowded, "key-activities").height).toBe(resources.height);
    expect(rectOf(crowded, "channels").height).toBe(resources.height);
    expect(rectOf(crowded, "value-propositions").height).toBe(2 * resources.height);
    expect(rectOf(crowded, "cost-structure").height).toBe(rectOf(empty, "cost-structure").height);
  });

  test("puts the canvas's columns of stickies side by side in each block of the top row", () => {
    const narrow = layoutCanvas(withStickies("channels", 11));
    const wide = layoutCanvas(withColumns(withStickies("channels", 11), 3));
    expect(narrow.blocks.find((block) => block.blockId === "channels")!.columns).toBe(2);
    expect(wide.blocks.find((block) => block.blockId === "channels")!.columns).toBe(3);
    expect(wide.bounds.width).toBeGreaterThan(narrow.bounds.width);
    expect(wide.bounds.height).toBeLessThan(narrow.bounds.height);
    const revenue = wide.blocks.find((block) => block.blockId === "revenue-streams")!;
    expect(revenue.rect.width).toBe(wide.bounds.width / 2);
  });

  test("flows stickies in file order, row by row, inside their block", () => {
    const document = withStickies("channels", 3);
    const layout = layoutCanvas(document);
    const block = layout.blocks.find((candidate) => candidate.blockId === "channels")!;
    const [first, second, third] = [0, 1, 2].map((index) =>
      layout.stickies.get(`channels-${index}`)!,
    );
    expect(second!.x).toBe(first!.x + STICKY_SIZE.width + STICKY_GAP);
    expect(third!.y).toBeGreaterThan(first!.y);
    for (const rect of [first!, second!, third!]) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(block.rect.x + block.rect.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(block.rect.y + block.rect.height);
    }
  });
});

describe("placement inside a block", () => {
  test("fills a block from the top left under its heading, as on the poster", () => {
    for (const count of [1, 2, 5]) {
      const layout = layoutCanvas(withStickies("key-partners", count));
      const block = layout.blocks.find((candidate) => candidate.blockId === "key-partners")!;
      expect(layout.stickies.get("key-partners-0")).toMatchObject({
        x: block.rect.x + BLOCK_PADDING,
        y: block.rect.y + BLOCK_HEADING_HEIGHT,
      });
    }
  });
});

describe("dropping", () => {
  test("finds the block under the point, and the nearest one outside the canvas", () => {
    const layout = layoutCanvas(createEmptyDocument());
    const segments = rectOf(createEmptyDocument(), "customer-segments");
    expect(blockAt(layout, { x: segments.x + 10, y: segments.y + 10 }).blockId).toBe(
      "customer-segments",
    );
    expect(blockAt(layout, { x: -500, y: 200 }).blockId).toBe("key-partners");
    expect(blockAt(layout, { x: 5000, y: 5000 }).blockId).toBe("revenue-streams");
  });

  test("takes the slot before the sticky whose left half is under the point", () => {
    const document = withStickies("channels", 3);
    const layout = layoutCanvas(document);
    const block = layout.blocks.find((candidate) => candidate.blockId === "channels")!;
    const second = layout.stickies.get("channels-1")!;
    expect(slotAt(block, { x: second.x + 5, y: second.y + 5 }, 3)).toBe(1);
    expect(slotAt(block, { x: second.x + second.width - 5, y: second.y + 5 }, 3)).toBe(2);
    expect(slotAt(block, { x: block.rect.x + 1, y: block.rect.y + block.rect.height - 1 }, 3)).toBe(
      3,
    );
    expect(slotAt(block, { x: block.rect.x, y: block.rect.y }, 3)).toBe(0);
  });
});
