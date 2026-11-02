import { describe, expect, it } from "vitest";
import { impliedRelationships } from "../src/implied.js";
import type { Ancestry, ImpliedStrategy, Relationship } from "../src/types.js";
import { relationship } from "./support/model.js";

/** u (person), s with container s.c and component s.c.k, t with container t.d. */
const ANCESTRY: Ancestry = {
  parents: new Map([
    ["s.c", "s"],
    ["s.c.k", "s.c"],
    ["t.d", "t"],
  ]),
};

function implied(relationships: readonly Relationship[], strategy: ImpliedStrategy = "unless-any") {
  return impliedRelationships(
    relationships.map((item) => ({ relationship: item, strategy })),
    ANCESTRY,
  );
}

const pairs = (list: readonly Relationship[]) =>
  list.map((item) => `${item.sourceId}->${item.destinationId}`);

describe("impliedRelationships (R-DSL §10.1)", () => {
  it("implies every ancestor pair of a relationship deep in the tree", () => {
    const result = implied([
      relationship("u", "s.c.k", { description: "Uses", technology: "HTTPS" }),
    ]);
    expect(pairs(result)).toEqual(["u->s.c", "u->s"]);
    expect(result[0]).toMatchObject({
      key: "implied:u->s.c",
      canvasKey: "implied:u->s.c",
      implied: true,
      impliedBy: "u->s.c.k",
      description: "Uses",
      technology: "HTTPS",
      identifier: undefined,
    });
  });

  it("walks both ends and skips pairs related by ancestry", () => {
    const result = implied([relationship("s.c.k", "t.d")]);
    expect(pairs(result)).toEqual(["s.c.k->t", "s.c->t.d", "s.c->t", "s->t.d", "s->t"]);
  });

  it("never relates an element to its own ancestor", () => {
    expect(implied([relationship("s.c.k", "s.c")])).toEqual([]);
    expect(pairs(implied([relationship("s.c.k", "t.d")]))).not.toContain("s->s");
  });

  it("unless any relationship exists: an earlier one of the pair, explicit or implied, blocks it", () => {
    const result = implied([
      relationship("u", "s", { description: "Pays" }),
      relationship("u", "s.c", { description: "Logs in" }),
    ]);
    expect(pairs(result)).toEqual([]);
    const later = implied([
      relationship("u", "s.c", { description: "Logs in" }),
      relationship("u", "s.c.k", { description: "Reads" }),
    ]);
    expect(pairs(later)).toEqual(["u->s"]);
  });

  it("unless the same relationship exists: one implied relationship per description", () => {
    const result = implied(
      [
        relationship("u", "s.c", { description: "Logs in" }),
        relationship("u", "s.c.k", { description: "Reads" }),
      ],
      "unless-same",
    );
    expect(result.map((item) => [item.canvasKey, item.key, item.description])).toEqual([
      ["implied:u->s", "implied:u->s", "Logs in"],
      ["implied:u->s.c", "implied:u->s.c", "Reads"],
      ["implied:u->s#2", undefined, "Reads"],
    ]);
  });

  it("creates none where `!impliedRelationships false` is in force, switched per position", () => {
    const result = impliedRelationships(
      [
        { relationship: relationship("u", "s.c"), strategy: "none" },
        { relationship: relationship("u", "t.d"), strategy: "unless-any" },
      ],
      ANCESTRY,
    );
    expect(pairs(result)).toEqual(["u->t"]);
  });

  it("a relationship made with the strategy off still counts for later ones", () => {
    const result = impliedRelationships(
      [
        { relationship: relationship("u", "s", { description: "x" }), strategy: "none" },
        { relationship: relationship("u", "s.c", { description: "y" }), strategy: "unless-any" },
      ],
      ANCESTRY,
    );
    expect(result).toEqual([]);
  });

  it("ignores a duplicate Structurizr refuses (same ends and description)", () => {
    const first = relationship("u", "s.c", { identifier: "first" });
    const duplicate = relationship("u", "s.c", { identifier: "second" });
    const result = implied([first, duplicate]);
    expect(result.map((item) => item.impliedBy)).toEqual(["first"]);
  });

  it("carries the origin's tags, which Structurizr's styles and tag expressions read", () => {
    const [result] = implied([relationship("u", "s.c", { tags: ["Async"] })]);
    expect(result?.tags).toEqual(["Relationship", "Async"]);
  });

  it("is deterministic", () => {
    const input = [relationship("s.c.k", "t.d"), relationship("u", "s.c.k")];
    expect(implied(input)).toEqual(implied(input));
  });
});
