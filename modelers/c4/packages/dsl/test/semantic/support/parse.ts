import type { Diagnostic, DiagnosticCode } from "@miragon/c4-schema-model";
import { parseWorkspace } from "../../../src/parse.js";
import type { ParseResult } from "../../../src/types.js";

/** A DSL text from an indented template literal: the common indentation and the first line break go. */
export function dsl(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  const raw = strings.reduce(
    (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
    "",
  );
  const lines = raw.replace(/^\n/, "").split("\n");
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^ */.exec(line)?.[0].length ?? 0);
  const cut = Math.min(...indents);
  return lines.map((line) => line.slice(cut)).join("\n");
}

/** A model block inside a workspace. */
export function model(body: string, views = ""): string {
  const indent = (text: string, by: string) =>
    text
      .split("\n")
      .map((line) => (line.trim() === "" ? line : by + line))
      .join("\n");
  const viewsBlock = views === "" ? "" : `    views {\n${indent(views, "        ")}\n    }\n`;
  return `workspace {\n    model {\n${indent(body, "        ")}\n    }\n${viewsBlock}}\n`;
}

export function parse(text: string): ParseResult {
  return parseWorkspace(text);
}

export function diagnostics(text: string, code?: DiagnosticCode): Diagnostic[] {
  return parse(text).diagnostics.filter(
    (diagnostic) => code === undefined || diagnostic.code === code,
  );
}

export function codes(text: string): string[] {
  return parse(text).diagnostics.map(
    (diagnostic) => `${diagnostic.severity}:${diagnostic.code}${diagnostic.rejects ? "!" : ""}`,
  );
}

export function rejections(text: string): DiagnosticCode[] {
  return parse(text)
    .diagnostics.filter((diagnostic) => diagnostic.rejects)
    .map((diagnostic) => diagnostic.code);
}

export function errors(text: string): DiagnosticCode[] {
  return parse(text)
    .diagnostics.filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.code);
}
