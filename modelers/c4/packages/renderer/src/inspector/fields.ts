import type { ParseResult } from "@miragon/c4-dsl";
import type { ElementId, FieldName, FieldSource } from "@miragon/c4-schema-model";

/** Why a field cannot be edited here (SPEC 5.6), or undefined when it can. */
export function readOnlyReason(
  parse: ParseResult,
  id: ElementId | undefined,
  field: FieldName,
  source: FieldSource,
  bulk: "element" | "relationship" | undefined,
): string | undefined {
  if (bulk === "relationship") return "Set by a !relationships statement. Edit it in the text.";
  if (source.editable) return undefined;
  switch (source.reason) {
    case "substitution": {
      const raw = substitutedToken(parse, id, field);
      return raw
        ? `Set with ${raw}. Edit the constant in the text.`
        : "Set with a constant. Edit the constant in the text.";
    }
    case "bulk":
      return "Set by an !elements statement. Edit it in the text.";
    case "several-statements":
      return field === "tags"
        ? "Tags are set in several places. Edit them in the text."
        : "Set in several places. Edit it in the text.";
    case "include":
      return "Set in an included file. Edit it there.";
    default:
      return "Can't be edited here. Edit it in the text.";
  }
}

/** The token as written, `${PAYMENTS_NAME}`, read from the parse's source index when it has it. */
function substitutedToken(
  parse: ParseResult,
  id: ElementId | undefined,
  field: FieldName,
): string | undefined {
  if (id === undefined) return undefined;
  try {
    const source = parse.sources.field(id, field);
    if (!source || source.token === undefined) return undefined;
    return source.statement.tokens[source.token]?.raw;
  } catch {
    return undefined;
  }
}

/** The 1-based line of the element's defining statement, when the parse knows it. */
export function definitionLine(parse: ParseResult, id: ElementId): number | undefined {
  try {
    const start = parse.sources.element(id)?.definition.range.start;
    if (start === undefined) return undefined;
    let line = 1;
    for (let index = 0; index < start && index < parse.text.length; index += 1) {
      if (parse.text.charCodeAt(index) === 10) line += 1;
    }
    return line;
  } catch {
    return undefined;
  }
}

/** Own tags as the field shows them, and back. */
export function tagsText(tags: readonly string[]): string {
  return tags.join(", ");
}

export function tagsOf(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}
