/*
 * The character classes of the reference parser (Structurizr 6.2.4 runs on Java 17 or later),
 * so the lexer splits, trims and classifies exactly where Structurizr does.
 */

/** `Character.isWhitespace(char)`: the tokenizer's separator and `String.stripLeading()`. */
export function isJavaWhitespace(code: number): boolean {
  if (code <= 0x20) {
    return code === 0x20 || (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x1f);
  }
  if (code < 0x1680) {
    return false;
  }
  return (
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a && code !== 0x2007) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x205f ||
    code === 0x3000
  );
}

/** `\s` of a `java.util.regex.Pattern` without UNICODE_CHARACTER_CLASS: `[ \t\n\x0B\f\r]`. */
export function isRegexSpace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/**
 * A character an editor shows as nothing or as a plain space that `Character.isWhitespace`
 * doesn't count: controls, the no-break spaces, the zero-width spaces and joiners.
 */
function isInvisibleCharacter(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0xa0 ||
    code === 0x2007 ||
    code === 0x202f ||
    (code >= 0x200b && code <= 0x200d) ||
    code === 0x2060 ||
    code === 0xfeff
  );
}

/** Whether a token's text holds only characters that look like no text at all. */
export function isInvisibleText(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  for (let index = 0; index < text.length; index += 1) {
    if (!isInvisibleCharacter(text.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

/** What `.` of a Java pattern refuses to match without DOTALL. */
export function isJavaLineTerminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x85 || code === 0x2028 || code === 0x2029;
}

/** `String.trim()` cuts every character up to U+0020 from both ends, NUL and other controls too. */
export function javaTrimBounds(text: string): { readonly start: number; readonly end: number } {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) {
    start += 1;
  }
  while (end > start && text.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  return { start, end };
}

export function javaTrim(text: string): string {
  const { start, end } = javaTrimBounds(text);
  return text.slice(start, end);
}

/** The count of leading characters `String.stripLeading()` removes. */
export function javaLeadingWhitespace(text: string, from = 0, to = text.length): number {
  let index = from;
  while (index < to && isJavaWhitespace(text.charCodeAt(index))) {
    index += 1;
  }
  return index - from;
}

/** `EMPTY_LINE_PATTERN` `^\s*` with `matches()`. */
export function isEmptyLine(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (!isRegexSpace(text.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

/** `COMMENT_PATTERN` `^\s*?(//|#).*$` with `matches()`: a whole-line `//` or `#` comment. */
export function isCommentLine(text: string): boolean {
  let index = 0;
  while (index < text.length && isRegexSpace(text.charCodeAt(index))) {
    index += 1;
  }
  let rest: number;
  if (text.startsWith("//", index)) {
    rest = index + 2;
  } else if (text.charCodeAt(index) === 0x23) {
    rest = index + 1;
  } else {
    return false;
  }
  for (; rest < text.length; rest += 1) {
    if (isJavaLineTerminator(text.charCodeAt(rest))) {
      return false;
    }
  }
  return true;
}

/** `IDENTIFIER_PATTERN` `\w[a-zA-Z0-9_-]*` (Java `\w` is ASCII) and no leading `-`. */
export function isAssignableIdentifier(identifier: string): boolean {
  if (identifier.length === 0) {
    return false;
  }
  for (let index = 0; index < identifier.length; index += 1) {
    const code = identifier.charCodeAt(index);
    const word =
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      code === 0x5f;
    if (!word && (index === 0 || code !== 0x2d)) {
      return false;
    }
  }
  return true;
}

function isSubstitutionNameCharacter(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f ||
    code === 0x2d ||
    code === 0x2e
  );
}

/** Whether `STRING_SUBSTITUTION_PATTERN` `\$\{[a-zA-Z0-9-_.]+?}` finds a match. */
export function hasSubstitution(text: string): boolean {
  let from = text.indexOf("${");
  while (from !== -1) {
    let index = from + 2;
    while (index < text.length && isSubstitutionNameCharacter(text.charCodeAt(index))) {
      index += 1;
    }
    if (index > from + 2 && text.charCodeAt(index) === 0x7d) {
      return true;
    }
    from = text.indexOf("${", from + 2);
  }
  return false;
}

/** `Tokens.get`: `\"` becomes `"`, then `\n` becomes a line break; nothing else is an escape. */
export function unescapeToken(text: string): string {
  return text.replaceAll('\\"', '"').replaceAll("\\n", "\n");
}
