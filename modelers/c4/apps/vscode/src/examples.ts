// The text arrives through a raw loader: esbuild's `?raw` plugin in the extension's build, Vite's
// in the e2e page and in Vitest. The reference brings its module types to every program that
// compiles this file (the extension, its unit tests and the e2e suite).
/// <reference types="vite/client" />
import { newWorkspaceText, parseCst, type CstNode, type Statement } from "@miragon/c4-dsl";
import exampleText from "../../../example/bookshop.c4?raw";

/** What New Empty C4 Diagram writes: the skeleton the web app's New diagram starts from. */
export const EMPTY_DIAGRAM = newWorkspaceText();

/**
 * What New C4 Diagram from Example writes and "Insert example" of the empty-file hint fills a
 * blank workspace with: the original Bookshop of `example/bookshop.c4`, the file both apps ship,
 * with a view of every editable type and its layout, the C4 colours, and a dynamic view and a
 * deployment environment the file keeps for Structurizr.
 */
export const EXAMPLE_DIAGRAM: string = exampleText;

const SKELETON_SECTIONS: ReadonlySet<string> = new Set(["model", "views", "name", "description"]);
const NAMING: ReadonlySet<string> = new Set(["name", "description"]);
type Section = "model" | "views";

function isTrivia(node: CstNode): boolean {
  return node.kind === "blank" || node.kind === "lineComment" || node.kind === "blockComment";
}

function isComment(node: CstNode): boolean {
  return node.kind === "lineComment" || node.kind === "blockComment";
}

function keyword(statement: Statement): string {
  return statement.tokens[0]?.value.toLowerCase() ?? "";
}

/**
 * A statement as its words and blocks, whatever its indentation and line breaks; a comment in it
 * makes it another statement, so no comment is lost when the example replaces it.
 */
function outline(node: CstNode): string {
  if (node.kind === "blank") return "";
  if (node.kind !== "statement") return `#${node.kind}`;
  const words = JSON.stringify(node.tokens.map((token) => token.value));
  const comment = node.trailingComment === undefined ? "" : "#";
  if (node.block === undefined) return `${words}${comment}`;
  const children = node.block.children.map(outline).filter((child) => child !== "");
  return `${words}${comment}{${children.join(";")}}${node.block.close.trailing}`;
}

function statementNamed(nodes: readonly CstNode[], name: string): Statement | undefined {
  return nodes.find(
    (node): node is Statement => node.kind === "statement" && keyword(node) === name,
  );
}

let newWorkspaceStyles: string | undefined;

/** The `styles` block of the C4 colours New writes, which the example carries as well. */
function isNewWorkspaceStyles(node: CstNode): boolean {
  if (node.kind !== "statement" || keyword(node) !== "styles") return false;
  if (newWorkspaceStyles === undefined) {
    const workspace = statementNamed(parseCst(EMPTY_DIAGRAM).nodes, "workspace");
    const views = statementNamed(workspace?.block?.children ?? [], "views");
    const styles = statementNamed(views?.block?.children ?? [], "styles");
    if (styles === undefined) throw new Error("The new workspace has no styles block.");
    newWorkspaceStyles = outline(styles);
  }
  return outline(node) === newWorkspaceStyles;
}

/** `model { }`, `views { styles }`, `name …`, `description …` and nothing else: what New writes. */
function isEmptySection(node: CstNode): boolean {
  if (node.kind !== "statement") return isTrivia(node);
  const section = keyword(node);
  if (!SKELETON_SECTIONS.has(section)) return false;
  return (
    node.block === undefined ||
    node.block.children.every(
      (child) => isTrivia(child) || (section === "views" && isNewWorkspaceStyles(child)),
    )
  );
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

/** The end of the line `offset` is on, its line break excluded. */
function lineEnd(text: string, offset: number): number {
  const lineFeed = text.indexOf("\n", offset);
  if (lineFeed === -1) return text.length;
  return text[lineFeed - 1] === "\r" ? lineFeed - 1 : lineFeed;
}

/** A node from the start of its first line: its indentation included. */
function nodeText(text: string, node: CstNode): string {
  return text.slice(lineStart(text, node.range.start), node.range.end);
}

/** `from` steps of indentation as `to` steps: the example in the indentation of the file. */
function reindent(line: string, from: string, to: string): string {
  if (from === to || from === "") return line;
  let depth = 0;
  while (line.startsWith(from, depth * from.length)) depth += 1;
  return to.repeat(depth) + line.slice(depth * from.length);
}

interface ExampleParts {
  /** The name and description of the example's header, ` "Bookshop" "…"`. */
  readonly naming: string;
  /** The lines of its workspace block, between the header and the closing brace. */
  readonly lines: readonly string[];
  /** The index in `lines` after the line that opens its model block and its views block. */
  readonly sectionStarts: Readonly<Partial<Record<Section, number>>>;
  readonly indentUnit: string;
}

let exampleParts: ExampleParts | undefined;

function exampleOf(text: string): ExampleParts {
  const cst = parseCst(text);
  const workspace = cst.nodes.find((node): node is Statement => node.kind === "statement");
  if (workspace?.block === undefined) throw new Error("The example has no workspace block.");
  const { tokens, block } = workspace;
  const bodyStart = lineEnd(text, block.open.end) + 1;
  const body = text.slice(bodyStart, lineStart(text, block.close.range.start));
  const sectionStarts: Partial<Record<Section, number>> = {};
  for (const node of block.children) {
    if (node.kind !== "statement" || node.block === undefined) continue;
    const section = keyword(node);
    if (section !== "model" && section !== "views") continue;
    const after = text.slice(bodyStart, lineEnd(text, node.block.open.end));
    sectionStarts[section] = after.split("\n").length;
  }
  return {
    naming: text.slice(tokens[0]?.range.end ?? 0, tokens.at(-1)?.range.end ?? 0),
    lines: body.split("\n").slice(0, -1),
    sectionStarts,
    indentUnit: cst.indentUnit,
  };
}

/**
 * "Insert example" of the empty-file hint (guide §13.5), one edit of the document. A blank file
 * becomes the example; a file of comments gets it below them. A workspace that holds only the
 * skeleton New writes gets the example's model and views, whose styles hold the skeleton's C4
 * colours, and what the file already holds stays (guide §13.5: comments and the title): the
 * comments around and inside the skeleton, and the workspace's name and description, which
 * replace the example's. A workspace with anything else in it (an element, a view, styles of its
 * own, a directive) is left alone (`undefined`), since the example cannot be merged into it.
 */
export function withExampleInserted(current: string): string | undefined {
  if (current.trim() === "") return EXAMPLE_DIAGRAM;
  const cst = parseCst(current);
  if (cst.syntaxDiagnostics.some((diagnostic) => diagnostic.rejects)) return undefined;
  const { lineBreak } = cst;
  const statements = cst.nodes.filter((node) => !isTrivia(node));
  if (statements.length === 0) {
    return `${current.replace(/\s*$/, "")}${lineBreak}${EXAMPLE_DIAGRAM.replace(/\n/g, lineBreak)}`;
  }
  const [workspace] = statements;
  if (
    statements.length !== 1 ||
    workspace?.kind !== "statement" ||
    keyword(workspace) !== "workspace" ||
    workspace.tokens.some((token) => token.value === "extends") ||
    workspace.block === undefined ||
    !workspace.block.children.every(isEmptySection)
  ) {
    return undefined;
  }
  const { block } = workspace;
  const example = (exampleParts ??= exampleOf(EXAMPLE_DIAGRAM));

  const named =
    workspace.tokens.length > 1 ||
    block.children.some((node) => node.kind === "statement" && NAMING.has(keyword(node)));
  const headEnd = lineEnd(current, block.open.end);
  const keywordEnd = workspace.tokens[0]?.range.end ?? headEnd;
  const head = named
    ? current.slice(workspace.range.start, headEnd)
    : `${current.slice(workspace.range.start, keywordEnd)}${example.naming}${current.slice(keywordEnd, headEnd)}`;

  const kept: Record<"workspace" | Section, string[]> = { workspace: [], model: [], views: [] };
  for (const node of block.children) {
    if (isComment(node)) kept.workspace.push(nodeText(current, node));
    if (node.kind !== "statement") continue;
    const section = keyword(node);
    if (NAMING.has(section)) {
      kept.workspace.push(nodeText(current, node));
    } else {
      const comments = (node.block?.children ?? []).filter(isComment);
      kept[section as Section].push(...comments.map((comment) => nodeText(current, comment)));
    }
  }

  const lines = example.lines.map((line) =>
    line === "" ? line : workspace.indent + reindent(line, example.indentUnit, cst.indentUnit),
  );
  for (const section of ["views", "model"] as const) {
    const at = example.sectionStarts[section];
    if (at === undefined) kept.workspace.push(...kept[section]);
    else lines.splice(at, 0, ...kept[section]);
  }
  const close = current.slice(lineStart(current, block.close.range.start), workspace.range.end);
  return (
    [current.slice(0, workspace.range.start) + head, ...kept.workspace, ...lines, close].join(
      lineBreak,
    ) + current.slice(workspace.range.end)
  );
}
