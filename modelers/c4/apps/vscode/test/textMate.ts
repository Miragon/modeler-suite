/*
 * A small TextMate tokenizer for the grammar tests: `match`, `begin`/`end`, `captures` (with
 * `patterns`), `include` of repository rules and `contentName`, scanned the way VS Code's
 * vscode-textmate does (the earliest match wins, `end` before a pattern at the same place, then the
 * order of the patterns). The grammar's regexes are Oniguruma; it uses only what JavaScript reads
 * alike, a leading `(?i)` being JavaScript's `i` flag, and `compile` fails on anything else.
 */

export interface Capture {
  readonly name?: string;
  readonly patterns?: readonly Rule[];
}

export interface Rule {
  readonly name?: string;
  readonly contentName?: string;
  readonly match?: string;
  readonly begin?: string;
  readonly end?: string;
  readonly captures?: Readonly<Record<string, Capture>>;
  readonly beginCaptures?: Readonly<Record<string, Capture>>;
  readonly endCaptures?: Readonly<Record<string, Capture>>;
  readonly patterns?: readonly Rule[];
  readonly include?: string;
}

export interface Grammar {
  readonly scopeName: string;
  readonly patterns: readonly Rule[];
  readonly repository: Readonly<Record<string, Rule>>;
}

export interface Token {
  readonly line: number;
  readonly start: number;
  readonly text: string;
  readonly scopes: readonly string[];
}

interface Frame {
  readonly rule: Rule;
  readonly scopes: readonly string[];
  readonly contentScopes: readonly string[];
  readonly patterns: readonly Rule[];
}

const ONIGURUMA_ONLY = [/\(\?i\)/, /\\[hHAzZG]/, /\(\?[imx-]+:/, /\*\+|\+\+|\?\+/, /\(\?>/];

export function compile(source: string): RegExp {
  const insensitive = source.startsWith("(?i)");
  const body = insensitive ? source.slice(4) : source;
  for (const pattern of ONIGURUMA_ONLY) {
    if (pattern.test(body)) throw new Error(`Oniguruma-only syntax in ${source}`);
  }
  return new RegExp(body, insensitive ? "dgi" : "dg");
}

/** Every rule of the grammar, the repository's and the nested ones, with every capture's rules. */
export function allRules(grammar: Grammar): Rule[] {
  const found: Rule[] = [];
  const visit = (rule: Rule) => {
    found.push(rule);
    for (const nested of rule.patterns ?? []) visit(nested);
    for (const captures of [rule.captures, rule.beginCaptures, rule.endCaptures]) {
      for (const capture of Object.values(captures ?? {})) {
        for (const nested of capture.patterns ?? []) visit(nested);
      }
    }
  };
  for (const rule of grammar.patterns) visit(rule);
  for (const rule of Object.values(grammar.repository)) visit(rule);
  return found;
}

export function createTokenizer(grammar: Grammar) {
  const regexes = new Map<string, RegExp>();
  const regex = (source: string) => {
    let compiled = regexes.get(source);
    if (compiled === undefined) {
      compiled = compile(source);
      regexes.set(source, compiled);
    }
    return compiled;
  };

  function resolve(rules: readonly Rule[]): Rule[] {
    return rules.flatMap((rule) => {
      if (rule.include === undefined) return [rule];
      const name = rule.include.replace(/^#/, "");
      const target = grammar.repository[name];
      if (!rule.include.startsWith("#") || target === undefined) {
        throw new Error(`Unknown include ${rule.include}`);
      }
      return target.match !== undefined || target.begin !== undefined
        ? [target]
        : resolve(target.patterns ?? []);
    });
  }

  function exec(source: string, text: string, from: number): RegExpExecArray | null {
    const compiled = regex(source);
    compiled.lastIndex = from;
    return compiled.exec(text);
  }

  function tokenizeRange(
    line: number,
    text: string,
    from: number,
    stack: Frame[],
    out: Token[],
    floor: number,
  ): void {
    let position = from;
    const emit = (start: number, end: number, scopes: readonly string[]) => {
      if (end > start) out.push({ line, start, text: text.slice(start, end), scopes });
    };
    for (;;) {
      const frame = stack.at(-1)!;
      let best: { match: RegExpExecArray; rule: Rule | undefined } | undefined;
      if (stack.length > floor && frame.rule.end !== undefined) {
        const match = exec(frame.rule.end, text, position);
        if (match) best = { match, rule: undefined };
      }
      for (const rule of frame.patterns) {
        const match = exec((rule.match ?? rule.begin)!, text, position);
        if (match && (best === undefined || match.index < best.match.index)) {
          best = { match, rule };
        }
      }
      if (best === undefined) {
        emit(position, text.length, frame.contentScopes);
        return;
      }
      const { match, rule } = best;
      const end = match.index + match[0].length;
      if (rule !== undefined && match[0].length === 0) {
        // A pattern that matches nothing would match again at the same place.
        emit(position, Math.min(position + 1, text.length), frame.contentScopes);
        if (position >= text.length) return;
        position += 1;
        continue;
      }
      emit(position, match.index, frame.contentScopes);
      if (rule === undefined) {
        captures(line, text, match, frame.rule.endCaptures, frame.scopes, out);
        stack.pop();
      } else {
        const scopes = rule.name ? [...frame.contentScopes, rule.name] : frame.contentScopes;
        if (rule.match !== undefined) {
          captures(line, text, match, rule.captures, scopes, out);
        } else {
          captures(line, text, match, rule.beginCaptures ?? rule.captures, scopes, out);
          stack.push({
            rule,
            scopes,
            contentScopes: rule.contentName ? [...scopes, rule.contentName] : scopes,
            patterns: resolve(rule.patterns ?? []),
          });
        }
      }
      position = end;
    }
  }

  function captures(
    line: number,
    text: string,
    match: RegExpExecArray,
    rules: Readonly<Record<string, Capture>> | undefined,
    scopes: readonly string[],
    out: Token[],
  ): void {
    const indices = match.indices!;
    const groups = Object.entries(rules ?? {})
      .map(([group, capture]) => ({ range: indices[Number(group)], capture, group }))
      .filter((entry) => entry.range !== undefined && entry.group !== "0")
      .sort((a, b) => a.range![0] - b.range![0]);
    const whole = rules?.["0"];
    const base = whole?.name ? [...scopes, whole.name] : scopes;
    let position = match.index;
    const emit = (start: number, end: number, tokenScopes: readonly string[]) => {
      if (end > start) out.push({ line, start, text: text.slice(start, end), scopes: tokenScopes });
    };
    for (const { range, capture } of groups) {
      const [start, end] = range!;
      if (start < position) continue;
      emit(position, start, base);
      const captured = capture.name ? [...base, capture.name] : base;
      if (capture.patterns) {
        const local: Frame[] = [
          {
            rule: {},
            scopes: captured,
            contentScopes: captured,
            patterns: resolve(capture.patterns),
          },
        ];
        tokenizeRange(line, text.slice(0, end), start, local, out, 1);
      } else {
        emit(start, end, captured);
      }
      position = end;
    }
    emit(position, match.index + match[0].length, base);
  }

  return {
    /** The tokens of every line of `source`, the begin/end rules carried from line to line. */
    tokenize(source: string): Token[] {
      const stack: Frame[] = [
        {
          rule: {},
          scopes: [grammar.scopeName],
          contentScopes: [grammar.scopeName],
          patterns: resolve(grammar.patterns),
        },
      ];
      const out: Token[] = [];
      source.split("\n").forEach((text, line) => tokenizeRange(line, text, 0, stack, out, 1));
      return out;
    },
  };
}
