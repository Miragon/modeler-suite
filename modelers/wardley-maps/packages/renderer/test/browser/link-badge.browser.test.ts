import { afterEach, describe, expect, it } from "vitest";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { Modeler, NavigatedViewer, type WardleyViewerOptions } from "../../src/index.js";
import { isWardleyShape, type WardleyShape } from "../../src/model/di-types.js";
import { LINK_BADGE_CLASS } from "../../src/draw/styles.js";
import type WardleyLinkEditing from "../../src/link-editing/WardleyLinkEditing.js";
import "../../src/assets/wardley.css";

const LINKED_MAP = `title Linked
url Payment URL [details/payment.wmap]
url Docs URL [https://example.com/docs]
url Trap URL [javascript:alert(1)]
component Kettle [0.43, 0.35] url(Docs URL)
submap Payment [0.6, 0.5] url(Payment URL)
component Trap [0.3, 0.7] url(Trap URL)
component Power [0.1, 0.71]`;

type Mount = Modeler | NavigatedViewer;

let mounted: Mount | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  mounted?.destroy();
  container?.remove();
  mounted = undefined;
  container = undefined;
});

async function mount(
  Type: typeof Modeler | typeof NavigatedViewer,
  options: Pick<WardleyViewerOptions, "openRelativeLink"> = {},
): Promise<Mount> {
  container = document.createElement("div");
  document.body.appendChild(container);
  mounted = new Type({ container, width: 1024, height: 768, ...options });
  await mounted.importDSL(LINKED_MAP);
  return mounted;
}

function shapeOf(target: Mount, label: string): WardleyShape {
  const shape = target
    .get<ElementRegistry>("elementRegistry")
    .find((element) => isWardleyShape(element) && element.wardleyLabel === label);
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape as WardleyShape;
}

function badgeOf(target: Mount, label: string): SVGGElement | null {
  return target.container.querySelector<SVGGElement>(
    `.djs-shape[data-element-id="${shapeOf(target, label).id}"] .${LINK_BADGE_CLASS}`,
  );
}

function centerOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

describe("the link mark", () => {
  it("marks a component and a submap whose link the editor opens, at their lower left", async () => {
    const target = await mount(Modeler, { openRelativeLink: () => {} });

    for (const label of ["Kettle", "Payment"]) {
      const badge = badgeOf(target, label);
      expect(badge, label).not.toBeNull();
      expect(badge!.getAttribute("aria-hidden"), label).toBe("true");
      const node = target.container.querySelector(
        `.djs-shape[data-element-id="${shapeOf(target, label).id}"] .djs-visual > :first-child`,
      )!;
      const badgeCenter = centerOf(badge!);
      const nodeCenter = centerOf(node);
      expect(badgeCenter.x, label).toBeLessThan(nodeCenter.x);
      expect(badgeCenter.y, label).toBeGreaterThan(nodeCenter.y);
    }
  });

  it("draws in the link role and takes no pointer, so a click on it selects the element", async () => {
    const target = await mount(Modeler, { openRelativeLink: () => {} });
    const badge = badgeOf(target, "Kettle")!;
    const style = getComputedStyle(badge);
    const probe = document.createElement("span");
    probe.style.color = "var(--cd-ui-link)";
    target.container.appendChild(probe);

    expect(style.color).toBe(getComputedStyle(probe).color);
    expect(style.pointerEvents).toBe("none");
    const { x, y } = centerOf(badge.querySelector("circle")!);
    expect(document.elementFromPoint(x, y)?.closest(`.${LINK_BADGE_CLASS}`)).toBeNull();
    probe.remove();
  });

  it("marks no element whose link the editor can't open, nor one without a link", async () => {
    const target = await mount(Modeler);

    expect(badgeOf(target, "Kettle")).not.toBeNull();
    expect(badgeOf(target, "Payment")).toBeNull();
    expect(badgeOf(target, "Trap")).toBeNull();
    expect(badgeOf(target, "Power")).toBeNull();
  });

  it("marks nothing in the viewer, which opens no links", async () => {
    const target = await mount(NavigatedViewer, { openRelativeLink: () => {} });

    expect(target.container.querySelector(`.${LINK_BADGE_CLASS}`)).toBeNull();
  });

  it("follows the link as it is set, removed and brought back", async () => {
    const target = await mount(Modeler, { openRelativeLink: () => {} });
    const linkEditing = target.get<WardleyLinkEditing>("wardleyLinkEditing");
    const commandStack = target.get<CommandStack>("commandStack");

    expect(linkEditing.setLink(shapeOf(target, "Power"), "power.wmap")).toBe(true);
    expect(badgeOf(target, "Power")).not.toBeNull();
    expect(linkEditing.setLink(shapeOf(target, "Kettle"), "")).toBe(true);
    expect(badgeOf(target, "Kettle")).toBeNull();
    commandStack.undo();
    expect(badgeOf(target, "Kettle")).not.toBeNull();
  });

  it("is left out of the export", async () => {
    const target = await mount(Modeler, { openRelativeLink: () => {} });
    expect(target.container.querySelectorAll(`.${LINK_BADGE_CLASS}`)).toHaveLength(2);

    const { svg } = await (target as Modeler).saveSVG();

    expect(svg).not.toContain(LINK_BADGE_CLASS);
    expect(target.container.querySelectorAll(`.${LINK_BADGE_CLASS}`)).toHaveLength(2);
  });
});
