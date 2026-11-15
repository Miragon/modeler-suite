/// <reference types="@vitest/browser-playwright" />
/**
 * The board's sheet on a page that gives it nothing: no reset, no tokens, no font. The sheet was
 * measured on a page with Tailwind's preflight and a ui-kit's aliases; here it stands on its own
 * base (`assets/board-base.css`) and on the design system's roles. This file checks the boxes and
 * colours that rest on those two, on static markup written after the DOM contract: no component
 * is imported, so nothing here waits for React.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, page } from "vitest/browser";

import "../../src/assets/board.css";

const NODE_WIDTH = 400;
const NODE_HEIGHT = 300;
/** HEADER_HEIGHT in nodes/model-node.tsx: the body is the node minus this */
const HEADER_HEIGHT = 32;
const NOTE_WIDTH = 200;
const NOTE_HEIGHT = 120;

const handles = ["top", "right", "bottom", "left"]
  .map((side) => `<div class="react-flow__handle react-flow__handle-${side} source"></div>`)
  .join("");

const modelNode = (id: string, top: number, engine: string): string => `
  <div class="react-flow__node react-flow__node-model" data-id="${id}"
    style="left: 20px; top: ${top}px; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px">
    ${handles}
    <div class="board-node" data-armed="false" data-strategy="overlay">
      <header class="board-node__header">
        <svg class="board-node__grip" viewBox="0 0 24 24" aria-hidden="true"></svg>
        <span class="board-node__title">Order</span>
        <span class="board-node__notation">BPMN</span>
        <button type="button" class="board-node__arm nodrag">Edit</button>
      </header>
      <div class="board-node__body" inert>
        <div class="board-surface" data-surface="overlay">
          <div class="board-surface__slot">${engine}</div>
        </div>
      </div>
    </div>
  </div>`;

/** a model node while it is edited: its editor stands in the layer, the placeholder in the node */
const ARMED_NODE = `
  <div class="react-flow__node react-flow__node-model nokey" data-id="n_armed"
    style="left: 440px; top: 160px; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px">
    ${handles}
    <div class="board-node" data-armed="true" data-strategy="overlay">
      <header class="board-node__header">
        <svg class="board-node__grip" viewBox="0 0 24 24" aria-hidden="true"></svg>
        <span class="board-node__title">Invoice</span>
        <span class="board-node__notation">BPMN</span>
        <button type="button" class="board-node__arm nodrag">Done</button>
      </header>
      <div class="board-node__body nodrag nopan nowheel nokey">
        <div class="board-surface" data-surface="overlay">
          <div class="board-surface__slot"></div>
          <div class="board-surface__placeholder">Editing in the layer above the board</div>
        </div>
      </div>
    </div>
  </div>`;

const smallNode = (id: string, type: string, left: number, content: string): string => `
  <div class="react-flow__node react-flow__node-${type}" data-id="${id}"
    style="left: ${left}px; top: 20px; width: ${NOTE_WIDTH}px; height: ${NOTE_HEIGHT}px">
    ${content}
  </div>`;

/** what a host's editor puts below the element it was given: none of it is the board's to style */
const HOSTED_EDITOR = `
  <div class="test-editor__box"></div>
  <h1 class="test-editor__heading">A heading of the editor</h1>
  <ul class="test-editor__list"><li>one</li></ul>
  <button type="button" class="test-editor__button">A button of the editor</button>`;

/** the editor's own sheet sets a size and a motion, and leaves the box model and the colours alone */
const HOSTED_EDITOR_SHEET = `
  .test-editor__box { width: 100px; padding: 10px; transition: opacity 1s; }`;

const MARKUP = `
  <div class="board-module" style="width: 100%; height: 100%">
    <div class="board-root" data-embedded="true">
      <div class="board-root__canvas">
        <div class="react-flow" data-board-view="near">
          <div class="react-flow__pane" tabindex="0" aria-label="Board"></div>
          ${modelNode(
            "n_order",
            160,
            `<div class="board-engine" data-strategy="overlay" data-armed="false"
              data-layout="preview">${HOSTED_EDITOR}</div>`,
          )}
          ${modelNode(
            "n_failed",
            480,
            `<div class="board-engine board-engine--failed" data-strategy="overlay"
              data-armed="false" data-layout="preview">order.bpmn cannot be shown here</div>`,
          )}
          ${ARMED_NODE}
          ${smallNode(
            "n_editing",
            "text",
            20,
            `<div class="board-text nodrag nopan nowheel nokey" data-color="plain"
              data-editing="true"><textarea class="board-text__editor"></textarea></div>`,
          )}
          ${smallNode(
            "n_blue",
            "text",
            240,
            `<div class="board-text" data-color="blue" data-editing="false">
              <div class="board-text__body" data-empty="false"><pre>a line of code</pre></div>
            </div>`,
          )}
          ${smallNode("n_loading", "text", 460, `<div class="board-slot">text node n_loading</div>`)}
          ${smallNode(
            "n_threw",
            "text",
            900,
            `<div class="board-slot board-slot--error" role="alert">text node n_threw: it threw</div>`,
          )}
          ${smallNode(
            "n_group",
            "group",
            680,
            `<div class="board-group" data-receiving="false">
              <span class="board-group__label" data-empty="false">A group</span>
            </div>`,
          )}
          <div class="react-flow__edgelabel-renderer">
            <div class="board-arrow-label nodrag nopan" data-selected="false" data-edge="e_typing">
              <input class="board-arrow-label__text board-inline-input nodrag nopan nowheel nokey"
                value="a label" size="8" aria-label="Arrow label" />
            </div>
          </div>
          <div class="react-flow__panel board-toolbar top left">
            <div class="board-toolbar__group" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out">
                <svg viewBox="0 0 24 24" aria-hidden="true"></svg>
              </button>
              <button type="button" data-board-zoom="1">100%</button>
            </div>
            <button type="button" class="board-toolbar__done" data-board-done="n_order">
              <span>Done</span><span class="board-toolbar__done-model">Order</span>
            </button>
          </div>
          <div class="board-overlay-layer nodrag nopan nowheel nokey"></div>
        </div>
      </div>
    </div>
  </div>`;

const TEXT = "rgb(29, 29, 29)";
const LINE = "rgb(230, 226, 226)";
const FOCUS = "rgb(43, 80, 212)";
const LINK = "rgb(43, 80, 212)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const WHITE = "rgb(255, 255, 255)";
/** --cd-blau: the fill of a primary button, the same in both modes (guide §8) */
const PRIMARY_FILL = "rgb(51, 93, 229)";
/** --cd-ui-interaktion in dark: what a ring or a mark of the board has there */
const INTERACTION_IN_DARK = "rgb(107, 138, 255)";

const ARMED_DONE = '.board-node[data-armed="true"] .board-node__arm';
const TOOLBAR_DONE = ".board-toolbar__done";

/** selector, property, the light value the sheet was measured with */
const LIGHT_PICTURE: readonly (readonly [string, keyof CSSStyleDeclaration & string, string])[] = [
  [".board-root", "color", TEXT],
  [".board-root", "backgroundColor", "rgb(255, 255, 255)"],
  [TOOLBAR_DONE, "backgroundColor", PRIMARY_FILL],
  [TOOLBAR_DONE, "borderTopColor", PRIMARY_FILL],
  [TOOLBAR_DONE, "color", WHITE],
  [ARMED_DONE, "backgroundColor", PRIMARY_FILL],
  [ARMED_DONE, "borderTopColor", PRIMARY_FILL],
  [ARMED_DONE, "color", WHITE],
  [".board-toolbar__group", "color", "rgb(107, 102, 102)"],
  ["[data-board-zoom]", "backgroundColor", "rgb(255, 255, 255)"],
  ["[data-board-zoom]", "borderTopColor", "rgb(143, 138, 138)"],
  [".board-node__header", "backgroundColor", "rgb(249, 247, 247)"],
  [".board-node__header", "borderBottomColor", LINE],
  [".board-node__notation", "color", "rgb(107, 102, 102)"],
  [".board-node__arm", "color", LINK],
  [".board-node__body", "backgroundColor", "rgb(255, 255, 255)"],
  [".board-slot--error", "backgroundColor", "rgb(251, 238, 240)"],
  ['.board-text[data-color="blue"]', "backgroundColor", "rgb(238, 241, 253)"],
];

const PAGES = [
  { page: "a bare page", sheet: "" },
  { page: "a page with a base font of its own", sheet: "html { font: 13px/1.2 serif; }" },
];

let host: HTMLElement;
let pageSheet: HTMLStyleElement;

function one<T extends Element = HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`the markup has no ${selector}`);
  return found;
}
const styleOf = (selector: string, pseudo?: string): CSSStyleDeclaration =>
  getComputedStyle(one(selector), pseudo);
const boxOf = (selector: string): DOMRect => one(selector).getBoundingClientRect();
const sizeOf = (selector: string): { width: number; height: number } => {
  const { width, height } = boxOf(selector);
  return { width, height };
};

function mount(sheet: string): void {
  pageSheet = document.createElement("style");
  pageSheet.textContent = sheet + HOSTED_EDITOR_SHEET;
  document.head.append(pageSheet);
  host = document.createElement("div");
  host.style.cssText = "position: fixed; left: 0; top: 0; width: 1200px; height: 800px";
  host.innerHTML = MARKUP;
  document.body.append(host);
}

afterEach(() => {
  host.remove();
  pageSheet.remove();
});

describe.each(PAGES)("the board's sheet on $page", ({ sheet }) => {
  beforeEach(() => mount(sheet));

  it("stands on the page it was told", () => {
    const page = getComputedStyle(document.documentElement);
    expect(page.fontSize).toBe(sheet === "" ? "16px" : "13px");
    // the sheet reaches nothing outside the board
    expect(getComputedStyle(host).boxSizing).toBe("content-box");
    expect(getComputedStyle(document.body).borderTopColor).not.toBe(LINE);
  });

  it("gives the board the type the page it was measured on gave by inheritance", () => {
    const root = styleOf(".board-root");
    expect(root.fontSize).toBe("16px");
    expect(root.lineHeight).toBe("24px");
    expect(root.tabSize).toBe("4");
    expect(root.fontFamily).toMatch(/^"Geist Variable", Geist, ui-sans-serif/);
    // 12px in the header, at the root's 1.5
    expect(styleOf(".board-node__title").fontSize).toBe("12px");
    expect(styleOf(".board-node__title").lineHeight).toBe("18px");
  });

  it("keeps the header of a model node at 32 px and the body at the node minus the header", () => {
    expect(sizeOf('[data-id="n_order"] .board-node')).toEqual({
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
    expect(boxOf('[data-id="n_order"] .board-node__header').height).toBe(HEADER_HEIGHT);
    expect(sizeOf('[data-id="n_order"] .board-node__body')).toEqual({
      width: NODE_WIDTH,
      height: NODE_HEIGHT - HEADER_HEIGHT,
    });
  });

  it("keeps a padded box of the board at its set size", () => {
    // the element the board hands a host is the board's own: padded when it failed, never larger
    expect(styleOf(".board-engine--failed").paddingTop).toBe("12px");
    expect(sizeOf(".board-engine--failed")).toEqual(
      sizeOf('[data-id="n_failed"] .board-node__body'),
    );
    expect(styleOf(".board-text__editor").paddingLeft).toBe("14px");
    expect(sizeOf(".board-text__editor")).toEqual({ width: NOTE_WIDTH, height: NOTE_HEIGHT });
    expect(styleOf('[data-id="n_loading"] .board-slot').paddingTop).toBe("12px");
    expect(boxOf('[data-id="n_loading"] .board-slot').height).toBe(NOTE_HEIGHT);
  });

  it("resets the board's own elements as the measured page did", () => {
    for (const selector of [".board-engine", ".board-node__header", ".board-text__editor"]) {
      expect(styleOf(selector).boxSizing, selector).toBe("border-box");
    }
    // a pseudo-element too: the dot of a handle
    expect(styleOf(".react-flow__handle", "::after").boxSizing).toBe("border-box");
    // a label while it is typed: the field has the type of the text it stands for
    const label = styleOf(".board-arrow-label");
    const field = styleOf(".board-arrow-label .board-inline-input");
    expect(label.fontSize).toBe("13px");
    expect(label.lineHeight).toBe("16.9px");
    expect(field.fontSize).toBe(label.fontSize);
    expect(field.lineHeight).toBe(label.lineHeight);
    // code in a note: the mono stack at the note's size
    const code = styleOf(".board-text__body pre");
    expect(code.fontFamily).toMatch(/^"Geist Mono Variable", "Geist Mono", ui-monospace/);
    expect(code.fontSize).toBe("14px");
  });

  it("stays under React Flow's sheet: the base is a layer", () => {
    // preflight was a layer on the measured page too, so the panel kept the margin of React Flow
    expect(styleOf(".react-flow__panel").marginTop).toBe("15px");
    expect(styleOf(".react-flow__panel").marginLeft).toBe("15px");
  });

  it("gives every element of the board the line and focus colours, a pseudo-element neither", () => {
    const title = styleOf(".board-node__title");
    expect(title.borderTopColor).toBe(LINE);
    expect(title.outlineColor).toBe(FOCUS);
    // on the measured page the two declarations stood on `*` alone
    expect(styleOf(".board-node__title", "::before").borderTopColor).toBe(TEXT);
  });

  it("resets nothing below the element it hands a host", () => {
    const box = styleOf(".test-editor__box");
    expect(box.boxSizing).toBe("content-box");
    expect(boxOf(".test-editor__box").width).toBe(100 + 2 * 10);
    // no line and no focus colour of the board's: both stay the text colour
    expect(box.borderTopColor).toBe(TEXT);
    expect(box.outlineColor).toBe(TEXT);
    expect(styleOf(".test-editor__box", "::before").boxSizing).toBe("content-box");
    const heading = styleOf(".test-editor__heading");
    expect(heading.fontSize).toBe("32px");
    expect(heading.fontWeight).toBe("700");
    expect(heading.marginTop).not.toBe("0px");
    const list = styleOf(".test-editor__list");
    expect(list.listStyleType).toBe("disc");
    expect(list.paddingLeft).toBe("40px");
    expect(styleOf(".test-editor__button").backgroundColor).not.toBe(TRANSPARENT);
  });

  it.each(LIGHT_PICTURE)("%s has the %s it was measured with: %s", (selector, property, value) => {
    expect(styleOf(selector)[property]).toBe(value);
  });
});

/** WCAG 2 contrast of two computed `rgb()` colours. */
function contrast(one: string, other: string): number {
  const luminance = (colour: string): number => {
    const [red, green, blue] = (colour.match(/\d+/g) ?? []).slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** where a page writes the design system's theme: on <html>, or on the element a board is attached to */
const DARK_PAGES = [
  { where: "<html>", themed: (): HTMLElement => document.documentElement },
  { where: "the element the board stands in", themed: (): HTMLElement => host },
];

describe.each(DARK_PAGES)(
  'the board\'s sheet with data-cd-theme="dark" on $where',
  ({ themed }) => {
    beforeEach(() => {
      mount("");
      themed().setAttribute("data-cd-theme", "dark");
    });

    afterEach(() => {
      themed().removeAttribute("data-cd-theme");
    });

    it("follows the page's roles", () => {
      expect(styleOf(".board-root").backgroundColor).toBe("rgb(40, 40, 40)");
      expect(styleOf(".board-root").color).toBe(WHITE);
      // the ground under a host's editor too: one that draws light needs the light island below
      expect(styleOf(".board-node__body").backgroundColor).toBe("rgb(29, 29, 29)");
    });

    it.each([TOOLBAR_DONE, ARMED_DONE])("keeps %s the fixed blue under white text", (selector) => {
      const button = styleOf(selector);
      expect(button.backgroundColor).toBe(PRIMARY_FILL);
      expect(button.borderTopColor).toBe(PRIMARY_FILL);
      expect(button.color).toBe(WHITE);
      expect(contrast(button.color, button.backgroundColor)).toBeGreaterThan(4.5);
    });

    it("leaves the rings and marks on the role of the primary colour", () => {
      // the ring of the armed node, the dot of a handle
      expect(styleOf('.board-node[data-armed="true"]').boxShadow).toContain(
        `${INTERACTION_IN_DARK} 0px 0px 0px 2px`,
      );
      expect(styleOf(".react-flow__handle", "::after").backgroundColor).toBe(INTERACTION_IN_DARK);
    });
  },
);

describe('the board\'s sheet as a light island: data-cd-theme="light" on its element, "dark" on <html>', () => {
  beforeEach(() => {
    mount("");
    document.documentElement.setAttribute("data-cd-theme", "dark");
    host.setAttribute("data-cd-theme", "light");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-cd-theme");
  });

  it("stands on a dark page", () => {
    expect(getComputedStyle(document.documentElement).colorScheme).toBe("dark");
  });

  it.each(LIGHT_PICTURE)("%s has the %s it was measured with: %s", (selector, property, value) => {
    expect(styleOf(selector)[property]).toBe(value);
  });
});

describe("the sheet's one breakpoint, which reads the window and not the board", () => {
  /** the window the browser project runs in (`browser.viewport` of the Vitest config) */
  const DESKTOP = { width: 1280, height: 800 };
  /** Vitest's own default window: below the breakpoint of 760 px */
  const NARROW = { width: 414, height: 896 };
  /** what the toolbar draws under itself for a file the board refused (canvas/toolbar.tsx) */
  const NOTICE = `
    <div class="board-notices">
      <div class="board-notice" data-kind="refused" role="alert">
        <svg viewBox="0 0 24 24" aria-hidden="true"></svg>
        <span>${"a long name of a file the board did not take ".repeat(6)}</span>
        <button type="button" title="Dismiss" aria-label="Dismiss"></button>
      </div>
    </div>`;
  const narrow = (): boolean => matchMedia("(max-width: 760px)").matches;

  beforeEach(() => {
    mount("");
    one(".board-toolbar").insertAdjacentHTML("beforeend", NOTICE);
  });

  afterEach(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("gives the Done control 200 px and a notice up to 560 px in the desktop window the tests run in", () => {
    expect(window.innerWidth).toBe(DESKTOP.width);
    expect(narrow()).toBe(false);
    expect(boxOf(TOOLBAR_DONE).width).toBe(200);
    expect(styleOf(".board-notices").maxWidth).toBe("560px");
    expect(boxOf(".board-notices").width).toBe(560);
  });

  it("gives the Done control 130 px and a notice 60 % of the window once the window is 760 px or less", async () => {
    await page.viewport(NARROW.width, NARROW.height);
    await expect.poll(() => window.innerWidth).toBe(NARROW.width);
    expect(narrow()).toBe(true);
    expect(boxOf(TOOLBAR_DONE).width).toBe(130);
    // 60vw of 414 px, although the board itself is 1200 px wide here
    expect(styleOf(".board-notices").maxWidth).toBe("248.4px");
    expect(boxOf(".board-notices").width).toBeCloseTo(248.4, 1);

    await page.viewport(760, NARROW.height);
    await expect.poll(() => window.innerWidth).toBe(760);
    expect(boxOf(TOOLBAR_DONE).width).toBe(130);
    await page.viewport(761, NARROW.height);
    await expect.poll(() => window.innerWidth).toBe(761);
    expect(boxOf(TOOLBAR_DONE).width).toBe(200);
  });
});

describe("the board's sheet under prefers-reduced-motion", () => {
  const seconds = (selector: string): number => parseFloat(styleOf(selector).transitionDuration);

  beforeEach(() => mount(""));

  afterEach(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  it("stills the board's own elements and leaves a host's editor its motion", async () => {
    // whatever the machine is set to
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
    // --cd-motion-fast, from the layered tokens
    expect(seconds(".react-flow__handle")).toBe(0.15);
    expect(seconds(".board-group")).toBe(0.15);
    expect(seconds(".test-editor__box")).toBe(1);

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    expect(seconds(".react-flow__handle")).toBeLessThan(0.00001);
    expect(seconds(".board-group")).toBeLessThan(0.00001);
    expect(seconds(".test-editor__box")).toBe(1);
  });
});
