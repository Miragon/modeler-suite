/**
 * What a peer announces about itself is untrusted input (src/canvas/presence-format.ts): the
 * colour lands in inline styles, the name on the canvas of everyone who has the board open.
 */
import { describe, expect, it } from "vitest";

import {
  FALLBACK_PRESENCE_COLOR,
  safePresenceColor,
  safePresenceLabel,
} from "../src/canvas/presence-format.js";
import { fest } from "../src/theme/cd-tokens.generated.json";

describe("the colour of a peer", () => {
  it.each(["#abc", "#abcd", "#a1b2c3", "#A1B2C3", "#a1b2c3d4", "#335DE5"])(
    "is the peer's own where it is a hex colour: %s",
    (colour) => {
      expect(safePresenceColor(colour)).toBe(colour);
    },
  );

  it.each([
    ["a colour name", "red"],
    ["a function", "rgb(51, 93, 229)"],
    ["a variable", "var(--cd-blau)"],
    ["a hex colour with a declaration behind it", "#abc; background: url(//example.org/x)"],
    ["a hex colour and a line break", "#abc\n"],
    ["a hex colour after a blank", " #abc"],
    ["two digits", "#ab"],
    ["five digits", "#abcde"],
    ["seven digits", "#abcdef0"],
    ["nine digits", "#abcdef012"],
    ["a letter that is no hex digit", "#abcdeg"],
    ["digits without the hash", "abcdef"],
    ["an empty text", ""],
    ["no text at all", undefined],
    ["null", null],
    ["a number", 0x335de5],
    ["a list", ["#abc"]],
  ])("is the fallback for %s", (_what, colour) => {
    expect(safePresenceColor(colour)).toBe(FALLBACK_PRESENCE_COLOR);
  });

  it("falls back to the design system's quiet text colour, which is a hex colour itself", () => {
    expect(FALLBACK_PRESENCE_COLOR).toBe(fest["--cd-text-leise"]);
    expect(FALLBACK_PRESENCE_COLOR).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(safePresenceColor(FALLBACK_PRESENCE_COLOR)).toBe(FALLBACK_PRESENCE_COLOR);
  });
});

describe("the name of a peer", () => {
  it("is shown as it is where nothing in it can break out of a text", () => {
    expect(safePresenceLabel("Ada Lovelace")).toBe("Ada Lovelace");
    expect(safePresenceLabel("Zoë Müller-Strauß")).toBe("Zoë Müller-Strauß");
  });

  it("loses control characters, double quotes and backslashes", () => {
    expect(safePresenceLabel('Ada "the\\Countess" Lovelace')).toBe("Ada theCountess Lovelace");
    expect(safePresenceLabel("Ada\u0000\u0007\u001b\u001f\u007f Lovelace")).toBe("Ada Lovelace");
    expect(safePresenceLabel("Ada\nLove\tlace\r")).toBe("AdaLovelace");
    expect(safePresenceLabel('"}; content: "x')).toBe("}; content: x");
  });

  it("loses the blanks around it, also those a removed character leaves", () => {
    expect(safePresenceLabel("  Ada  ")).toBe("Ada");
    expect(safePresenceLabel('" Ada "')).toBe("Ada");
  });

  it("has 24 characters at most", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    expect(safePresenceLabel(alphabet)).toBe("abcdefghijklmnopqrstuvwx");
    expect(safePresenceLabel(alphabet.slice(0, 24))).toBe(alphabet.slice(0, 24));
    // the limit holds for what is left, not for what came in
    expect(safePresenceLabel(`${'"'.repeat(30)}${alphabet}`)).toBe("abcdefghijklmnopqrstuvwx");
  });

  it.each([
    ["an empty text", ""],
    ["blanks only", "   "],
    ["nothing but what is removed", '"\\\u0000\u001f"'],
    ["no text at all", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { name: "Ada" }],
  ])('is "?" for %s', (_what, name) => {
    expect(safePresenceLabel(name)).toBe("?");
  });
});
