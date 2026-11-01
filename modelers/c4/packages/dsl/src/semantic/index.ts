import type { Diagnostic, Workspace } from "@miragon/c4-schema-model";
import { MESSAGES } from "../syntax/diagnostics.js";
import type { Cst } from "../types.js";
import { finalChecks } from "./checks.js";
import { finish } from "./finish.js";
import { sourceIndex, type SemanticSources } from "./sources.js";
import { Build } from "./state.js";
import { ROOT } from "./context.js";
import { walk } from "./walk.js";

export type {
  DynamicStep,
  ElementSite,
  GroupSite,
  ReferenceTarget,
  RelationshipSite,
  ResolvedReference,
  SemanticSources,
  StyleSite,
  ViewSite,
  WorkspaceSite,
} from "./sources.js";
export { semanticSources } from "./sources.js";
export type { StatementRole } from "./state.js";
export type {
  PropertiesBlockSite,
  PropertyEntrySite,
  ViewContentStatement,
  ViewTermSite,
} from "./records.js";
export { expressionOperands } from "./views.js";

export interface Semantics {
  readonly workspace: Workspace;
  /** The builder's diagnostics; the syntax tree's come separately. */
  readonly diagnostics: readonly Diagnostic[];
  readonly sources: SemanticSources;
}

function firstLine(text: string): { readonly start: number; readonly end: number } {
  const newline = text.indexOf("\n");
  return { start: 0, end: newline === -1 ? text.length : newline };
}

/**
 * SPEC 3.8 rule 2. A file without any workspace, such as a fragment another file includes, gets
 * one diagnostic, not one per line.
 */
function outsideTheWorkspace(build: Build, cst: Cst): void {
  const text = cst.text;
  if (build.workspaceCount === 0) {
    if (text.trim() === "") return;
    build.report.reject(
      "workspace-count",
      "There is no workspace block. Structurizr reads a file as workspace { … }: put the model and the views into one.",
      firstLine(text),
      () => "workspace",
    );
    return;
  }
  for (const values of build.outside) {
    build.reject(
      values,
      ROOT,
      "statement-outside-workspace",
      "Structurizr reads only “workspace” and the directives !const, !var, !include, !script, !plugin, !impliedRelationships and !identifiers outside the workspace block. Move this line into the workspace.",
    );
  }
  // A line of only control characters or special spaces has no token here, but Structurizr reads
  // it as a statement and fails on it, so outside the workspace it is a token after the block.
  // The syntax tree reports exactly those lines: it reads them as Structurizr does, after the
  // byte order mark a line may start with and with its continuations joined.
  const statements = cst.nodes.filter((node) => node.kind === "statement");
  for (const diagnostic of cst.syntaxDiagnostics) {
    if (diagnostic.message !== MESSAGES.invisibleLine) continue;
    const { start, end } = diagnostic.range;
    if (statements.some((node) => node.range.start <= start && end <= node.range.end)) continue;
    const line = text.slice(start, end);
    build.report.reject(
      "statement-outside-workspace",
      "This line outside the workspace block holds only control characters or special spaces, and Structurizr fails on it. Remove the line.",
      diagnostic.range,
      () => `outside ${JSON.stringify(line)}`,
    );
  }
}

/** The C4 model a syntax tree defines, with the diagnostics of SPEC 3.7 and 3.8 (WP3). */
export function buildSemantics(cst: Cst): Semantics {
  const build = new Build(cst.text);
  walk(build, cst.nodes);
  outsideTheWorkspace(build, cst);
  const finished = finish(build);
  finalChecks(build, finished.workspace, finished.relationships);
  return {
    workspace: finished.workspace,
    diagnostics: build.report.finish(),
    sources: sourceIndex(build, finished.workspace, finished.relationships),
  };
}
