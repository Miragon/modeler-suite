import type { Diagnostic, DiagnosticCode, ElementId } from "@miragon/c4-schema-model";
import { LineIndex, normalisedAnchor } from "../syntax/index.js";
import type { TextRange } from "../types.js";

/**
 * A diagnostic whose anchor and element are read once the identifiers are final: an anonymous
 * element's id is derived only after every explicit identifier is registered (SPEC 3.3).
 */
export interface PendingDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Diagnostic["severity"];
  readonly rejects: boolean;
  readonly message: string;
  readonly range: TextRange;
  readonly anchor: () => string;
  readonly elementId?: (() => ElementId | undefined) | undefined;
}

export class Reporter {
  private readonly pending: PendingDiagnostic[] = [];

  constructor(private readonly text: string) {}

  add(diagnostic: PendingDiagnostic): void {
    this.pending.push(diagnostic);
  }

  /** A rule of SPEC 3.8 that makes the text unreadable for the canvas. */
  reject(code: DiagnosticCode, message: string, range: TextRange, anchor: () => string): void {
    this.add({ code, severity: "error", rejects: true, message, range, anchor });
  }

  /** What Structurizr 6.2.4 refuses but the canvas shows safely (SPEC 3.8). */
  incompatible(
    code: DiagnosticCode,
    message: string,
    range: TextRange,
    anchor: () => string,
    elementId?: () => ElementId | undefined,
  ): void {
    this.add({ code, severity: "error", rejects: false, message, range, anchor, elementId });
  }

  note(
    code: DiagnosticCode,
    severity: "warning" | "info",
    message: string,
    range: TextRange,
    anchor: () => string,
    elementId?: () => ElementId | undefined,
  ): void {
    this.add({ code, severity, rejects: false, message, range, anchor, elementId });
  }

  /** The first line of `range`, whitespace runs collapsed: a statement's identity without its position. */
  statementText(range: TextRange): string {
    return normalisedAnchor(this.text, range);
  }

  finish(lines: LineIndex = new LineIndex(this.text)): Diagnostic[] {
    return this.pending.map((pending) => {
      const start = lines.position(pending.range.start);
      const end = lines.position(pending.range.end);
      const elementId = pending.elementId?.();
      const diagnostic: Diagnostic = {
        severity: pending.severity,
        code: pending.code,
        message: pending.message,
        range: { start: pending.range.start, end: pending.range.end },
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
        rejects: pending.rejects,
        anchor: pending.anchor(),
      };
      return elementId === undefined ? diagnostic : { ...diagnostic, elementId };
    });
  }
}
