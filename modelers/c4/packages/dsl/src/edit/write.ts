/*
 * How the edit layer writes tokens (SPEC 3.5 "Tokens"): keywords in canonical camel case,
 * identifiers unquoted, every string value quoted with `"` as `\"` and a line break as `\n`.
 * The reference tokenizer has no escape for a backslash, so a value it would read back differently
 * is refused instead of written (R-DSL §2.4, §17 #6).
 */
import type { Token } from "../types.js";
import { refuse, UNREPRESENTABLE_MESSAGE } from "./refusal.js";

const SUBSTITUTION = /\$\{[a-zA-Z0-9\-_.]+?\}/;

/** Why a value can't be written as a quoted token, or undefined when it can. */
export function unrepresentable(value: string): string | undefined {
  if (/\\n|\\"/.test(value) || value.endsWith("\\")) return UNREPRESENTABLE_MESSAGE;
  if (SUBSTITUTION.test(value)) {
    return "A value with ${…} can't be stored in the DSL: Structurizr reads it as a constant.";
  }
  return undefined;
}

/** A quoted token for `value`; refused (`unrepresentable-value`) when it would read back differently. */
export function quote(value: string): string {
  const reason = unrepresentable(value);
  if (reason !== undefined) refuse("unrepresentable-value", reason);
  return `"${value.replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, "\\n")}"`;
}

/** `"key" "value"`: a properties entry, both quoted. */
export function propertyLine(key: string, value: string): string {
  return `${quote(key)} ${quote(value)}`;
}

/**
 * The text block that replaces `token` with `value`, keeping its opening, its closing line and
 * the indentation of its content (SPEC 3.5).
 */
export function textBlock(text: string, token: Token, value: string, lineBreak: string): string {
  if (value.includes('"""'))
    refuse("unrepresentable-value", "Three quotes in a row can't be stored in a text block.");
  const raw = text.slice(token.range.start, token.range.end);
  const firstBreak = raw.search(/\r?\n/);
  const lastBreak = Math.max(raw.lastIndexOf("\n"), 0);
  const opening = firstBreak === -1 ? '"""' : raw.slice(0, firstBreak);
  const closingLine = raw.slice(lastBreak + 1);
  const closingIndent = /^[ \t]*/.exec(closingLine)?.[0] ?? "";
  const contentLines = raw
    .slice(firstBreak === -1 ? raw.length : firstBreak, lastBreak)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  const contentIndent = /^[ \t]*/.exec(contentLines[0] ?? "")?.[0] ?? `${closingIndent}    `;
  const lines = value.split(/\r\n|\r|\n/);
  if (/^[ \t]/.test(lines[0] ?? "")) {
    refuse("unrepresentable-value", "A text block can't start with a space or a tab.");
  }
  const body = lines.map((line) => (line === "" ? "" : `${contentIndent}${line}`));
  return [opening, ...body, `${closingIndent}"""`].join(lineBreak);
}

/** Throws when a written line would continue onto the next or open a text block (SPEC 3.5). */
export function assertWritable(lines: string): void {
  for (const line of lines.split(/\r?\n/)) {
    if (line.endsWith("\\") || line.endsWith('"""')) {
      refuse("unrepresentable-value", UNREPRESENTABLE_MESSAGE);
    }
    if (/[ \t]$/.test(line)) throw new Error("a written line ends in whitespace");
  }
}

/** Canonical keywords of the element kinds and view types the modeler writes. */
export const ELEMENT_KEYWORD = {
  person: "person",
  softwareSystem: "softwareSystem",
  container: "container",
  component: "component",
} as const;

export const VIEW_KEYWORD = {
  systemLandscape: "systemLandscape",
  systemContext: "systemContext",
  container: "container",
  component: "component",
} as const;
