import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Modeler } from "@miragon/team-topologies-renderer";
import { emptyDocument } from "@miragon/team-topologies-schema-model";

/**
 * The renderer's own palette, for a host that mounts it without the modeler shell (guide §5.5,
 * §5.14), and its rules' reach: they lay out this modeler's palette and no other on the page.
 */

const HOST = { width: 1024, height: 768 };

interface Mounted {
  host: HTMLDivElement;
  container: HTMLDivElement;
  modeler: Modeler;
}

const mounted: Mounted[] = [];

afterEach(async () => {
  for (const { modeler, host } of mounted.splice(0)) {
    // Off the palette first: diagram-js's tooltip would otherwise show on the destroyed diagram.
    await userEvent.hover(host, { position: { x: HOST.width - 8, y: HOST.height - 8 } });
    modeler.destroy();
    host.remove();
  }
});

function mount(): Mounted {
  const host = document.createElement("div");
  host.style.cssText = `position: fixed; left: 0; top: 0; width: ${HOST.width}px; height: ${HOST.height}px;`;
  const container = document.createElement("div");
  host.append(container);
  document.body.append(host);
  const modeler = new Modeler({ container });
  modeler.importDocument(emptyDocument("Palette"));
  const result = { host, container, modeler };
  mounted.push(result);
  return result;
}

function boxIn(element: Element, origin: Element): DOMRect {
  const box = element.getBoundingClientRect();
  const originBox = origin.getBoundingClientRect();
  return new DOMRect(box.left - originBox.left, box.top - originBox.top, box.width, box.height);
}

/** What `property: value` computes to inside `container`, where the roles are the container's. */
function resolved(container: HTMLElement, property: string, value: string): string {
  const probe = document.createElement("div");
  probe.style.setProperty(property, value);
  container.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return computed;
}

/** `rgb(r, g, b)` as its three channels. */
function rgbOf(color: string): number[] {
  return (color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

/** The colour on screen at a point of `element`, in px from its top left. */
async function pixelOf(element: HTMLElement, x: number, y: number): Promise<number[]> {
  const base64 = await page.screenshot({ element, save: false });
  const bitmap = await createImageBitmap(
    await (await fetch(`data:image/png;base64,${base64}`)).blob(),
  );
  const scale = bitmap.width / element.getBoundingClientRect().width;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data;
  return [data[0]!, data[1]!, data[2]!];
}

test("keeps the focus ring visible beside a hovered neighbour, which paints after it", async () => {
  await page.viewport(HOST.width, HOST.height);
  const { host, container } = mount();
  const [focused, neighbour] = [
    ...container.querySelectorAll<HTMLElement>(
      '.djs-palette .group[data-group="tt-1-teams"] .entry',
    ),
  ];
  expect(boxIn(neighbour!, host).left - boxIn(focused!, host).right).toBe(2);

  await userEvent.hover(neighbour!);
  const hoverFill = resolved(container, "background-color", "var(--cd-ui-hover)");
  await vi.waitFor(() => expect(getComputedStyle(neighbour!).backgroundColor).toBe(hoverFill));
  focused!.tabIndex = 0;
  focused!.focus();
  await userEvent.keyboard("{Shift}");
  expect(focused!.matches(":focus-visible")).toBe(true);
  expect(getComputedStyle(focused!).outlineOffset).toBe("2px");

  const box = boxIn(focused!, host);
  const ring = await pixelOf(host, box.right + 3, box.top + box.height / 2);
  expect(ring).toEqual(rgbOf(resolved(container, "color", "var(--cd-ui-fokus)")));
});

test("leaves another diagram-js palette on the same page as diagram-js lays it out", () => {
  const { container } = mount();
  expect(getComputedStyle(container.querySelector(".djs-palette")!).top).toBe("12px");

  const other = document.createElement("div");
  other.style.cssText = "position: relative; width: 600px; height: 400px;";
  other.innerHTML =
    '<div class="djs-palette open"><div class="djs-palette-entries"><div class="group">' +
    '<div class="entry"></div></div></div></div>';
  document.body.append(other);
  try {
    const palette = getComputedStyle(other.querySelector(".djs-palette")!);
    expect([palette.top, palette.left, palette.transform, palette.zIndex]).toEqual([
      "20px",
      "20px",
      "none",
      "auto",
    ]);
    expect(getComputedStyle(other.querySelector(".entry")!).width).toBe("46px");
  } finally {
    other.remove();
  }
});
