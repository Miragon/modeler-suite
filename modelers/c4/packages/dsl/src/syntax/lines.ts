/** One physical line: `[start, end)` is its content, `[end, breakEnd)` its line break. */
export interface PhysicalLine {
  readonly start: number;
  readonly end: number;
  readonly breakEnd: number;
}

export const BYTE_ORDER_MARK = "\uFEFF";

/**
 * Splits like the reference parser's string input (`dsl.split("\\r?\\n")`): a lone `\r` stays in
 * its line. A leading byte order mark belongs to no line. A final line break opens no line.
 */
export function splitPhysicalLines(text: string): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = text.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    if (newline === -1) {
      lines.push({ start, end: text.length, breakEnd: text.length });
      break;
    }
    const end = newline > start && text.charCodeAt(newline - 1) === 0x0d ? newline - 1 : newline;
    lines.push({ start, end, breakEnd: newline + 1 });
    start = newline + 1;
  }
  return lines;
}

/** The line break that starts at `offset`, or "" when none does. */
export function lineBreakAt(text: string, offset: number): string {
  if (text.startsWith("\r\n", offset)) {
    return "\r\n";
  }
  return text.charCodeAt(offset) === 0x0a ? "\n" : "";
}

/** The spaces and tabs a line starts with: what an inserted sibling line copies. */
export function indentationAt(text: string, offset: number): string {
  let end = offset;
  while (end < text.length) {
    const code = text.charCodeAt(end);
    if (code !== 0x20 && code !== 0x09) {
      break;
    }
    end += 1;
  }
  return text.slice(offset, end);
}

/**
 * 1-based line and column of an offset, in UTF-16 code units. A leading byte order mark counts as
 * no column, as editors such as VS Code drop it from the document.
 */
export class LineIndex {
  private readonly starts: number[];

  constructor(text: string) {
    this.starts = [text.startsWith(BYTE_ORDER_MARK) ? 1 : 0];
    let newline = text.indexOf("\n");
    while (newline !== -1) {
      this.starts.push(newline + 1);
      newline = text.indexOf("\n", newline + 1);
    }
  }

  position(offset: number): { readonly line: number; readonly column: number } {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((this.starts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const lineStart = this.starts[low] ?? 0;
    return { line: low + 1, column: Math.max(0, offset - lineStart) + 1 };
  }
}
