import { describe, expect, it } from "vitest";
import { isExpressionText, parseExpression } from "../src/views/expressions.js";
import type { Expression } from "../src/types.js";

const ref = (identifier: string): Expression => ({ kind: "reference", identifier });

describe("parseExpression: every supported term (SPEC 4.1, R-DSL §11.3)", () => {
  it.each<[string, Expression]>([
    ["*", { kind: "all", reluctant: false }],
    ["element==*", { kind: "all", reluctant: false }],
    ["*?", { kind: "all", reluctant: true }],
    ["customer", ref("customer")],
    ["shop.api", ref("shop.api")],
    ["element==customer", ref("customer")],
    ["->shop", { kind: "coupling", afferent: true, efferent: false, operand: ref("shop") }],
    ["shop->", { kind: "coupling", afferent: false, efferent: true, operand: ref("shop") }],
    ["->shop->", { kind: "coupling", afferent: true, efferent: true, operand: ref("shop") }],
    [
      "element==->shop->",
      { kind: "coupling", afferent: true, efferent: true, operand: ref("shop") },
    ],
    ["element!=shop", { kind: "not", operand: ref("shop") }],
    [
      "element!=element.tag==External",
      { kind: "not", operand: { kind: "elementTag", equals: true, tags: ["External"] } },
    ],
    ["element.type==Container", { kind: "elementType", elementKind: "container" }],
    ["element.type==softwaresystem", { kind: "elementType", elementKind: "softwareSystem" }],
    ["element.type==Person", { kind: "elementType", elementKind: "person" }],
    ["element.type==Custom", { kind: "elementType", elementKind: "custom" }],
    ["element.type==Component", { kind: "elementType", elementKind: "component" }],
    ["element.parent==shop", { kind: "elementParent", parent: "shop" }],
    ["element.tag==A,B", { kind: "elementTag", equals: true, tags: ["A", "B"] }],
    ["element.tag!=A, B", { kind: "elementTag", equals: false, tags: ["A", "B"] }],
    ["element.technology==Java", { kind: "elementTechnology", equals: true, technology: "Java" }],
    ["element.technology!=Java", { kind: "elementTechnology", equals: false, technology: "Java" }],
    ["element.properties[team]==blue", { kind: "elementProperty", name: "team", value: "blue" }],
    ["element.group==Internal", { kind: "elementGroup", group: "Internal" }],
    ["*->*", { kind: "relationship", source: "*", destination: "*" }],
    ["shop->*", { kind: "relationship", source: "shop", destination: "*" }],
    ["*->shop", { kind: "relationship", source: "*", destination: "shop" }],
    ["customer->shop", { kind: "relationship", source: "customer", destination: "shop" }],
    ["customer -> shop", { kind: "relationship", source: "customer", destination: "shop" }],
    ["relationship==*", { kind: "relationship", source: "*", destination: "*" }],
    ["relationship==a->b", { kind: "relationship", source: "a", destination: "b" }],
    ["relationship==rel1", ref("rel1")],
    ["relationship.tag==Async", { kind: "relationshipTag", equals: true, tags: ["Async"] }],
    ["relationship.tag!=Async", { kind: "relationshipTag", equals: false, tags: ["Async"] }],
    [
      "relationship.properties[kind]==sync",
      { kind: "relationshipProperty", name: "kind", value: "sync" },
    ],
    ["relationship.source==shop", { kind: "relationshipEnd", end: "source", operand: ref("shop") }],
    [
      "relationship.destination==shop",
      { kind: "relationshipEnd", end: "destination", operand: ref("shop") },
    ],
    [
      "relationship.source==element.tag==A",
      {
        kind: "relationshipEnd",
        end: "source",
        operand: { kind: "elementTag", equals: true, tags: ["A"] },
      },
    ],
    [
      "element.type==Container && element.parent==shop",
      {
        kind: "and",
        left: { kind: "elementType", elementKind: "container" },
        right: { kind: "elementParent", parent: "shop" },
      },
    ],
    [
      "element.tag==A || element.tag==B",
      {
        kind: "or",
        left: { kind: "elementTag", equals: true, tags: ["A"] },
        right: { kind: "elementTag", equals: true, tags: ["B"] },
      },
    ],
    [
      "element.tag==A->*",
      {
        kind: "relationshipEnd",
        end: "source",
        operand: { kind: "elementTag", equals: true, tags: ["A"] },
      },
    ],
  ])("%j", (term, expected) => {
    expect(parseExpression(term)).toEqual(expected);
  });

  it("reads a plain operand of a combination as a reference", () => {
    expect(parseExpression("element.tag==A || customer")).toEqual({
      kind: "or",
      left: { kind: "elementTag", equals: true, tags: ["A"] },
      right: ref("customer"),
    });
  });

  it("reads an empty tag list as Java's split does: one empty tag, trailing commas dropped", () => {
    expect(parseExpression("element.tag==")).toEqual({
      kind: "elementTag",
      equals: true,
      tags: [""],
    });
    expect(parseExpression("relationship.tag!=")).toEqual({
      kind: "relationshipTag",
      equals: false,
      tags: [""],
    });
    expect(parseExpression("element.tag==A,,")).toEqual({
      kind: "elementTag",
      equals: true,
      tags: ["A"],
    });
  });

  it("reads a third arrow the way the reference does, by dropping it", () => {
    expect(parseExpression("a->b->c")).toEqual({
      kind: "relationship",
      source: "a",
      destination: "b",
    });
  });

  it("drops a third operand as the reference does", () => {
    expect(parseExpression("element.tag==A && element.tag==B && element.tag==C")).toEqual({
      kind: "and",
      left: { kind: "elementTag", equals: true, tags: ["A"] },
      right: { kind: "elementTag", equals: true, tags: ["B"] },
    });
  });

  it("reads a prefix the reference compares case-insensitively in any case", () => {
    expect(parseExpression("Element.Type==Container")).toEqual({
      kind: "elementType",
      elementKind: "container",
    });
    expect(parseExpression("ELEMENT.TAG==x")).toEqual({
      kind: "elementTag",
      equals: true,
      tags: ["x"],
    });
  });

  it.each([
    "->",
    "ELEMENT==shop",
    "Relationship.tag==Async",
    "element.type==DeploymentNode",
    "element.type==InfrastructureNode",
    "element.type==Nonsense",
    "element.tag==A || x->y && z",
  ])("does not guess %j", (term) => {
    expect(parseExpression(term)).toBeUndefined();
  });
});

describe("isExpressionText (ExpressionParser.isExpression)", () => {
  it("tells expressions from identifiers", () => {
    expect(isExpressionText("customer")).toBe(false);
    expect(isExpressionText("shop.api")).toBe(false);
    expect(isExpressionText("element.foo==x")).toBe(false);
    expect(isExpressionText("a->b")).toBe(true);
    expect(isExpressionText("Element==x")).toBe(true);
    expect(isExpressionText("element.properties[a]==b")).toBe(true);
  });
});
