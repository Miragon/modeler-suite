/*
 * The working copy of one edit (SPEC 3.4): every step plans its text edits against the current
 * text and parse, applies them and parses again, so the next step reads the statements the
 * previous one wrote. The outcome's edits are the minimal diff of the original and the final text.
 */
import {
  viewCatalog,
  viewMembers,
  type ElementId,
  type ModelElement,
  type Relationship,
  type ViewCatalog,
  type ViewEntry,
  type ViewKey,
  type ViewMembers,
  type Workspace,
} from "@miragon/c4-schema-model";
import { parseWorkspace } from "../parse.js";
import { semanticSources, type SemanticSources } from "../semantic/index.js";
import type { EditContext, EditNotice, IdChange, ParseResult, TextEdit } from "../types.js";
import { refuse } from "./refusal.js";
import { applyTextEdits } from "./textEdits.js";
import { Intent } from "./verify.js";

export class Draft {
  private current: ParseResult;
  private currentSources: SemanticSources;
  readonly idChanges: IdChange[] = [];
  readonly notices = new Set<EditNotice>();
  readonly fresh: Set<ElementId>;
  readonly created = { elements: [] as ElementId[], relationships: [] as string[] };
  /** The view the outcome names when the operation chooses it (createView). */
  chosenView: ViewKey | undefined;
  /** What the operation means to change, for the frame condition. */
  readonly intent = new Intent();

  constructor(
    readonly original: ParseResult,
    readonly context: EditContext,
  ) {
    this.current = original;
    this.currentSources = sourcesOf(original);
    this.fresh = new Set(context.fresh);
  }

  get parse(): ParseResult {
    return this.current;
  }

  get text(): string {
    return this.current.text;
  }

  get workspace(): Workspace {
    return this.current.workspace;
  }

  get sources(): SemanticSources {
    return this.currentSources;
  }

  get lineBreak(): string {
    return this.current.cst.lineBreak;
  }

  get indentUnit(): string {
    return this.current.cst.indentUnit;
  }

  /** Applies edits against the current text and parses the result. */
  apply(edits: readonly TextEdit[]): void {
    const meaningful = edits.filter((edit) => edit.start !== edit.end || edit.insert !== "");
    if (meaningful.length === 0) return;
    this.replaceText(applyTextEdits(this.current.text, meaningful));
  }

  replaceText(text: string): void {
    if (text === this.current.text) return;
    this.current = parseWorkspace(text);
    this.currentSources = sourcesOf(this.current);
  }

  catalog(): ViewCatalog {
    return viewCatalog(this.current.workspace);
  }

  element(id: ElementId): ModelElement | undefined {
    return this.current.workspace.elements.find((element) => element.id === id);
  }

  requireElement(id: ElementId): ModelElement {
    return this.element(id) ?? refuse("not-allowed", `There is no element ${id} in the model.`);
  }

  relationship(key: string): Relationship | undefined {
    return this.current.workspace.relationships.find(
      (relationship) => relationship.canvasKey === key || relationship.key === key,
    );
  }

  view(key: ViewKey): ViewEntry | undefined {
    return this.catalog().resolve(key);
  }

  members(key: ViewKey): ViewMembers | undefined {
    const entry = this.view(key);
    return entry && viewMembers(this.current.workspace, entry);
  }

  rename(change: IdChange): void {
    this.idChanges.push(change);
  }

  /** The canvas key a relationship of the original text has now, after the renames so far. */
  relationshipKeyNow(original: string): string {
    let current = original;
    for (const change of this.idChanges) {
      if (change.kind === "relationship" && change.from === current) current = change.to;
    }
    return current;
  }

  /** A written view the operation writes into: the frame condition lets it differ. */
  touch(key: ViewKey): void {
    this.intent.touchedViews.add(key);
  }
}

function sourcesOf(parse: ParseResult): SemanticSources {
  const sources = semanticSources(parse.sources);
  if (sources === undefined) throw new Error("a parse of another reader has no source index");
  return sources;
}

/** A parse of this package for `document`: a parse from elsewhere (a test's fake) is read again. */
export function ownParse(document: ParseResult): ParseResult {
  return semanticSources(document.sources) === undefined ? parseWorkspace(document.text) : document;
}
