import { javaTrim } from "../syntax/characters.js";
import { escapedText, unescapeToken } from "../syntax/index.js";
import type { Token } from "../types.js";

/** `STRING_SUBSTITUTION_PATTERN` `\$\{[a-zA-Z0-9-_.]+?}`. */
const SUBSTITUTION = /\$\{[a-zA-Z0-9\-_.]+?\}/g;
/** `NameValueParser`: the names `!const` and `!var` accept. */
const CONSTANT_NAME = /^[a-zA-Z0-9\-_.]+$/;

export interface TokenValue {
  readonly value: string;
  /** `${NAME}` whose name no `!const` or `!var` before it defines: kept literally. */
  readonly unknown: readonly string[];
}

/**
 * `!const` and `!var` in document order, substituted per token after tokenizing (R-DSL §2.5):
 * into the token's escaped text, then unescaped, as `StructurizrDslParser.substituteStrings` and
 * `Tokens.get` do. Environment variables are never read, so their names stay literal.
 */
export class Constants {
  private readonly values = new Map<
    string,
    { readonly value: string; readonly constant: boolean }
  >();

  tokenValue(token: Token): TokenValue {
    if (!token.substitutes) return { value: token.value, unknown: [] };
    const original = escapedText(token);
    let substituted = original;
    const unknown: string[] = [];
    for (const match of original.matchAll(SUBSTITUTION)) {
      const before = match[0];
      const known = this.values.get(before.slice(2, -1));
      if (known === undefined) unknown.push(before);
      else substituted = substituted.split(before).join(known.value);
    }
    return { value: unescapeToken(substituted), unknown };
  }

  /** Undefined when the name is valid and not a constant yet, else why Structurizr refuses it. */
  define(name: string, value: string, constant: boolean): "invalid-name" | "taken" | undefined {
    if (!CONSTANT_NAME.test(name)) return "invalid-name";
    const existing = this.values.get(name);
    if (existing !== undefined && (constant || existing.constant)) return "taken";
    this.values.set(name, { value, constant });
    return undefined;
  }
}

/** Java's `String.split(",")`: trailing empty parts dropped, an empty text one empty part. */
export function javaSplit(text: string, separator = ","): string[] {
  if (text.length === 0) return [""];
  const parts = text.split(separator);
  while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 1 && parts[0] === "" && text.length > 0) return [];
  return parts;
}

/** The comma-separated tags of one token, each trimmed as Java does (`ModelItem.addTags`). */
export function tagsOf(text: string): string[] {
  return javaSplit(text).map(javaTrim);
}
