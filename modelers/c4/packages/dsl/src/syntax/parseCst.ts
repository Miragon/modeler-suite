/*
 * The lossless syntax tree (SPEC 3.1). The parse loop of `StructurizrDslParser.parse` decides
 * what each logical line is, in the reference's order: blank, whole-line comment, inline script
 * body, block comment, closing brace, statement. Only that order reproduces the reference's
 * structure on odd input: a whole-line `//` comment that ends in the closing marker keeps a block
 * comment open, and an opening marker inside a block comment nests a second one.
 */
import type { Diagnostic } from "@miragon/c4-schema-model";
import type {
  CloseBrace,
  Cst,
  CstNode,
  RawBlock,
  Statement,
  TextRange,
  Token,
  Trivia,
} from "../types.js";
import {
  isAssignableIdentifier,
  isCommentLine,
  isEmptyLine,
  isInvisibleText,
  javaTrim,
} from "./characters.js";
import {
  incompatibility,
  makeDiagnostic,
  MESSAGES,
  rejection,
  type DiagnosticInput,
} from "./diagnostics.js";
import { BYTE_ORDER_MARK, LineIndex, indentationAt, splitPhysicalLines } from "./lines.js";
import { logicalLines, type LogicalLine, type LogicalLineProblem } from "./logicalLines.js";
import { escapedText, tokenize } from "./tokenizer.js";
import { measureIndentUnit } from "./walk.js";

const INLINE_SCRIPT_LANGUAGES = new Set(["javascript", "groovy", "kotlin", "ruby"]);

const PROBLEM_DIAGNOSTICS: Record<
  Exclude<LogicalLineProblem, "ignored-last-line">,
  (range: TextRange) => DiagnosticInput
> = {
  "unterminated-text-block": (range) =>
    rejection("unterminated-text-block", MESSAGES.unterminatedTextBlock, range),
  "empty-text-block": (range) => incompatibility(MESSAGES.emptyTextBlock, range),
  "marker-without-text-block": (range) => incompatibility(MESSAGES.markerWithoutTextBlock, range),
  "text-block-line-too-short": (range) => incompatibility(MESSAGES.textBlockLineTooShort, range),
};

/**
 * Structurizr drops a last line ending in `\`. Only a dropped `}` makes it fail, as its block then
 * stays open; any other dropped line it reads differently without failing.
 */
function ignoredLastLine(range: TextRange, closedBlock: boolean): DiagnosticInput {
  return closedBlock
    ? incompatibility(MESSAGES.ignoredClosingLine, range)
    : incompatibility(MESSAGES.ignoredLastLine, range, undefined, "warning");
}

interface OpenBlock {
  readonly line: LogicalLine;
  readonly assignee: Token | undefined;
  readonly tokens: readonly Token[];
  readonly head: TextRange;
  readonly open: TextRange;
  readonly trailingComment: TextRange | undefined;
  readonly children: CstNode[];
}

interface StatementShape {
  readonly assignee: Token | undefined;
  readonly tokens: readonly Token[];
  readonly head: TextRange;
  readonly open: TextRange | undefined;
  readonly trailingComment: TextRange | undefined;
}

function rangeOf(line: LogicalLine): TextRange {
  return { start: line.start, end: line.end };
}

function isInvisibleLine(token: Token): boolean {
  return !token.quoted && !token.textBlock && isInvisibleText(token.raw);
}

function startsComment(token: Token): boolean {
  const text = escapedText(token);
  return !token.quoted && (text.startsWith("//") || text.startsWith("/*"));
}

/** Splits a statement line into assignee, keyword and arguments, trailing comment and `{`. */
function shapeOf(tokens: readonly Token[], assignment: boolean): StatementShape {
  const assignee = assignment ? tokens[0] : undefined;
  let rest = assignment ? tokens.slice(2) : tokens;
  const commentAt = rest.findIndex((token, index) => index >= 1 && startsComment(token));
  let trailingComment: TextRange | undefined;
  if (commentAt !== -1) {
    const first = rest[commentAt];
    const last = rest[rest.length - 1];
    trailingComment = { start: first?.range.start ?? 0, end: last?.range.end ?? 0 };
    rest = rest.slice(0, commentAt);
  }
  const last = rest[rest.length - 1];
  const opens = last !== undefined && last.value === "{";
  const own = opens ? rest.slice(0, -1) : rest;
  const first = assignee ?? rest[0];
  const headEnd = opens ? last.range.end : (own[own.length - 1] ?? first)?.range.end;
  return {
    assignee,
    tokens: own,
    head: { start: first?.range.start ?? 0, end: headEnd ?? 0 },
    open: opens ? last.range : undefined,
    trailingComment,
  };
}

class CstBuilder {
  readonly root: CstNode[] = [];
  readonly diagnostics: DiagnosticInput[] = [];
  private readonly blocks: OpenBlock[] = [];
  private commentDepth = 0;
  private commentStart: LogicalLine | undefined;
  private script: LogicalLine | undefined;
  private lastEnd = 0;
  private closedBlocks = 0;

  constructor(private readonly text: string) {}

  private get siblings(): CstNode[] {
    return this.blocks[this.blocks.length - 1]?.children ?? this.root;
  }

  private trivia(kind: Trivia["kind"], range: TextRange): void {
    this.siblings.push({ kind, range });
  }

  accept(line: LogicalLine): void {
    this.lastEnd = line.end;
    let ignored: TextRange | undefined;
    for (const { problem, range } of line.problems) {
      if (problem === "ignored-last-line") {
        ignored = range;
      } else {
        this.diagnostics.push(PROBLEM_DIAGNOSTICS[problem](range));
      }
    }
    const closedBefore = this.closedBlocks;
    this.classify(line);
    if (ignored) {
      this.diagnostics.push(ignoredLastLine(ignored, this.closedBlocks > closedBefore));
    }
  }

  private classify(line: LogicalLine): void {
    const { chars } = line;
    if (this.script) {
      if (!isEmptyLine(chars) && !isCommentLine(chars) && javaTrim(chars) === "}") {
        this.siblings.push({
          kind: "raw",
          directive: "!script",
          range: { start: this.script.start, end: line.end },
        });
        this.script = undefined;
        this.closedBlocks += 1;
      }
      return;
    }
    if (isEmptyLine(chars) || isCommentLine(chars)) {
      if (this.commentDepth === 0) {
        this.trivia(isEmptyLine(chars) ? "blank" : "lineComment", rangeOf(line));
      }
      return;
    }
    const tokens = tokenize(this.text, line);
    if (tokens.length === 0) {
      this.diagnostics.push(incompatibility(MESSAGES.invisibleLine, rangeOf(line)));
      if (this.commentDepth === 0) {
        this.trivia("blank", rangeOf(line));
      }
      return;
    }
    this.acceptTokens(line, tokens);
  }

  private acceptTokens(line: LogicalLine, tokens: readonly Token[]): void {
    const assignment = tokens.length >= 3 && tokens[1]?.value === "=";
    const keyword = (assignment ? tokens[2] : tokens[0]) as Token;
    const trimmed = javaTrim(line.chars);
    const becomesStatement = this.acceptStructure(line, tokens, assignment, keyword, trimmed);
    const assignee = tokens[0];
    if (assignment && !becomesStatement && assignee && !isAssignableIdentifier(assignee.value)) {
      this.diagnostics.push(
        incompatibility(MESSAGES.invalidIdentifier(assignee.value), assignee.range, rangeOf(line)),
      );
    }
  }

  /** Returns whether the line became a statement, whose assignee the semantic builder checks. */
  private acceptStructure(
    line: LogicalLine,
    tokens: readonly Token[],
    assignment: boolean,
    keyword: Token,
    trimmed: string,
  ): boolean {
    if (trimmed.startsWith("/*") && trimmed.endsWith("*/")) {
      if (this.commentDepth === 0) {
        this.trivia("blockComment", rangeOf(line));
      }
    } else if (keyword.value.startsWith("/*")) {
      if (this.commentDepth === 0) {
        this.commentStart = line;
      }
      this.commentDepth += 1;
    } else if (this.commentDepth > 0) {
      if (trimmed.endsWith("*/")) {
        this.commentDepth -= 1;
        if (this.commentDepth === 0) {
          this.trivia("blockComment", {
            start: this.commentStart?.start ?? line.start,
            end: line.end,
          });
          this.commentStart = undefined;
        }
      }
    } else if (keyword.value === "}") {
      return this.close(line, tokens, assignment, keyword);
    } else if (tokens.length === 1 && isInvisibleLine(keyword)) {
      // No statement takes a lone token of no-break or zero-width spaces, so Structurizr fails
      // on it in every block; read as a statement, it would only be an unknown keyword's warning.
      this.diagnostics.push(incompatibility(MESSAGES.invisibleLine, rangeOf(line)));
      this.trivia("blank", rangeOf(line));
    } else {
      return this.statement(line, shapeOf(tokens, assignment));
    }
    return false;
  }

  /** `!script <language> {`; a `!plugin` block reads every line as a parameter, this one too. */
  private isInlineScript(shape: StatementShape): boolean {
    const innermost = this.blocks[this.blocks.length - 1];
    const insidePlugin = innermost?.tokens[0]?.value.toLowerCase() === "!plugin";
    const [directive, language] = shape.tokens;
    return (
      !insidePlugin &&
      shape.open !== undefined &&
      directive?.value.toLowerCase() === "!script" &&
      INLINE_SCRIPT_LANGUAGES.has(language?.value.toLowerCase() ?? "")
    );
  }

  /** Returns whether the line became a statement node, not an inline script. */
  private statement(line: LogicalLine, shape: StatementShape): boolean {
    if (shape.trailingComment) {
      this.diagnostics.push(
        incompatibility(MESSAGES.trailingComment, shape.trailingComment, rangeOf(line)),
      );
    }
    if (this.isInlineScript(shape)) {
      this.script = line;
      return false;
    }
    if (shape.open) {
      this.blocks.push({ ...shape, open: shape.open, line, children: [] });
    } else {
      this.siblings.push(this.oneLiner(line, shape));
    }
    return true;
  }

  private oneLiner(line: LogicalLine, shape: StatementShape): Statement {
    return {
      kind: "statement",
      range: rangeOf(line),
      head: shape.head,
      indent: indentationAt(this.text, line.start),
      assignee: shape.assignee,
      tokens: shape.tokens,
      continued: line.continued,
      endsInTextBlock: line.placeholder !== -1,
      trailingComment: shape.trailingComment,
      block: undefined,
    };
  }

  private close(
    line: LogicalLine,
    tokens: readonly Token[],
    assignment: boolean,
    brace: Token,
  ): boolean {
    const block = this.blocks.pop();
    if (!block) {
      this.diagnostics.push(
        rejection("unexpected-close", MESSAGES.unexpectedClose, brace.range, rangeOf(line)),
      );
      this.siblings.push(this.oneLiner(line, shapeOf(tokens, assignment)));
      return true;
    }
    this.finishBlock(block, {
      range: rangeOf(line),
      indent: indentationAt(this.text, line.start),
      trailing: this.text.slice(brace.range.end, line.end),
    });
    this.closedBlocks += 1;
    return false;
  }

  private finishBlock(block: OpenBlock, close: CloseBrace): void {
    const lastChild = block.children[block.children.length - 1];
    const end =
      close.range.end > close.range.start
        ? close.range.end
        : (lastChild?.range.end ?? block.line.end);
    const statement: Statement = {
      kind: "statement",
      range: { start: block.line.start, end },
      head: block.head,
      indent: indentationAt(this.text, block.line.start),
      assignee: block.assignee,
      tokens: block.tokens,
      continued: block.line.continued,
      endsInTextBlock: block.line.placeholder !== -1,
      trailingComment: block.trailingComment,
      block: { open: block.open, children: block.children, close },
    };
    this.siblings.push(statement);
  }

  finish(): void {
    const end = this.lastEnd;
    if (this.script) {
      const script = this.script;
      this.diagnostics.push(rejection("unclosed-block", MESSAGES.unclosedBlock, rangeOf(script)));
      this.siblings.push({
        kind: "raw",
        directive: "!script",
        range: { start: script.start, end },
      } satisfies RawBlock);
      this.script = undefined;
    }
    if (this.commentDepth > 0 && this.commentStart) {
      this.diagnostics.push(
        rejection("unterminated-comment", MESSAGES.unterminatedComment, rangeOf(this.commentStart)),
      );
      this.trivia("blockComment", { start: this.commentStart.start, end });
      this.commentDepth = 0;
    }
    for (let block = this.blocks.pop(); block !== undefined; block = this.blocks.pop()) {
      this.diagnostics.push(
        rejection("unclosed-block", MESSAGES.unclosedBlock, block.head, rangeOf(block.line)),
      );
      const lastChild = block.children[block.children.length - 1];
      const at = lastChild?.range.end ?? block.line.end;
      this.finishBlock(block, { range: { start: at, end: at }, indent: "", trailing: "" });
    }
  }
}

function majorityLineBreak(text: string): "\n" | "\r\n" {
  let crlf = 0;
  let lf = 0;
  for (
    let newline = text.indexOf("\n");
    newline !== -1;
    newline = text.indexOf("\n", newline + 1)
  ) {
    if (newline > 0 && text.charCodeAt(newline - 1) === 0x0d) {
      crlf += 1;
    } else {
      lf += 1;
    }
  }
  return crlf > lf ? "\r\n" : "\n";
}

function bySourceOrder(left: Diagnostic, right: Diagnostic): number {
  return left.range.start - right.range.start || left.range.end - right.range.end;
}

/** The lossless syntax tree of R-DSL §2 (SPEC 3.1); total, never throws. */
export function parseCst(text: string): Cst {
  const physical = splitPhysicalLines(text);
  const builder = new CstBuilder(text);
  for (const line of logicalLines(text, physical)) {
    builder.accept(line);
  }
  builder.finish();
  const index = new LineIndex(text);
  return {
    text,
    bom: text.startsWith(BYTE_ORDER_MARK),
    lineBreak: majorityLineBreak(text),
    indentUnit: measureIndentUnit(text, builder.root),
    endsWithLineBreak: text.endsWith("\n"),
    nodes: builder.root,
    syntaxDiagnostics: builder.diagnostics
      .map((input) => makeDiagnostic(text, index, input))
      .sort(bySourceOrder),
  };
}
