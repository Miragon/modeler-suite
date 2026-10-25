import { describe, expect, it } from "vitest";
import {
  ALL_PATTERN_SPECS,
  ALL_SUBDOMAIN_SPECS,
  type DownstreamRole,
  type RelationshipPattern,
  type SubdomainType,
  type UpstreamRole,
} from "@miragon/context-maps-schema-model";
import {
  contextIconSvg,
  relationshipIconSvg,
  roleChipSvg,
  subdomainIconSvg,
} from "../src/draw/palette-icons.js";
import { markFill } from "../src/draw/relationshipColours.js";
import { NEUTRAL_FILL, NEUTRAL_STROKE } from "../src/draw/styles.js";

/**
 * The glyphs are exported for host chrome (an inspector, say), so a host may hand them a value it
 * read from an unvalidated document. Each of these tries to end a value and start markup of its own.
 */
const HOSTILE_TEXTS = [
  '<img src=x onerror="alert(1)">',
  '"><script>alert(1)</script>',
  "' onmouseover='alert(1)",
  'OHS" onload="alert(1)',
  '</text><a href="javascript:alert(1)">x</a>',
  "</svg><style>*{display:none}</style>",
  "javascript:alert(1)",
  "url(javascript:alert(1))",
  "&lt;b&gt;",
];

/** Keys every object inherits: no notation entry, so no notation colour either. */
const PROTOTYPE_KEYS = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"];

const HOSTILE_SIZES: unknown[] = [
  '24" onload="alert(1)',
  '24"><img src=x onerror="alert(1)">',
  "url(javascript:alert(1))",
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -8,
  0,
  { toString: () => '1" onload="alert(1)' },
];
const HOSTILE_SIZE_CASES = HOSTILE_SIZES.map((size) => ({ label: String(size), size }));

const ICON_ELEMENTS = new Set(["svg", "rect", "path", "circle", "line", "g", "text"]);
const SVG_ATTRIBUTES = ["class", "width", "height", "viewBox", "aria-hidden"];
const PAINT = /^(#[0-9a-f]{6}|none)$/i;

function asRole(value: string): UpstreamRole | DownstreamRole {
  return value as UpstreamRole | DownstreamRole;
}

function asSize(value: unknown): number {
  return value as number;
}

/** The markup as the hosts read it: the HTML parser of `innerHTML` and the XML parser. */
function parsed(markup: string): Element[] {
  const host = document.createElement("div");
  host.innerHTML = markup;
  expect(host.children, `one root element in ${markup}`).toHaveLength(1);
  const xml = new DOMParser().parseFromString(markup, "image/svg+xml");
  expect(xml.querySelector("parsererror"), `well-formed: ${markup}`).toBeNull();
  return [host.children[0], xml.documentElement];
}

/** Only the glyph's own elements, no event handler or link, and every paint a notation colour. */
function expectOnlyGlyphMarkup(markup: string): void {
  for (const root of parsed(markup)) {
    expect(root.localName).toBe("svg");
    for (const element of [root, ...root.querySelectorAll("*")]) {
      expect(ICON_ELEMENTS.has(element.localName), `<${element.localName}> in ${markup}`).toBe(
        true,
      );
      for (const attribute of element.getAttributeNames()) {
        expect(attribute, `${attribute} in ${markup}`).not.toMatch(/^on|href$/i);
      }
      for (const paint of ["fill", "stroke"]) {
        const value = element.getAttribute(paint);
        if (value !== null) expect(value, `${paint} in ${markup}`).toMatch(PAINT);
      }
    }
  }
}

function svgAttributesOf(markup: string): Array<Record<string, string>> {
  return parsed(markup).map((root) =>
    Object.fromEntries(root.getAttributeNames().map((name) => [name, root.getAttribute(name)!])),
  );
}

describe("palette icons: a value a host hands in stays a value", () => {
  it.each(HOSTILE_TEXTS)("a role chip writes %j as its text and nothing else", (text) => {
    const markup = roleChipSvg(asRole(text));
    expectOnlyGlyphMarkup(markup);
    for (const root of parsed(markup)) {
      expect(root.querySelectorAll("*")).toHaveLength(2);
      expect(root.querySelector("text")?.textContent).toBe(text);
      expect(root.querySelector("rect")?.getAttribute("fill")).toBe(NEUTRAL_STROKE);
    }
  });

  it.each(HOSTILE_SIZE_CASES)("a size of $label falls back to the default size", ({ size }) => {
    const icons = [
      { markup: relationshipIconSvg("partnership", asSize(size)), fallback: "24" },
      { markup: subdomainIconSvg("core", asSize(size)), fallback: "18" },
    ];
    for (const { markup, fallback } of icons) {
      expectOnlyGlyphMarkup(markup);
      for (const attributes of svgAttributesOf(markup)) {
        expect(Object.keys(attributes).sort()).toEqual([...SVG_ATTRIBUTES].sort());
        expect(attributes.width).toBe(fallback);
        expect(attributes.height).toBe(fallback);
      }
    }
  });

  it("a finite positive size reaches the markup as that number", () => {
    for (const markup of [relationshipIconSvg("partnership", 32), subdomainIconSvg("core", 32)]) {
      for (const attributes of svgAttributesOf(markup)) {
        expect(attributes.width).toBe("32");
        expect(attributes.height).toBe("32");
      }
    }
  });

  it.each([...HOSTILE_TEXTS, ...PROTOTYPE_KEYS])(
    "an unknown subdomain type %j draws the unclassified box and the neutral dotted circle",
    (type) => {
      const unknownType = type as SubdomainType;
      expectOnlyGlyphMarkup(contextIconSvg(unknownType));
      expectOnlyGlyphMarkup(subdomainIconSvg(unknownType));
      expect(contextIconSvg(unknownType)).toBe(contextIconSvg());
      expect(subdomainIconSvg(unknownType)).toBe(subdomainIconSvg("no-such-type" as SubdomainType));
      for (const root of parsed(contextIconSvg(unknownType))) {
        expect(root.querySelectorAll("*")).toHaveLength(1);
        expect(root.querySelector("rect")?.getAttribute("fill")).toBe(NEUTRAL_FILL);
        expect(root.querySelector("rect")?.getAttribute("stroke")).toBe(NEUTRAL_STROKE);
      }
      for (const root of parsed(subdomainIconSvg(unknownType))) {
        expect(root.querySelectorAll("*")).toHaveLength(1);
        expect(root.querySelector("circle")?.getAttribute("stroke")).toBe(NEUTRAL_STROKE);
        expect(root.querySelector("circle")?.getAttribute("stroke-dasharray")).toBeTruthy();
      }
    },
  );

  it.each([...HOSTILE_TEXTS, ...PROTOTYPE_KEYS])(
    "an unknown relationship pattern %j draws the default line",
    (pattern) => {
      const markup = relationshipIconSvg(pattern as RelationshipPattern);
      expectOnlyGlyphMarkup(markup);
      expect(markup).toBe(relationshipIconSvg());
    },
  );

  it.each(PROTOTYPE_KEYS)("a role chip for %j gets the neutral fill", (role) => {
    expect(markFill(role)).toBe(NEUTRAL_STROKE);
    expectOnlyGlyphMarkup(roleChipSvg(asRole(role)));
  });

  it("every notation glyph keeps its own elements and colours", () => {
    const roles: Array<UpstreamRole | DownstreamRole> = ["OHS", "PL", "ACL", "CF"];
    const markups = [
      contextIconSvg(),
      ...ALL_SUBDOMAIN_SPECS.flatMap((spec) => [
        contextIconSvg(spec.type),
        subdomainIconSvg(spec.type),
      ]),
      ...ALL_PATTERN_SPECS.map((spec) => relationshipIconSvg(spec.pattern)),
      ...roles.map((role) => roleChipSvg(role)),
    ];
    for (const markup of markups) expectOnlyGlyphMarkup(markup);
    for (const role of roles) {
      for (const root of parsed(roleChipSvg(role))) {
        expect(root.querySelector("text")?.textContent).toBe(role);
        expect(root.querySelector("rect")?.getAttribute("fill")).toBe(markFill(role));
      }
    }
  });
});
