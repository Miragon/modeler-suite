import { describe, expect, it } from "vitest";
import {
  ALL_PATTERN_SPECS,
  ALL_SUBDOMAIN_SPECS,
  DOWNSTREAM_ROLE_SPECS,
  MARK_COLORS,
  UPSTREAM_ROLE_SPECS,
  type DownstreamRole,
  type UpstreamRole,
} from "@miragon/context-maps-schema-model";
import {
  contextBadgeColour,
  contextFill,
  contextNameColour,
  contextStroke,
  contextTeamColour,
} from "../src/draw/contextColours.js";
import {
  contextIconSvg,
  relationshipIconSvg,
  roleChipSvg,
  subdomainIconSvg,
} from "../src/draw/palette-icons.js";
import {
  directionLetterColour,
  markFill,
  markTextColour,
  patternChipColours,
} from "../src/draw/relationshipColours.js";
import { ROLE_CLASS, needsDarkUnderlay } from "../src/draw/canvasRoles.js";
import { INK, PAPER } from "../src/draw/styles.js";
import vendoredTokens from "../src/theme/cd-tokens.generated.json";
import { MIRAGON } from "../src/theme/palette.js";
import { NON_TEXT_CONTRAST, TEXT_CONTRAST, pairBelow } from "./support/contrast.js";
import {
  ROLE_RULES,
  TOKENS,
  UNDERLAY_CLASS,
  UNDERLAY_ROLE_IN_DARK,
  paintIn,
} from "./support/roles.js";

/**
 * Guide §10.6 measures a line against the resting surface: on the canvas the ground. The palette's
 * and the legend's glass is lighter than the ground, so the same bound covers their previews.
 */
const CANVAS_GROUND = vendoredTokens.hell["--cd-ui-grund"];

const ROLES = [...Object.keys(UPSTREAM_ROLE_SPECS), ...Object.keys(DOWNSTREAM_ROLE_SPECS)] as Array<
  UpstreamRole | DownstreamRole
>;
const DIRECTIONS = ["U", "D", "S", "C"];
const SYMMETRIC_PATTERNS = ALL_PATTERN_SPECS.filter((spec) => spec.symmetric);

/** Every context the notation colours on its own: the three subdomain types and none. */
const DEFAULT_CONTEXTS = [
  ...ALL_SUBDOMAIN_SPECS.map((spec) => ({
    name: spec.label,
    context: { subdomainType: spec.type },
  })),
  { name: "unclassified", context: {} },
];

function failures(pairs: Array<string | undefined>): string[] {
  return pairs.filter((pair): pair is string => pair !== undefined);
}

function parseSvg(markup: string): Element {
  return new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
}

function attributeOf(svg: Element, selector: string, name: string): string {
  const value = svg.querySelector(selector)?.getAttribute(name);
  expect(value, `${selector} ${name}`).toBeTruthy();
  return value!;
}

/** The glyph's colour: the star and the hand are filled paths, the dotted circle is a stroke. */
function glyphColourOf(svg: Element): string {
  return svg.querySelector("path")
    ? attributeOf(svg, "path", "fill")
    : attributeOf(svg, "circle", "stroke");
}

describe("notation contrast: every text reaches 4.5:1, no exception (guide §3.6, §10.6)", () => {
  it("names, subdomain badges and team captions on every default fill", () => {
    const pairs = DEFAULT_CONTEXTS.flatMap(({ name, context }) => {
      const fill = contextFill(context);
      return [
        pairBelow(`${name} name`, contextNameColour(context), fill, TEXT_CONTRAST),
        pairBelow(`${name} team`, contextTeamColour(context), fill, TEXT_CONTRAST),
        ...("subdomainType" in context
          ? [pairBelow(`${name} badge`, contextBadgeColour(context), fill, TEXT_CONTRAST)]
          : []),
      ];
    });
    expect(failures(pairs)).toEqual([]);
  });

  it("every marker's text on its chip", () => {
    const pairs = Object.keys(MARK_COLORS).map((token) =>
      pairBelow(`${token} text`, markTextColour(token), markFill(token), TEXT_CONTRAST),
    );
    expect(failures(pairs)).toEqual([]);
  });

  it("picks schwarz for PL and CF, weiss for OHS, ACL and the direction colours", () => {
    const textColours = Object.fromEntries(
      Object.keys(MARK_COLORS).map((token) => [token, markTextColour(token)]),
    );
    expect(textColours).toEqual({
      OHS: MIRAGON.weiss,
      PL: INK,
      ACL: MIRAGON.weiss,
      CF: INK,
      U: MIRAGON.weiss,
      D: MIRAGON.weiss,
      S: MIRAGON.weiss,
      C: MIRAGON.weiss,
    });
  });

  it("the direction letters on their paper halo", () => {
    const pairs = DIRECTIONS.map((direction) =>
      pairBelow(`${direction} letter`, directionLetterColour(direction), PAPER, TEXT_CONTRAST),
    );
    expect(failures(pairs)).toEqual([]);
  });

  it("the symmetric patterns' chips, in schwarz on paper", () => {
    const pairs = SYMMETRIC_PATTERNS.map((spec) => {
      const chip = patternChipColours(spec);
      expect(chip.text, spec.label).toBe(INK);
      return pairBelow(`${spec.label} chip text`, chip.text, chip.fill, TEXT_CONTRAST);
    });
    expect(failures(pairs)).toEqual([]);
  });
});

describe("notation contrast: every structural line reaches 3:1 on the canvas ground", () => {
  it("box outlines, relationship lines and the symmetric chips' borders", () => {
    const lines: Array<readonly [string, string]> = [
      ...DEFAULT_CONTEXTS.map(
        ({ name, context }) => [`${name} outline`, contextStroke(context)] as const,
      ),
      ...ALL_PATTERN_SPECS.map((spec) => [`${spec.label} line`, spec.stroke] as const),
      ...SYMMETRIC_PATTERNS.map(
        (spec) => [`${spec.label} chip border`, patternChipColours(spec).border] as const,
      ),
    ];
    const pairs = lines.map(([name, stroke]) =>
      pairBelow(name, stroke, CANVAS_GROUND, NON_TEXT_CONTRAST),
    );
    expect(failures(pairs)).toEqual([]);
  });

  it("keeps the pattern's colour on the symmetric chips' borders", () => {
    for (const spec of SYMMETRIC_PATTERNS) {
      expect(patternChipColours(spec).border, spec.label).toBe(spec.stroke);
    }
  });

  it("the subdomain glyph on its box", () => {
    const pairs = ALL_SUBDOMAIN_SPECS.map((spec) =>
      pairBelow(
        `${spec.label} glyph`,
        contextBadgeColour({ subdomainType: spec.type }),
        spec.fill,
        NON_TEXT_CONTRAST,
      ),
    );
    expect(failures(pairs)).toEqual([]);
  });
});

describe("notation contrast: the palette and legend previews draw the canvas colours", () => {
  it.each(ROLES)("the %s chip", (role) => {
    const svg = parseSvg(roleChipSvg(role));
    const fill = attributeOf(svg, "rect", "fill");
    const text = attributeOf(svg, "text", "fill");
    expect(fill).toBe(markFill(role));
    expect(text).toBe(markTextColour(role));
    expect(pairBelow(`${role} chip text`, text, fill, TEXT_CONTRAST)).toBeUndefined();
  });

  it.each(ALL_SUBDOMAIN_SPECS.map((spec) => [spec.label, spec] as const))(
    "the %s box and its glyph",
    (_label, spec) => {
      const box = parseSvg(contextIconSvg(spec.type));
      const fill = attributeOf(box, "rect", "fill");
      const stroke = attributeOf(box, "rect", "stroke");
      const glyph = glyphColourOf(box);
      const bareGlyph = glyphColourOf(parseSvg(subdomainIconSvg(spec.type)));
      expect(glyph).toBe(contextBadgeColour({ subdomainType: spec.type }));
      expect(bareGlyph, "the bare glyph keeps the type's colour").toBe(spec.stroke);
      expect(
        failures([
          pairBelow("outline", stroke, CANVAS_GROUND, NON_TEXT_CONTRAST),
          pairBelow("glyph", glyph, fill, NON_TEXT_CONTRAST),
          pairBelow("bare glyph", bareGlyph, CANVAS_GROUND, NON_TEXT_CONTRAST),
        ]),
      ).toEqual([]);
    },
  );

  it("the unclassified box", () => {
    const stroke = attributeOf(parseSvg(contextIconSvg()), "rect", "stroke");
    expect(pairBelow("outline", stroke, CANVAS_GROUND, NON_TEXT_CONTRAST)).toBeUndefined();
  });

  it.each(ALL_PATTERN_SPECS.map((spec) => [spec.label, spec] as const))(
    "the %s line",
    (_label, spec) => {
      const stroke = attributeOf(
        parseSvg(relationshipIconSvg(spec.pattern)),
        `g:not(.${UNDERLAY_CLASS})`,
        "stroke",
      );
      expect(stroke).toBe(spec.stroke);
      expect(pairBelow("line", stroke, CANVAS_GROUND, NON_TEXT_CONTRAST)).toBeUndefined();
    },
  );
});

/**
 * The dark canvas (guide §10.1, §10.6): ground and plot are `#1D1D1D`, the palette, the legend, the
 * context pad and the popup menu `--cd-ui-flaeche-hoch`. The notation keeps its values in dark, and
 * a line among them below 3:1 lies on an underlay; the renderer's own colours follow the roles.
 */
const DARK_GROUND = TOKENS.dunkel["--cd-ui-grund"]!;
const DARK_SURFACE = TOKENS.dunkel["--cd-ui-flaeche-hoch"]!;
const DARK_UNDERLAY = TOKENS.dunkel[UNDERLAY_ROLE_IN_DARK]!;

/** The strokes guide §10.6 names for Context Maps: below 3:1 on the dark ground. */
const GUIDE_DARK_UNDERLAYS = ["#5A54A8", "#6B6459"];

/** Every line the notation colours: the typed boxes' outlines, the lines, the chips' borders. */
const NOTATION_LINES: ReadonlyArray<readonly [string, string]> = [
  ...ALL_SUBDOMAIN_SPECS.map((spec) => [`${spec.label} outline`, spec.stroke] as const),
  ...ALL_PATTERN_SPECS.map((spec) => [`${spec.label} line`, spec.stroke] as const),
  ...SYMMETRIC_PATTERNS.map(
    (spec) => [`${spec.label} chip border`, patternChipColours(spec).border] as const,
  ),
];

describe("notation contrast in dark: every line 3:1 on #1D1D1D or on an underlay", () => {
  it("the notation's lines below 3:1 on the dark ground are the two the guide names", () => {
    const weak = new Set(
      NOTATION_LINES.filter(
        ([, stroke]) => pairBelow("", stroke, DARK_GROUND, NON_TEXT_CONTRAST) !== undefined,
      ).map(([, stroke]) => stroke.toUpperCase()),
    );
    expect([...weak].sort()).toEqual(GUIDE_DARK_UNDERLAYS);
  });

  it("lays exactly those on an underlay, which holds 3:1 on the dark ground", () => {
    for (const [name, stroke] of NOTATION_LINES) {
      expect(needsDarkUnderlay(stroke), name).toBe(
        GUIDE_DARK_UNDERLAYS.includes(stroke.toUpperCase()),
      );
    }
    expect(pairBelow("underlay", DARK_UNDERLAY, DARK_GROUND, NON_TEXT_CONTRAST)).toBeUndefined();
  });

  it("an outline the author set lies on an underlay where it falls below 3:1, never otherwise", () => {
    expect(needsDarkUnderlay("#333333")).toBe(true);
    expect(needsDarkUnderlay("#5A54A8")).toBe(true);
    expect(needsDarkUnderlay("#E8663D")).toBe(false);
    expect(needsDarkUnderlay("#FFFFFF")).toBe(false);
    expect(needsDarkUnderlay("navy")).toBe(false);
  });

  it("the renderer's own outline and texts take roles that hold on the dark plot", () => {
    const plot = TOKENS.dunkel["--cd-ui-plot"]!;
    expect(
      failures([
        pairBelow("outline", TOKENS.dunkel["--cd-ui-kontur"]!, DARK_GROUND, NON_TEXT_CONTRAST),
        pairBelow("name", TOKENS.dunkel["--cd-ui-text"]!, plot, TEXT_CONTRAST),
        pairBelow("team", TOKENS.dunkel["--cd-ui-text-leise"]!, plot, TEXT_CONTRAST),
        pairBelow("chip text", TOKENS.dunkel["--cd-ui-text"]!, DARK_SURFACE, TEXT_CONTRAST),
      ]),
    ).toEqual([]);
  });

  it("the direction letters keep their paper halo: on the dark ground they fall below 4.5:1", () => {
    for (const direction of DIRECTIONS) {
      const letter = directionLetterColour(direction);
      expect(pairBelow(`${direction} on paper`, letter, PAPER, TEXT_CONTRAST)).toBeUndefined();
      expect(pairBelow(`${direction} on dark`, letter, DARK_GROUND, TEXT_CONTRAST)).toBeDefined();
    }
  });
});

describe("notation contrast in dark: the previews on the dark palette, legend and menus", () => {
  it.each(ALL_PATTERN_SPECS.map((spec) => [spec.label, spec] as const))(
    "the %s line holds 3:1, on its underlay where the canvas has one",
    (_label, spec) => {
      const svg = parseSvg(relationshipIconSvg(spec.pattern));
      const drawn = svg.querySelector(`g:not(.${UNDERLAY_CLASS})`)!;
      const underlay = svg.querySelector(`g.${UNDERLAY_CLASS}`);
      expect(Boolean(underlay), "an underlay as on the canvas").toBe(
        needsDarkUnderlay(spec.stroke),
      );
      if (!underlay) {
        expect(pairBelow("line", spec.stroke, DARK_SURFACE, NON_TEXT_CONTRAST)).toBeUndefined();
        return;
      }
      expect(underlay.nextElementSibling, "the underlay lies under the line").toBe(drawn);
      expect(underlay.children).toHaveLength(drawn.children.length);
      for (const part of underlay.children) {
        expect(paintIn(part, "stroke", "hell"), `${part.localName} in light`).toBe("none");
        const rim = paintIn(part, "stroke", "dunkel")!;
        expect(pairBelow(part.localName, rim, DARK_SURFACE, NON_TEXT_CONTRAST)).toBeUndefined();
      }
    },
  );

  it.each(ALL_SUBDOMAIN_SPECS.map((spec) => [spec.label, spec] as const))(
    "the %s box and the bare glyph keep their colours and hold 3:1",
    (_label, spec) => {
      const box = parseSvg(contextIconSvg(spec.type)).querySelector("rect")!;
      const bare = parseSvg(subdomainIconSvg(spec.type)).querySelector("path, circle")!;
      const barePaint = bare.localName === "circle" ? "stroke" : "fill";
      expect(paintIn(box, "stroke", "dunkel")).toBe(spec.stroke);
      expect(paintIn(bare, barePaint, "dunkel")).toBe(spec.stroke);
      expect(
        failures([
          pairBelow("outline", spec.stroke, DARK_SURFACE, NON_TEXT_CONTRAST),
          pairBelow("bare glyph", spec.stroke, DARK_SURFACE, NON_TEXT_CONTRAST),
        ]),
      ).toEqual([]);
    },
  );

  it("the unclassified box follows the roles as on the canvas and holds 3:1", () => {
    for (const markup of [contextIconSvg(), subdomainIconSvg("none" as never)]) {
      const shape = parseSvg(markup).querySelector("rect, circle")!;
      const stroke = paintIn(shape, "stroke", "dunkel")!;
      expect(stroke).toBe(TOKENS.dunkel["--cd-ui-kontur"]);
      expect(pairBelow("outline", stroke, DARK_SURFACE, NON_TEXT_CONTRAST)).toBeUndefined();
    }
    const box = parseSvg(contextIconSvg()).querySelector("rect")!;
    expect(paintIn(box, "fill", "dunkel")).toBe(TOKENS.dunkel["--cd-ui-plot"]);
  });
});

describe("notation contrast: a role class draws in light the value of its attribute", () => {
  it.each([
    ["the unclassified box", contextIconSvg()],
    ["the neutral bare glyph", subdomainIconSvg("none" as never)],
    ...ALL_PATTERN_SPECS.map((spec) => [
      `the ${spec.label} line`,
      relationshipIconSvg(spec.pattern),
    ]),
  ])("%s", (_label, markup) => {
    for (const element of parseSvg(markup).querySelectorAll("*")) {
      for (const paint of ["fill", "stroke"] as const) {
        const attribute = element.getAttribute(paint);
        if (attribute === null || element.classList.contains(UNDERLAY_CLASS)) continue;
        expect(
          paintIn(element, paint, "hell")?.toUpperCase(),
          `${element.localName} ${paint}`,
        ).toBe(attribute.toUpperCase());
      }
    }
  });

  it("every role class the renderer writes is declared, in the paint its name says", () => {
    for (const className of Object.values(ROLE_CLASS)) {
      const rule = ROLE_RULES.get(className);
      expect(rule, className).toBeDefined();
      expect(className, className).toMatch(new RegExp(`-c-${rule!.paint}-`));
      expect(`--cd-ui-${className.replace(/^c[dm]-c-(fill|stroke)-/, "")}`).toBe(rule!.role);
    }
  });
});
