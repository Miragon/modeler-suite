import { describe, expect, it } from "vitest";
import * as renderer from "../index.js";
import { ICON_PENCIL, ICON_X, iconMarkup, type IconNode } from "./icons.js";

describe("iconMarkup", () => {
  it("renders a Lucide icon as decorative inline SVG", () => {
    expect(iconMarkup(ICON_X)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"' +
        ' fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"' +
        ' stroke-linejoin="round" aria-hidden="true" focusable="false">' +
        '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    );
  });

  it("drops elements and attributes that are not part of a Lucide icon", () => {
    const hostile: IconNode = [
      ["script", { src: "x.js" }],
      ["path", { d: "M5 12h14", onload: "alert(1)" }],
      ['path onload="alert(1)"', { d: "M0 0" }],
    ];
    const markup = iconMarkup(hostile);
    expect(markup).not.toMatch(/script|onload/);
    expect(markup).toContain('<path d="M5 12h14"/>');
  });

  it("escapes attribute values and the class name", () => {
    const markup = iconMarkup([["path", { d: `"><img src=x onerror='a'>` }]], {
      className: `x" onclick="a`,
    });
    expect(markup).toContain('class="x&quot; onclick=&quot;a"');
    expect(markup).toContain('d="&quot;&gt;&lt;img src=x onerror=&#39;a&#39;&gt;"');
  });

  it("falls back to the defaults for sizes that are not positive numbers", () => {
    const options = { size: '16" onload="alert(1)', strokeWidth: -1 } as unknown as {
      size: number;
      strokeWidth: number;
    };
    const markup = iconMarkup(ICON_PENCIL, options);
    expect(markup).toContain('width="16" height="16"');
    expect(markup).toContain('stroke-width="2.5"');
    expect(markup).not.toContain("onload");
  });

  it("keeps explicit sizes", () => {
    expect(iconMarkup(ICON_PENCIL, { size: 24, strokeWidth: 2 })).toContain(
      'width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
    );
  });
});

describe("the package's icons", () => {
  it("are the canvas icons only, without the dialogs' close icon or any host-chrome icon", () => {
    expect(
      Object.keys(renderer)
        .filter((name) => name.startsWith("ICON_"))
        .sort(),
    ).toEqual([
      "ICON_LINK",
      "ICON_MESSAGE_SQUARE_PLUS",
      "ICON_PENCIL",
      "ICON_SQUARE_DASHED_MOUSE_POINTER",
      "ICON_TRASH",
    ]);
  });
});
