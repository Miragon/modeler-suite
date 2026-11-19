import type {
  AppearanceRequest,
  AppearanceSurface,
  AppearanceTheme,
  CollaborativeModeler,
} from "../index.js";
import type { CaseOutcome, ConformanceCase, ConformanceHarness } from "./harness.js";
import { hostMadeSince, nextHostSerial } from "./hosts.js";
import {
  changeEvents,
  errorOf,
  exportOrFail,
  fail,
  firstText,
  importOrFail,
  outcomeOf,
  same,
  selectionOf,
  settleOf,
  skip,
} from "./support.js";

const KNOWN_THEMES: readonly AppearanceTheme[] = ["light", "dark"];

/** a theme and a contrast no modeler knows, as an untyped host may send them */
const UNKNOWN_THEME = "sepia" as AppearanceTheme;

const UNKNOWN_CONTRAST = "maximal" as AppearanceRequest["contrast"];

function themesOf(appearance: AppearanceSurface, who: string): AppearanceTheme[] {
  const themes: unknown = appearance.themes;
  if (!Array.isArray(themes) || themes.length === 0) {
    fail(
      `${who}appearance.themes is ${JSON.stringify(themes)} — the themes the modeler can draw, a non-empty list`,
    );
  }
  if (new Set(themes).size !== themes.length) {
    fail(`${who}appearance.themes lists a theme twice: ${JSON.stringify(themes)}`);
  }
  const unknown = themes.filter((theme) => !KNOWN_THEMES.includes(theme as AppearanceTheme));
  if (unknown.length > 0) {
    fail(`${who}appearance.themes lists ${JSON.stringify(unknown)} — a theme is "light" or "dark"`);
  }
  return [...(themes as AppearanceTheme[])];
}

const describeRequest = (request: AppearanceRequest): string => {
  const contrast = request.contrast === undefined ? "" : `, contrast: "${request.contrast}"`;
  return `appearance.set({ theme: "${request.theme}"${contrast} })`;
};

const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "box-shadow",
] as const;

interface PaintedElement {
  element: Element;
  colours: string[];
}

/** every element in the host with its computed colours, once the colour transitions have run */
function paintedIn(host: HTMLElement): PaintedElement[] {
  // a transition shows the colour it starts from until it has run: a request draws its end
  const animations =
    typeof host.getAnimations === "function" ? host.getAnimations({ subtree: true }) : [];
  for (const animation of animations) {
    if ("transitionProperty" in animation) animation.finish();
  }
  const view = host.ownerDocument.defaultView ?? window;
  return [...host.querySelectorAll("*")].map((element) => {
    const style = view.getComputedStyle(element);
    return {
      element,
      colours: COLOUR_PROPERTIES.map((property) => style.getPropertyValue(property)),
    };
  });
}

const describeElement = (element: Element): string => {
  const classes = (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((name) => name !== "")
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join("");
  return `<${element.tagName.toLowerCase()}>${classes}`;
};

function colourDifference(
  reference: PaintedElement[],
  painted: PaintedElement[],
): string | undefined {
  if (reference.length !== painted.length) {
    return `the host holds ${painted.length} elements, ${reference.length} in the reference`;
  }
  for (const [index, { element, colours }] of painted.entries()) {
    const expected = reference[index]?.colours ?? [];
    for (const [position, property] of COLOUR_PROPERTIES.entries()) {
      if (colours[position] !== expected[position]) {
        return `${describeElement(element)} has ${property} ${colours[position]}, the reference ${expected[position]}`;
      }
    }
  }
  return undefined;
}

function hostOfTheModeler(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  firstSerial: number,
): HTMLElement | string {
  const search = hostMadeSince(h, m, firstSerial, (host) => host.firstElementChild);
  switch (search.kind) {
    case "found":
      return search.mount.host;
    case "unnamed":
    case "outside":
      return "the canvas canvasElement() names lies in no attachedHost() — the computed colours were not compared";
  }
  return search.count === 0
    ? "create() mounted the modeler into no attachedHost() — the computed colours were not compared (mount into attachedHost())"
    : `create() filled ${search.count} attachedHost() elements — the kit cannot tell which one holds the modeler, so the computed colours were not compared`;
}

function pageMode(theme: string | null, contrast: string | null): void {
  const root = document.documentElement;
  for (const [name, value] of [
    ["data-cd-theme", theme],
    ["data-cd-kontrast", contrast],
  ] as const) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
}

/**
 * the appearance case's DOM half: the computed colours of everything in the modeler's
 * attachedHost(). The reference is a request for `themes[0]` on a page without `data-cd-theme`,
 * once per contrast; a request for a theme `themes` does not list, on a page in the other mode with
 * high contrast, must draw the reference of its contrast, also after a re-import. A listed theme
 * other than `themes[0]` must draw something else. Returns why the colours were not compared
 */
async function coloursFollowTheRequest(
  h: ConformanceHarness,
  themes: AppearanceTheme[],
): Promise<string | undefined> {
  if (typeof document === "undefined") {
    return "no DOM — the computed colours were not compared (run the kit in a browser, the modeler mounted into attachedHost())";
  }
  const root = document.documentElement;
  const page = {
    theme: root.getAttribute("data-cd-theme"),
    contrast: root.getAttribute("data-cd-kontrast"),
  };
  const firstSerial = nextHostSerial();
  const m = await h.create();
  try {
    const appearance = m.appearance;
    if (!appearance) fail("the appearance surface went away on a second instance");
    const host = hostOfTheModeler(h, m, firstSerial);
    if (typeof host === "string") return host;
    const [lead = "light"] = themes;
    const other: AppearanceTheme = lead === "light" ? "dark" : "light";
    const first = firstText(h);
    pageMode(null, null);
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    await settleOf(h)();
    const paintedFor = (contrast: "normal" | "high"): PaintedElement[] => {
      appearance.set({ theme: lead, contrast });
      return paintedIn(host);
    };
    const reference = { normal: paintedFor("normal"), high: paintedFor("high") };
    const expectReference = (contrast: "normal" | "high", when: string): void => {
      const difference = colourDifference(reference[contrast], paintedIn(host));
      if (difference !== undefined) {
        fail(
          `${when}, the modeler drew other colours than for ${describeRequest({ theme: lead, contrast })} on a page without data-cd-theme: ${difference} — a theme themes does not list draws themes[0], and the request's contrast holds, whatever mode the page shows`,
        );
      }
    };
    pageMode(other, "hoch");
    const onThePage = `on a page in the other mode (data-cd-theme="${other}" and data-cd-kontrast="hoch" on <html>)`;
    const unlisted = [...KNOWN_THEMES.filter((theme) => !themes.includes(theme)), UNKNOWN_THEME];
    for (const theme of unlisted) {
      for (const contrast of ["normal", "high"] as const) {
        const request = { theme, contrast };
        appearance.set(request);
        expectReference(contrast, `after ${describeRequest(request)} ${onThePage}`);
      }
    }
    // a re-import draws the canvas anew, so the reference for it is drawn again afterwards, on
    // the same elements
    for (const contrast of ["normal", "high"] as const) {
      const request = { theme: unlisted[0] ?? UNKNOWN_THEME, contrast };
      pageMode(other, "hoch");
      appearance.set(request);
      await importOrFail(m, first, "re-importing canonicalTexts[0] rejected");
      await settleOf(h)();
      const reimported = paintedIn(host);
      pageMode(null, null);
      appearance.set({ theme: lead, contrast });
      const difference = colourDifference(paintedIn(host), reimported);
      if (difference !== undefined) {
        fail(
          `after ${describeRequest(request)} and a re-import ${onThePage}, the modeler drew other colours than for ${describeRequest({ theme: lead, contrast })} on a page without data-cd-theme: ${difference} — a request holds across every later import`,
        );
      }
    }
    pageMode(null, null);
    for (const theme of themes.filter((listed) => listed !== lead)) {
      const doc = exportOrFail(m, "before a request for a listed theme");
      const image = h.exportImage ? await h.exportImage(m) : undefined;
      // the re-imports above drew the canvas anew, so its light reference is drawn again first
      const leadOnThisCanvas = paintedFor("normal");
      appearance.set({ theme, contrast: "normal" });
      if (colourDifference(leadOnThisCanvas, paintedIn(host)) === undefined) {
        fail(
          `appearance.themes lists "${theme}", but ${describeRequest({ theme })} drew the colours of "${lead}" — a modeler draws every theme it lists`,
        );
      }
      if (exportOrFail(m, `after ${describeRequest({ theme })}`) !== doc) {
        fail(`${describeRequest({ theme })} changed exportText() — exports are always light`);
      }
      if (h.exportImage && (await h.exportImage(m)) !== image) {
        fail(`${describeRequest({ theme })} changed the image export — exports are always light`);
      }
    }
    return undefined;
  } finally {
    pageMode(page.theme, page.contrast);
    m.destroy();
  }
}

async function appearanceOverAnInteraction(
  h: ConformanceHarness,
  m: CollaborativeModeler,
  appearance: AppearanceSurface,
  themes: AppearanceTheme[],
): Promise<string | undefined> {
  const openInteraction = h.openInteraction;
  if (!openInteraction) return undefined;
  const settle = settleOf(h);
  const first = firstText(h);
  const request: AppearanceRequest = { theme: themes[0] ?? "light", contrast: "high" };
  await importOrFail(m, first, "re-importing canonicalTexts[0] rejected");
  appearance.set({ theme: request.theme, contrast: "normal" });
  const doc = exportOrFail(m, "after importing canonicalTexts[0]");
  let committed: string | undefined;
  if (h.commitInteraction) {
    await openInteraction(m);
    await settle();
    await h.commitInteraction(m);
    await settle();
    committed = exportOrFail(m, "after committing the interaction");
    await importOrFail(m, first, "re-importing canonicalTexts[0] after the commit rejected");
  }
  await openInteraction(m);
  await settle();
  const opened = h.interactionState?.(m);
  const { calls } = await changeEvents(h, m, () => appearance.set(request));
  if (
    calls > 0 ||
    exportOrFail(m, `after ${describeRequest(request)} over an open interaction`) !== doc
  ) {
    fail(
      `${describeRequest(request)} over an open interaction committed it${calls > 0 ? ` (onContentChanged ${calls}x)` : ""} — like a host's view change, a request never commits an interaction in progress`,
    );
  }
  const after = h.interactionState?.(m);
  if (
    opened !== undefined &&
    (after?.elementId !== opened.elementId || after?.text !== opened.text)
  ) {
    const what = after === undefined ? "closed it" : `left ${JSON.stringify(after)} open`;
    return `an interaction on '${opened.elementId}' did not survive ${describeRequest(request)} (the request ${what}) — RECOMMENDED: keep it open with its typed input, so the user's commit afterwards writes what it would have written without the request`;
  }
  if (h.commitInteraction && committed !== undefined && committed !== doc) {
    await h.commitInteraction(m);
    await settle();
    const out = exportOrFail(
      m,
      `after committing the interaction after ${describeRequest(request)}`,
    );
    if (out !== committed) {
      return `committing an interaction after ${describeRequest(request)} wrote another document than committing it without one — RECOMMENDED: keep it open with its typed input across a request:\n--- committed without a request\n${committed}\n--- committed after the request\n${out}`;
    }
  }
  return undefined;
}

/** every rule but the keep-open of an interaction is stated by the contract, so each one fails */
async function appearanceIsViewState(h: ConformanceHarness): Promise<CaseOutcome> {
  const settle = settleOf(h);
  const first = firstText(h);
  const others: CollaborativeModeler[] = [];
  const m = await h.create();
  try {
    const appearance = m.appearance;
    if (!appearance) {
      return skip("the modeler exposes no appearance surface (optional, 1.5) — nothing to verify");
    }
    const themes = themesOf(appearance, "");
    if (!same(themesOf(appearance, "a second read of "), themes)) {
      fail("appearance.themes changed between two reads — it is fixed before the modeler runs");
    }
    const unverified: string[] = [];
    const another = await h.create();
    others.push(another);
    if (!another.appearance || !same(themesOf(another.appearance, "another instance's "), themes)) {
      fail(
        "another instance of the modeler reports other appearance.themes — they are the same on every instance",
      );
    }
    if (h.createReadonly) {
      const viewer = await h.createReadonly();
      others.push(viewer);
      if (viewer.appearance) {
        if (!same(themesOf(viewer.appearance, "the viewer's "), themes)) {
          fail(
            "the viewer reports other appearance.themes than the modeler — they are the same on the viewer",
          );
        }
      } else {
        unverified.push("the viewer exposes no appearance surface — its themes were not compared");
      }
    } else {
      unverified.push("createReadonly is undefined — the viewer's themes were not compared");
    }
    const lead = themes[0] ?? "light";
    const beforeImport = await errorOf(() => appearance.set({ theme: lead }));
    if (beforeImport !== undefined) {
      fail(`${describeRequest({ theme: lead })} threw before the first import: ${beforeImport}`);
    }
    await importOrFail(m, first, "importText(canonicalTexts[0]) rejected");
    const imported = exportOrFail(m, "after importing canonicalTexts[0]");
    await h.mutate(m);
    await settle();
    const revealed = m.elements?.list()[0]?.id;
    if (revealed !== undefined) m.elements?.reveal(revealed);
    if (h.viewState !== undefined) m.setViewState(h.viewState);
    await settle();
    const doc = exportOrFail(m, "after a user mutation");
    const image = h.exportImage ? await h.exportImage(m) : undefined;
    const view = m.getViewState();
    const selection = selectionOf(m);
    const requests: AppearanceRequest[] = [
      { theme: "light" },
      { theme: "dark" },
      { theme: "light", contrast: "high" },
      { theme: "dark", contrast: "high" },
      { theme: UNKNOWN_THEME },
      { theme: lead, contrast: UNKNOWN_CONTRAST },
      { theme: lead, contrast: "normal" },
    ];
    for (const request of requests) {
      const what = describeRequest(request);
      let thrown: string | undefined;
      const { calls } = await changeEvents(h, m, async () => {
        thrown = await errorOf(() => appearance.set(request));
      });
      if (thrown !== undefined) fail(`${what} threw: ${thrown} — set never throws`);
      if (calls > 0) {
        fail(
          `${what} fired onContentChanged ${calls}x — the appearance is view state, never document (L3)`,
        );
      }
      if (exportOrFail(m, `after ${what}`) !== doc) fail(`${what} changed exportText()`);
      if (h.exportImage && (await h.exportImage(m)) !== image) {
        fail(
          `${what} changed the image export — exports are always light, whatever the modeler draws`,
        );
      }
      if (!same(m.getViewState(), view)) fail(`${what} changed the view state`);
      if (selectionOf(m) !== selection) fail(`${what} changed the selection`);
    }
    if (h.undo) {
      await h.undo(m);
      await settle();
      if (exportOrFail(m, "after an undo that followed the requests") !== imported) {
        fail(
          "an undo after the appearance requests did not undo the user mutation before them — the requests changed the undo history",
        );
      }
    }
    if (!h.exportImage) {
      unverified.push(
        "exportImage is undefined — that the image export stays byte-identical was not verified",
      );
    }
    const advice = await appearanceOverAnInteraction(h, m, appearance, themes);
    if (!h.openInteraction) {
      unverified.push(
        "openInteraction is undefined — that a request never commits an open interaction was not verified",
      );
    }
    const colourGap = await coloursFollowTheRequest(h, themes);
    if (colourGap !== undefined) unverified.push(colourGap);
    return outcomeOf(advice === undefined ? {} : { advisories: [advice] }, unverified);
  } finally {
    m.destroy();
    for (const other of others) other.destroy();
  }
}

export const appearanceCase: ConformanceCase = {
  name: "appearance (when present, 1.5): a theme is view state, and a theme the modeler does not list draws themes[0], whatever mode the page shows",
  run: appearanceIsViewState,
};
