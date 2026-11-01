/*
 * `Tokenizer.tokenize` of the reference parser, on a logical line, with each token mapped back
 * to its source range.
 */
import type { Token } from "../types.js";
import { hasSubstitution, isJavaWhitespace, javaTrimBounds, unescapeToken } from "./characters.js";
import type { LogicalLine } from "./logicalLines.js";

const QUOTE = 0x22;
const BACKSLASH = 0x5c;

/** Each token's text as the tokenizer emits it: before constants are substituted and escapes resolved. */
const escapedTexts = new WeakMap<Token, string>();

/**
 * A token's text before `Tokens.get` resolves `\"` and `\n`, with a text block's content in place.
 * Structurizr substitutes `${NAME}` into this text first and unescapes afterwards; a builder that
 * wants the same value does both, in that order, on this text.
 */
export function escapedText(token: Token): string {
  return escapedTexts.get(token) ?? token.value;
}

interface Pending {
  start: number;
  quoted: boolean;
  parts: string[];
  textBlock: boolean;
}

function makeToken(text: string, line: LogicalLine, pending: Pending, endIndex: number): Token {
  const start = line.offsets[pending.start] ?? line.start;
  const end = (line.offsets[endIndex - 1] ?? start) + 1;
  const escaped = pending.parts.join("");
  const token: Token = {
    value: unescapeToken(escaped),
    raw: text.slice(start, end),
    quoted: pending.quoted,
    textBlock: pending.textBlock,
    substitutes: hasSubstitution(escaped),
    range: { start, end },
  };
  escapedTexts.set(token, escaped);
  return token;
}

/** The tokens of a logical line: whitespace-separated, a quote opens a string only at a token's start. */
export function tokenize(text: string, line: LogicalLine): Token[] {
  const tokens: Token[] = [];
  const { chars, placeholder } = line;
  const blockValue = line.textBlock?.value ?? "";
  const bounds = javaTrimBounds(chars);
  let pending: Pending | undefined;
  for (let index = bounds.start; index < bounds.end; index += 1) {
    const code = chars.charCodeAt(index);
    if (pending === undefined) {
      if (index === placeholder) {
        pending = { start: index, quoted: false, parts: [blockValue], textBlock: true };
      } else if (code === QUOTE) {
        pending = { start: index, quoted: true, parts: [], textBlock: false };
      } else if (!isJavaWhitespace(code)) {
        pending = { start: index, quoted: false, parts: [chars.charAt(index)], textBlock: false };
      }
    } else if (index === placeholder) {
      pending.parts.push(blockValue);
      pending.textBlock = true;
    } else if (code === QUOTE && chars.charCodeAt(index - 1) === BACKSLASH) {
      pending.parts.push('"');
    } else if (pending.quoted && code === QUOTE) {
      tokens.push(makeToken(text, line, pending, index + 1));
      pending = undefined;
    } else if (!pending.quoted && isJavaWhitespace(code)) {
      tokens.push(makeToken(text, line, pending, index));
      pending = undefined;
    } else {
      pending.parts.push(chars.charAt(index));
    }
  }
  if (pending !== undefined) {
    tokens.push(makeToken(text, line, pending, bounds.end));
  }
  return tokens;
}
