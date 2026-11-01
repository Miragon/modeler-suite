import { describe, expect, it } from "vitest";
import { deriveIdentifier, isValidIdentifier } from "../src/identifiers.js";
import { isKeyword } from "../src/keywords.js";
import type { IdentifierRegister } from "../src/types.js";

function register(
  taken: readonly string[] = [],
  archetypes: readonly string[] = [],
): IdentifierRegister {
  return {
    taken: new Set(taken.map((id) => id.toLowerCase())),
    archetypes: new Set(archetypes.map((name) => name.toLowerCase())),
  };
}

describe("deriveIdentifier (SPEC 3.3)", () => {
  it.each([
    ["Payment API", "softwareSystem", "paymentApi"],
    ["Internet Banking System", "softwareSystem", "internetBankingSystem"],
    ["customer", "person", "customer"],
    ["HTTP server", "container", "httpServer"],
    ["  spaced   out  ", "container", "spacedOut"],
    ["e-mail / SMS", "container", "eMailSms"],
    ["single-page_app", "container", "singlePageApp"],
  ] as const)("camel-cases %j", (name, kind, expected) => {
    expect(deriveIdentifier(name, kind, register(), "flat")).toBe(expected);
  });

  it("folds accents and compatibility characters (NFKD, combining marks dropped)", () => {
    expect(deriveIdentifier("Café Überweisung", "softwareSystem", register(), "flat")).toBe(
      "cafeUberweisung",
    );
    expect(deriveIdentifier("ﬁnance", "softwareSystem", register(), "flat")).toBe("finance");
  });

  it.each([
    ["person", "person"],
    ["softwareSystem", "softwareSystem"],
    ["container", "container"],
    ["component", "component"],
    ["custom", "element"],
  ] as const)(
    "names an empty or symbol-only %s after its kind, a keyword, so counted",
    (kind, word) => {
      expect(deriveIdentifier("", kind, register(), "flat")).toBe(`${word}2`);
      expect(deriveIdentifier("→ ✓ ★", kind, register(), "flat")).toBe(`${word}2`);
      expect(deriveIdentifier("", kind, register([`${word}2`]), "flat")).toBe(`${word}3`);
    },
  );

  it("prefixes a leading digit with the kind's camel name", () => {
    expect(deriveIdentifier("3D Viewer", "container", register(), "flat")).toBe(
      "container3dViewer",
    );
    expect(deriveIdentifier("42", "softwareSystem", register(), "flat")).toBe("softwareSystem42");
  });

  it("never hands out a keyword of the token table, case-insensitively", () => {
    expect(deriveIdentifier("Person", "person", register(), "flat")).toBe("person2");
    expect(deriveIdentifier("Container", "container", register(), "flat")).toBe("container2");
    expect(deriveIdentifier("Views", "softwareSystem", register(), "flat")).toBe("views2");
    expect(deriveIdentifier("This", "softwareSystem", register(), "flat")).toBe("this2");
    expect(deriveIdentifier("Auto layout", "softwareSystem", register(), "flat")).toBe(
      "autoLayout2",
    );
  });

  it("treats an archetype name of the workspace as taken", () => {
    expect(
      deriveIdentifier("Microservice", "container", register([], ["microservice"]), "flat"),
    ).toBe("microservice2");
  });

  it("counts on until the identifier is unused, case-insensitively", () => {
    const taken = register(["payments", "Payments2", "PAYMENTS3"]);
    expect(deriveIdentifier("Payments", "softwareSystem", taken, "flat")).toBe("payments4");
  });

  it("gives names that differ only in dots or slashes distinct identifiers", () => {
    const first = deriveIdentifier("a.b", "softwareSystem", register(), "flat");
    const second = deriveIdentifier("a/b", "softwareSystem", register([first]), "flat");
    expect([first, second]).toEqual(["aB", "aB2"]);
  });

  it("ignores the parent in flat mode, so an ancestor's name never shows", () => {
    expect(deriveIdentifier("API", "container", register(["api"]), "flat", "shop")).toBe("api2");
  });

  it("checks hierarchical identifiers among the siblings under the parent's id", () => {
    const taken = register(["shop.api", "api"]);
    expect(deriveIdentifier("API", "container", taken, "hierarchical", "shop")).toBe("api2");
    expect(deriveIdentifier("API", "container", taken, "hierarchical", "billing")).toBe("api");
    expect(deriveIdentifier("API", "softwareSystem", taken, "hierarchical")).toBe("api2");
  });

  it("only produces valid identifiers", () => {
    for (const name of ["", "3", "Ä-Ö", "a b c", "_x", "x--y", "日本語"]) {
      expect(isValidIdentifier(deriveIdentifier(name, "container", register(), "flat"))).toBe(true);
    }
  });
});

describe("isValidIdentifier (R-DSL §2.8)", () => {
  it.each(["a", "A1", "1x", "_private", "web-app", "a_b-c"])("accepts %j", (identifier) => {
    expect(isValidIdentifier(identifier)).toBe(true);
  });

  it.each(["", "-a", "a.b", "a b", "ä", "a!", "a=b"])("rejects %j", (identifier) => {
    expect(isValidIdentifier(identifier)).toBe(false);
  });
});

describe("isKeyword", () => {
  it("knows the element, view and statement keywords in any case", () => {
    for (const word of [
      "workspace",
      "MODEL",
      "softwaresystem",
      "deploymentNode",
      "include",
      "autolayout",
      "this",
      "systemLandscape",
      "filtered",
    ]) {
      expect(isKeyword(word), word).toBe(true);
    }
  });

  it("leaves ordinary words alone", () => {
    for (const word of ["customer", "payments", "api", "database"]) {
      expect(isKeyword(word), word).toBe(false);
    }
  });
});
