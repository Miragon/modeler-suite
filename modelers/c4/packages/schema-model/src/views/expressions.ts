import type { ElementKind, Expression } from "../types.js";

/*
 * The include and exclude terms of a static view as Structurizr 6.2.4's `ExpressionParser` reads
 * them (R-DSL §11.3), branch for branch and in its order, so a term means here what it means
 * there. A term the reference reads only by accident (a prefix in the wrong case, a deployment
 * type) has no expression: its view becomes read-only instead of being guessed.
 */

const ARROW = "->";

/** `ExpressionParser.isExpression`: whether a term is an expression rather than an identifier. */
export function isExpressionText(term: string): boolean {
  const lower = term.toLowerCase();
  return (
    [
      "element==",
      "element!=",
      "element.type==",
      "element.tag==",
      "element.tag!=",
      "element.technology==",
      "element.technology!=",
      "element.group==",
      "element.parent==",
      "relationship.tag==",
      "relationship.tag!=",
      "relationship.source==",
      "relationship.destination==",
      "relationship==",
    ].some((prefix) => lower.startsWith(prefix)) ||
    lower.includes(ARROW) ||
    /^element\.properties\[.*]==.*$/.test(lower) ||
    /^relationship\.properties\[.*]==.*$/.test(lower)
  );
}

/** The expression of one include or exclude term, undefined when it is not supported (SPEC 4.1). */
export function parseExpression(term: string): Expression | undefined {
  if (term === "*" || term === "element==*") return { kind: "all", reluctant: false };
  if (term === "*?") return { kind: "all", reluctant: true };
  if (!isExpressionText(term)) return { kind: "reference", identifier: term };
  return combined(term);
}

/** `parseExpression`: two operands of ` && ` or ` || `; the reference drops a third. */
function combined(expression: string): Expression | undefined {
  for (const [separator, kind] of [
    [" && ", "and"],
    [" || ", "or"],
  ] as const) {
    if (!expression.includes(separator)) continue;
    const [first = "", second = ""] = expression.split(separator);
    const left = operand(first, false);
    const right = operand(second, false);
    return left && right ? { kind, left, right } : undefined;
  }
  return single(expression);
}

function operand(text: string, combine: boolean): Expression | undefined {
  if (!isExpressionText(text)) return { kind: "reference", identifier: text };
  return combine ? combined(text) : single(text);
}

/** `evaluateExpression`, one branch per case. */
function single(expression: string): Expression | undefined {
  if (expression.startsWith("element==")) {
    return operand(expression.slice("element==".length), false);
  }
  if (expression.startsWith("element!=")) {
    const negated = operand(expression.slice("element!=".length), false);
    return negated && { kind: "not", operand: negated };
  }
  if (expression.startsWith("relationship==")) {
    const rest = expression.slice("relationship==".length);
    return operand(rest === "*" ? "*->*" : rest, false);
  }
  if (expression === ARROW) return undefined;
  if (expression.startsWith(ARROW) || expression.endsWith(ARROW)) return coupling(expression);
  if (expression.includes(ARROW)) return relationshipBetween(expression);
  return elementProperty(expression) ?? relationshipProperty(expression);
}

function coupling(expression: string): Expression | undefined {
  const afferent = expression.startsWith(ARROW);
  let identifier = afferent ? expression.slice(ARROW.length) : expression;
  const efferent = identifier.endsWith(ARROW);
  if (efferent) identifier = identifier.slice(0, identifier.length - ARROW.length);
  const inner = operand(identifier.trim(), true);
  return inner && { kind: "coupling", afferent, efferent, operand: inner };
}

function relationshipBetween(expression: string): Expression | undefined {
  const [sourceText = "", destinationText = ""] = expression.split(ARROW);
  const source = sourceText.trim();
  const destination = destinationText.trim();
  if (!isExpressionText(source) && !isExpressionText(destination)) {
    return { kind: "relationship", source, destination };
  }
  if (destination === "*") return end("source", source);
  if (source === "*") return end("destination", destination);
  if ([source, destination].some((side) => side.includes(" && ") || side.includes(" || "))) {
    return undefined;
  }
  const left = end("source", source);
  const right = end("destination", destination);
  return left && right ? { kind: "and", left, right } : undefined;
}

function end(side: "source" | "destination", text: string): Expression | undefined {
  const inner = operand(text, true);
  return inner && { kind: "relationshipEnd", end: side, operand: inner };
}

const ELEMENT_TYPES: Readonly<Record<string, ElementKind>> = {
  custom: "custom",
  person: "person",
  softwaresystem: "softwareSystem",
  container: "container",
  component: "component",
};

function elementProperty(expression: string): Expression | undefined {
  const lower = expression.toLowerCase();
  const rest = (prefix: string) => expression.slice(prefix.length);
  if (lower.startsWith("element.parent==")) {
    return { kind: "elementParent", parent: rest("element.parent==") };
  }
  if (lower.startsWith("element.type==")) {
    const elementKind = ELEMENT_TYPES[rest("element.type==").toLowerCase()];
    return elementKind && { kind: "elementType", elementKind };
  }
  for (const [prefix, equals] of [
    ["element.tag==", true],
    ["element.tag!=", false],
  ] as const) {
    if (lower.startsWith(prefix))
      return { kind: "elementTag", equals, tags: tagList(rest(prefix)) };
  }
  for (const [prefix, equals] of [
    ["element.technology==", true],
    ["element.technology!=", false],
  ] as const) {
    if (lower.startsWith(prefix)) {
      return { kind: "elementTechnology", equals, technology: rest(prefix) };
    }
  }
  if (/^element\.properties\[.*]==.*$/.test(expression)) {
    return { kind: "elementProperty", ...propertyTest(expression) };
  }
  if (lower.startsWith("element.group==")) {
    return { kind: "elementGroup", group: expression.slice(expression.indexOf("==") + 2) };
  }
  return undefined;
}

function relationshipProperty(expression: string): Expression | undefined {
  for (const [prefix, equals] of [
    ["relationship.tag==", true],
    ["relationship.tag!=", false],
  ] as const) {
    if (expression.startsWith(prefix)) {
      return { kind: "relationshipTag", equals, tags: tagList(expression.slice(prefix.length)) };
    }
  }
  if (/^relationship\.properties\[.*]==.*$/.test(expression)) {
    return { kind: "relationshipProperty", ...propertyTest(expression) };
  }
  for (const side of ["source", "destination"] as const) {
    const prefix = `relationship.${side}==`;
    if (expression.startsWith(prefix)) return end(side, expression.slice(prefix.length));
  }
  return undefined;
}

/**
 * Java's `split(",")`: trailing empty parts dropped, but an empty text is one empty tag, so
 * `element.tag==` selects nothing as it does there; each tag trimmed as `hasTag` does.
 */
function tagList(text: string): string[] {
  if (text.length === 0) return [""];
  const parts = text.split(",");
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts.map((part) => part.trim());
}

function propertyTest(expression: string): { name: string; value: string } {
  return {
    name: expression.slice(expression.indexOf("[") + 1, expression.indexOf("]")),
    value: expression.slice(expression.indexOf("==") + 2),
  };
}
