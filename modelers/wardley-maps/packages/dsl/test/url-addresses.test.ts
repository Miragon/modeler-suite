import { describe, expect, it } from "vitest";
import { locateUrlAddresses, parseDSL } from "../src/index.js";
import { generateMapText } from "./support/generated-maps.js";
import { collectParserTestFixtures } from "./support/test-fixtures.js";

function sourceLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.replace(/\r+$/, ""));
}

/** The text each located span covers, which must be its address. */
function spannedTexts(text: string): string[] {
  const lines = sourceLines(text);
  return locateUrlAddresses(text).map(({ line, start, end }) => lines[line - 1]!.slice(start, end));
}

describe("locateUrlAddresses", () => {
  it("finds the address of every url definition, used, unused and replaced", () => {
    const text = [
      "title Links",
      "url Payment [details/payment.wmap]",
      "url Unused [./unused.wmap]",
      "url Twice [a.wmap]",
      "url Twice [b.wmap]",
      "component Checkout [0.5, 0.5] url(Payment)",
      "submap Billing [0.4, 0.4] url(Twice)",
      "",
    ].join("\n");

    expect(locateUrlAddresses(text)).toEqual([
      { name: "Payment", address: "details/payment.wmap", line: 2, start: 13, end: 33 },
      { name: "Unused", address: "./unused.wmap", line: 3, start: 12, end: 25 },
      { name: "Twice", address: "a.wmap", line: 4, start: 11, end: 17 },
      { name: "Twice", address: "b.wmap", line: 5, start: 11, end: 17 },
    ]);
  });

  it("spans the address without the spaces around it, wherever the line puts it", () => {
    const text = [
      "  url   Spaced Name   [  ./my map.wmap  ]   ",
      "pipeline Kettle [0.3, 0.65]",
      "{",
      "  component Hot [0.5]",
      "url Inner [inner.wmap] }",
      "/* note */ url After [after.wmap]",
      "URL Upper [upper.wmap]",
      "url Web [https://example.com/a//b]",
      "",
    ].join("\r\n");

    expect(locateUrlAddresses(text).map(({ name, address }) => [name, address])).toEqual([
      ["Spaced Name", "./my map.wmap"],
      ["Inner", "inner.wmap"],
      ["After", "after.wmap"],
      ["Upper", "upper.wmap"],
      ["Web", "https://example.com/a//b"],
    ]);
    expect(spannedTexts(text)).toEqual([
      "./my map.wmap",
      "inner.wmap",
      "after.wmap",
      "upper.wmap",
      "https://example.com/a//b",
    ]);
    expect(locateUrlAddresses(text)[0]).toMatchObject({ line: 1, start: 25, end: 38 });
  });

  it("finds none in comments, in lines it can't read, or in an element's url(…)", () => {
    const text = [
      "// url Commented [commented.wmap]",
      "/*",
      "url Hidden [hidden.wmap]",
      "*/",
      "url Broken [broken.wmap] trailing",
      "url NoAddress []",
      "component Literal [0.5, 0.5] url(https://example.com)",
      "",
    ].join("\n");

    expect(locateUrlAddresses(text)).toEqual([]);
  });

  it("locates every address an element links to, in every parser fixture and generated map", () => {
    const texts = [
      ...collectParserTestFixtures(),
      ...Array.from({ length: 300 }, (_, seed) => generateMapText(seed)),
    ];
    for (const text of texts) {
      const located = locateUrlAddresses(text);
      expect(spannedTexts(text), text).toEqual(located.map(({ address }) => address));
      const addresses = new Set(located.map(({ address }) => address));
      for (const element of parseDSL(text).elements) {
        const address =
          element.elementType === "component"
            ? element.url
            : element.elementType === "submap"
              ? element.urlRef
              : undefined;
        if (address === undefined || /^[a-z][\w+.-]*:\/\//i.test(address)) continue;
        expect(addresses.has(address), `${address} in\n${text}`).toBe(true);
      }
    }
  });
});
