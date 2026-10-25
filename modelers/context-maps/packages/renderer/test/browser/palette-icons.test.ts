import { afterEach, expect, test } from "vitest";
import {
  Modeler,
  contextIconSvg,
  isCmContext,
  relationshipIconSvg,
  roleChipSvg,
  subdomainIconSvg,
} from "@miragon/context-maps-renderer";
import {
  emptyDocument,
  type DownstreamRole,
  type UpstreamRole,
} from "@miragon/context-maps-schema-model";

declare global {
  interface Window {
    cmInjected?: boolean;
  }
}

const RAISE_FLAG = "window.cmInjected = true";

/** Payloads that run `RAISE_FLAG` once a value ends and markup of its own begins. */
const HOSTILE_ROLES = [
  `<img src=x onerror="${RAISE_FLAG}">`,
  `</text></svg><img src=x onerror="${RAISE_FLAG}">`,
  `"><svg onload="${RAISE_FLAG}"></svg>`,
];
const HOSTILE_SIZES = [
  `24"><img src=x onerror="${RAISE_FLAG}">`,
  `24" onload="${RAISE_FLAG}`,
  `url(javascript:${RAISE_FLAG})`,
];

const INJECTED_ELEMENTS = ["img", "script", "style", "a", "foreignObject", "iframe"];

function injectedElementsIn(root: ParentNode, scope = ""): number {
  return root.querySelectorAll(INJECTED_ELEMENTS.map((name) => `${scope} ${name}`).join(", "))
    .length;
}

/** An image error event needs a round trip to the test server, so a broken-out handler gets time. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

function mount(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = "900px";
  container.style.height = "640px";
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  delete window.cmInjected;
  document.body.replaceChildren();
});

test("a host that writes the glyphs with innerHTML runs nothing a hostile value carries", async () => {
  const markups = [
    ...HOSTILE_ROLES.map((role) => roleChipSvg(role as UpstreamRole | DownstreamRole)),
    ...HOSTILE_SIZES.flatMap((size) => [
      relationshipIconSvg("shared-kernel", size as unknown as number),
      subdomainIconSvg("supporting", size as unknown as number),
    ]),
    ...HOSTILE_ROLES.map((type) => contextIconSvg(type as never)),
  ];
  const host = mount();
  for (const markup of markups) {
    const slot = document.createElement("span");
    slot.innerHTML = markup;
    host.append(slot);
  }
  await settle();

  expect(window.cmInjected).toBeUndefined();
  expect(injectedElementsIn(host)).toBe(0);
  for (const slot of host.children) {
    expect(slot.children).toHaveLength(1);
    const glyph = slot.children[0] as SVGSVGElement;
    expect(glyph.getAttributeNames().filter((name) => name.startsWith("on"))).toEqual([]);
    expect(glyph.querySelectorAll("svg")).toHaveLength(0);
  }
  const chipTexts = [...host.querySelectorAll("text")].map((text) => text.textContent);
  expect(chipTexts).toEqual(HOSTILE_ROLES);
});

test("a team name with markup stays text in the context pad's tooltip", async () => {
  const team = `"><img src=x onerror="${RAISE_FLAG}">`;
  const map = emptyDocument("m");
  map.contexts = [
    { id: "a", label: "A", team, position: { x: 100, y: 200 }, size: { width: 200, height: 110 } },
  ];
  const container = mount();
  const modeler = new Modeler({ container });
  try {
    modeler.importDocument(map);
    const registry = modeler.get<{ getAll(): unknown[] }>("elementRegistry");
    const selection = modeler.get<{ select(element: unknown): void }>("selection");
    selection.select(registry.getAll().filter(isCmContext)[0]);
    await settle();

    const entry = container.querySelector('.djs-context-pad.open [data-action="team"]');
    expect(entry?.getAttribute("title")).toBe(`Set owning team (currently ${team})`);
    expect(entry?.getAttribute("aria-label")).toBe(`Set owning team (currently ${team})`);
    expect(injectedElementsIn(container, ".djs-context-pad")).toBe(0);
    expect(window.cmInjected).toBeUndefined();
  } finally {
    modeler.destroy();
  }
});
