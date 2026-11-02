import type { Diagnostic } from "@miragon/c4-schema-model";
import { buildSemantics } from "./semantic/index.js";
import { parseCst } from "./syntax/index.js";
import type { ParseResult } from "./types.js";

function bySourceOrder(left: Diagnostic, right: Diagnostic): number {
  return left.range.start - right.range.start || left.range.end - right.range.end;
}

/** Total: whitespace-only text is the empty workspace; what rejects is in `diagnostics` (SPEC 3.8). */
export function parseWorkspace(text: string): ParseResult {
  const cst = parseCst(text);
  const semantics = buildSemantics(cst);
  const diagnostics = [...cst.syntaxDiagnostics, ...semantics.diagnostics].sort(bySourceOrder);
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.rejects),
    text,
    cst,
    workspace: semantics.workspace,
    diagnostics,
    sources: semantics.sources,
  };
}
