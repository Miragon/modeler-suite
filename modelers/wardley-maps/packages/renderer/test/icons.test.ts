import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LUCIDE, chromeIcon, type LucideIconName } from "../src/draw/lucide.js";

type IconNode = [tag: string, attributes: Record<string, string>];

/**
 * The entries of `icon-nodes.json` in lucide-static 1.59.0 for the icons `LUCIDE` copies, plus
 * `calendar-x-2`, whose corner `x` the derived icon borrows. Re-copy them from the new release
 * when `LUCIDE` moves to one.
 */
const upstream = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/lucide-static-1.59.0.icon-nodes.json", import.meta.url)),
    "utf8",
  ),
) as Record<string, IconNode[]>;

const DERIVED_ICON = "chevrons-right-x";

function nodeMarkup(nodes: IconNode[]): string {
  return nodes
    .map(([tag, attributes]) => {
      const attributeText = Object.entries(attributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(" ");
      return `<${tag} ${attributeText}/>`;
    })
    .join("");
}

function movePathStart(nodes: IconNode[], deltaX: number, deltaY: number): IconNode[] {
  return nodes.map(([tag, attributes]) => [
    tag,
    {
      ...attributes,
      d: attributes.d!.replace(
        /^m(-?[\d.]+) (-?[\d.]+)/,
        (_, x: string, y: string) => `m${Number(x) + deltaX} ${Number(y) + deltaY}`,
      ),
    },
  ]);
}

describe("chrome icons", () => {
  it("draws every Lucide icon at 16px with stroke 2.5 in currentColor and no fill", () => {
    for (const name of Object.keys(LUCIDE) as LucideIconName[]) {
      const markup = chromeIcon(name);
      expect(markup, name).toMatch(/^<svg [^>]*width="16" height="16" viewBox="0 0 24 24"/);
      expect(markup, name).toContain('fill="none" stroke="currentColor" stroke-width="2.5"');
      expect(markup, name).toContain('stroke-linecap="round" stroke-linejoin="round"');
    }
  });

  it("copies every stock icon unchanged from lucide-static 1.59.0", () => {
    const stockNames = (Object.keys(LUCIDE) as LucideIconName[]).filter(
      (name) => name !== DERIVED_ICON,
    );
    for (const name of stockNames) {
      expect(upstream[name], name).toBeDefined();
      expect(LUCIDE[name], name).toBe(nodeMarkup(upstream[name]!));
    }
  });

  it("derives chevrons-right-x from chevrons-right moved by (-2, -1) and calendar-x-2's corner x", () => {
    const cornerX = upstream["calendar-x-2"]!.filter(([, attributes]) =>
      attributes.d?.startsWith("m17 "),
    );
    expect(cornerX).toHaveLength(2);
    expect(LUCIDE[DERIVED_ICON]).toBe(
      nodeMarkup([...movePathStart(upstream["chevrons-right"]!, -2, -1), ...cornerX]),
    );
  });

  it("keeps the derived icon on the Lucide grid: strokes only, centre lines within 2 to 22", () => {
    const geometry = LUCIDE["chevrons-right-x"];
    expect(geometry).not.toMatch(/fill=|<mask|#/);
    // Every path is a relative `m x y dx dy …` polyline.
    const points = [...geometry.matchAll(/d="m([^"]+)"/g)].flatMap(([, data]) => {
      const [x, y, ...deltas] = data!.match(/-?\d*\.?\d+/g)!.map(Number);
      const visited = [{ x: x!, y: y! }];
      for (let index = 0; index < deltas.length; index += 2) {
        const previous = visited.at(-1)!;
        visited.push({ x: previous.x + deltas[index]!, y: previous.y + deltas[index + 1]! });
      }
      return visited;
    });
    expect(points.length).toBeGreaterThan(8);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(2);
      expect(point.x).toBeLessThanOrEqual(22);
      expect(point.y).toBeGreaterThanOrEqual(2);
      expect(point.y).toBeLessThanOrEqual(22);
    }
  });
});
