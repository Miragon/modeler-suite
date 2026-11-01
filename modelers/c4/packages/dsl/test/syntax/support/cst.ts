import { expect } from "vitest";
import type { Cst, CstNode, Statement } from "../../../src/types.js";
import { parseCst, walkCst } from "../../../src/syntax/index.js";
import { cstProblems } from "./invariants.js";

/** Parses and checks the tree against the text before a test looks at it. */
export function parseSound(text: string): Cst {
  const cst = parseCst(text);
  expect(cstProblems(text, cst)).toEqual([]);
  return cst;
}

export function nodesOf(cst: Cst): CstNode[] {
  const nodes: CstNode[] = [];
  walkCst(cst.nodes, (node) => nodes.push(node));
  return nodes;
}

export function statementsOf(cst: Cst): Statement[] {
  return nodesOf(cst).filter((node): node is Statement => node.kind === "statement");
}

export function valuesOf(statement: Statement | undefined): string[] {
  return statement?.tokens.map((token) => token.value) ?? [];
}

/** The token values of every statement in document order. */
export function statementValues(text: string): string[][] {
  return statementsOf(parseSound(text)).map(valuesOf);
}

export function codesOf(cst: Cst): string[] {
  return cst.syntaxDiagnostics.map(
    (diagnostic) => `${diagnostic.code}${diagnostic.rejects ? "!" : ""}`,
  );
}

export function kindsOf(nodes: readonly CstNode[]): string[] {
  return nodes.map((node) =>
    node.kind === "statement" ? `statement:${node.tokens[0]?.value ?? ""}` : node.kind,
  );
}
