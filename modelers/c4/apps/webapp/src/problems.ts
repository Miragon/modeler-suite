import type { ProblemItem, ProblemSeverity } from "@miragon/modeler-shell";
import type { Diagnostic } from "@miragon/c4-schema-model";

/** A statement longer than this is cut in the row's place, so the row stays two lines. */
const SOURCE_LENGTH = 60;

/** The first line of the statement a diagnostic names, trimmed and cut to the row's width. */
function sourceLine(lines: readonly string[], line: number): string | undefined {
  const source = lines[line - 1]?.trim();
  if (!source) return undefined;
  return source.length > SOURCE_LENGTH
    ? `${source.slice(0, SOURCE_LENGTH - 1).trimEnd()}…`
    : source;
}

const RANK: Readonly<Record<ProblemSeverity, number>> = { error: 0, warning: 1 };

/**
 * The parser's errors and warnings as rows of the problems list (guide §5.10), errors first and
 * each kind in the order of the text: the message, its line and statement as the place, and the
 * element a click on the row reveals where some view can show it. Infos stay out: they describe
 * what the modeler keeps for Structurizr, not something to fix.
 */
export function problemItems(
  diagnostics: readonly Diagnostic[],
  text: string,
  canReveal: (elementId: string) => boolean,
): ProblemItem[] {
  const problems = diagnostics.flatMap((diagnostic) =>
    diagnostic.severity === "info" ? [] : [{ diagnostic, severity: diagnostic.severity }],
  );
  // Split once: the list is rebuilt after every edit, and a large workspace has many rows.
  const lines = problems.length === 0 ? [] : text.split(/\r\n|\r|\n/);
  return problems
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.diagnostic.line - b.diagnostic.line)
    .map(({ diagnostic, severity }) => {
      const source = sourceLine(lines, diagnostic.line);
      const location = source ? `Line ${diagnostic.line} · ${source}` : `Line ${diagnostic.line}`;
      const elementId =
        diagnostic.elementId !== undefined && canReveal(diagnostic.elementId)
          ? diagnostic.elementId
          : undefined;
      return {
        severity,
        message: diagnostic.message,
        location,
        ...(elementId === undefined ? {} : { elementId }),
      };
    });
}

function counted(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** The toast after an opened workspace with problems points at the pill (guide §9). */
export function openedWithProblemsText(items: readonly ProblemItem[], pillLabel: string): string {
  const errors = items.filter((item) => item.severity === "error").length;
  const warnings = items.length - errors;
  const found = [
    ...(errors > 0 ? [counted(errors, "error")] : []),
    ...(warnings > 0 ? [counted(warnings, "warning")] : []),
  ].join(" and ");
  return `Opened with ${found}. Details under “${pillLabel}” bottom left.`;
}
