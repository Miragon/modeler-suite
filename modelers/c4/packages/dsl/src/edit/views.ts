/*
 * The view side of the edit layer: the skeleton blocks, materializing implicit views and drafts
 * (SPEC 4.2), generated keys written into keyless heads, pinning (3.6), the layout properties
 * (3.5 rule 8), include and exclude (rule 6), titles and descriptions (rule 7), and the view
 * operations of 4.6.
 */
import {
  defaultSize,
  deriveIdentifier,
  elementLayoutKey,
  encodeElementLayout,
  relationshipLayoutKey,
  resolveElementStyle,
  viewCatalog,
  viewMembers,
  type Box,
  type ElementId,
  type StaticViewType,
  type ViewEntry,
  type ViewKey,
} from "@miragon/c4-schema-model";
import { parseWorkspace } from "../parse.js";
import type { ViewSite } from "../semantic/index.js";
import type { ParseResult, Statement, TextEdit } from "../types.js";
import type { Draft } from "./draft.js";
import { ensureIdentifiers, identifierRegister } from "./identifiers.js";
import {
  addChildren,
  appendAfterToken,
  block,
  canOpenInPlace,
  codeChildren,
  insertAfter,
  insertFirstChild,
  insertLastChild,
  lineStart,
  oneLine,
  removals,
  removeToken,
  removeTokens,
  render,
  replaceToken,
  statementChildren,
  type Written,
} from "./place.js";
import { refuse } from "./refusal.js";
import { newWorkspaceText, viewStatement } from "./skeleton.js";
import { applyTextEdits } from "./textEdits.js";
import { propertyLine, quote, textBlock } from "./write.js";

const ELEMENT_LAYOUT_PREFIX = "c4modeler.element.";
const MODELER_PREFIX = "c4modeler.";
const STATIC_TYPES: ReadonlySet<string> = new Set([
  "systemLandscape",
  "systemContext",
  "container",
  "component",
]);

/**
 * The workspace block; whitespace-only text becomes the new-workspace skeleton first (SPEC 3.5
 * rule 5), whose C4 colours are styles the edit adds.
 */
export function ensureWorkspace(draft: Draft): Statement {
  if (draft.text.trim() === "") {
    draft.intent.stylesMayChange = true;
    draft.replaceText(newWorkspaceText());
  }
  const statement = draft.sources.workspace().statement;
  if (statement === undefined) refuse("not-allowed", "There is no workspace block to write into.");
  if (statement.block === undefined) {
    if (!canOpenInPlace(statement)) refuse("not-allowed", "The workspace line can't be opened.");
    draft.apply([
      {
        start: statement.head.end,
        end: statement.range.end,
        insert: ` {${draft.lineBreak}${statement.indent}}`,
      },
    ]);
  }
  return draft.sources.workspace().statement as Statement;
}

/**
 * An `!include` in the workspace block may bring the model or the views block, and Structurizr
 * refuses a second one, so the modeler doesn't add its own next to an included file.
 */
function refuseWhenIncluded(draft: Draft, workspace: Statement, keyword: "model" | "views"): void {
  const included = statementChildren(workspace).some(
    (child) => draft.sources.roleOf(child) === "includeFile",
  );
  if (!included) return;
  refuse(
    "not-allowed",
    `The ${keyword} may come from a file the workspace includes, which the modeler doesn't read. Add this in the text instead.`,
  );
}

/** The `model` block, created after the workspace's leading statements when missing. */
export function ensureModel(draft: Draft): Statement {
  const workspace = ensureWorkspace(draft);
  const existing = draft.sources.modelBlock();
  if (existing?.block) return existing;
  if (existing) refuse("not-allowed", "The model line has no block to write into.");
  refuseWhenIncluded(draft, workspace, "model");
  const views = draft.sources.viewsBlock();
  const children = codeChildren(workspace);
  const model = block("model", []);
  if (views !== undefined) {
    const before = children[children.indexOf(views) - 1];
    draft.apply([
      before === undefined
        ? insertFirstChild(draft, workspace, [model])
        : insertAfter(draft, before, [model]),
    ]);
  } else {
    draft.apply([insertLastChild(draft, workspace, [model])]);
  }
  return draft.sources.modelBlock() as Statement;
}

/** The `views` block, created after the model block (one blank line before it) when missing. */
export function ensureViews(draft: Draft): Statement {
  const written = draft.sources.viewsBlock();
  if (written?.block) return written;
  const model = ensureModel(draft);
  const existing = draft.sources.viewsBlock();
  if (existing?.block) return existing;
  if (existing) refuse("not-allowed", "The views line has no block to write into.");
  refuseWhenIncluded(draft, ensureWorkspace(draft), "views");
  const text = render(block("views", []), model.indent, draft.indentUnit, draft.lineBreak);
  draft.apply([
    {
      start: model.range.end,
      end: model.range.end,
      insert: `${draft.lineBreak}${draft.lineBreak}${text}`,
    },
  ]);
  return draft.sources.viewsBlock() as Statement;
}

export interface ViewToWrite {
  readonly type: StaticViewType;
  readonly scopeId: ElementId | undefined;
  readonly key: ViewKey;
  readonly title?: string;
}

/** View statements (SPEC 3.5 rule 5): after the last view of the type, else the last static view, else first. */
export function writeViews(draft: Draft, views: readonly ViewToWrite[]): void {
  if (views.length === 0) return;
  ensureIdentifiers(
    draft,
    views.flatMap((view) => (view.scopeId === undefined ? [] : [view.scopeId])),
  );
  const statementOf = (view: ViewToWrite) =>
    viewStatement(view.type, view.scopeId, view.key, view.title);
  const viewsBlock = ensureViews(draft);
  if (draft.workspace.views.length === 0) {
    draft.apply([insertFirstChild(draft, viewsBlock, views.map(statementOf))]);
    return;
  }
  for (const view of views) {
    const written = draft.workspace.views;
    const statementFor = (key: ViewKey) => draft.sources.viewSite(key)?.statement;
    const sameType = written.filter((definition) => definition.type === view.type).at(-1);
    const anyStatic = written.filter((definition) => STATIC_TYPES.has(definition.type)).at(-1);
    const anchor = statementFor(sameType?.key ?? anyStatic?.key ?? "");
    const container = draft.sources.viewsBlock() as Statement;
    draft.apply([
      anchor === undefined || draft.sources.parentOf(anchor) !== container
        ? insertFirstChild(draft, container, [statementOf(view)])
        : insertAfter(draft, anchor, [statementOf(view)]),
    ]);
  }
}

/**
 * Writes the view when it is implicit or a draft (SPEC 4.2): the first view written into a
 * workspace without views brings every implicit view of the parse before the edit along.
 */
export function materialize(draft: Draft, key: ViewKey): void {
  const entry = draft.view(key);
  if (entry === undefined) refuse("view-not-editable", "This view isn't in the file.");
  if (entry.state === "written") return;
  if (!entry.editable) refuse("view-not-editable", "This view can't be edited on the canvas.");
  const implicit = draft
    .catalog()
    .list()
    .filter((view) => view.state === "implicit");
  const targets: ViewEntry[] =
    entry.state === "implicit"
      ? implicit
      : draft.workspace.views.length === 0
        ? [...implicit, entry]
        : [entry];
  writeViews(
    draft,
    targets.map((target) => ({
      type: target.type as StaticViewType,
      scopeId: target.scopeId,
      key: target.key,
    })),
  );
}

/** `systemContext s {` becomes `systemContext s "SystemContext-001" {`: the key it already has (SPEC 3.4 step 1). */
export function writeGeneratedKey(draft: Draft, key: ViewKey): void {
  const site = draft.sources.viewSite(key);
  if (site === undefined || !site.keyGenerated) return;
  // A keyless head ends where its key would go: after the scope, a deployment view's
  // environment, a filtered view's tags.
  const anchor = site.statement.tokens.at(-1);
  if (anchor === undefined) return;
  draft.apply([appendAfterToken(anchor, quote(key))]);
}

/** The view written, keyed and editable: what every operation that writes into a view first does. */
export function prepareView(draft: Draft, key: ViewKey): ViewSite {
  const entry = draft.view(key);
  if (entry === undefined) refuse("view-not-editable", "This view isn't in the file.");
  if (!entry.editable) {
    refuse("view-not-editable", "This view can't be edited on the canvas. Edit it in the text.");
  }
  materialize(draft, key);
  writeGeneratedKey(draft, key);
  const site = draft.sources.viewSite(key);
  if (site === undefined) refuse("verification-failed", "The view could not be written.");
  return site;
}

function roundHalfAway(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded;
}

/** `x,y`, or `x,y,w,h` when the size is not the default of the element's resolved shape (SPEC 3.6). */
export function encodeBox(draft: Draft, id: ElementId, box: Box): string {
  const element = draft.element(id);
  if (element === undefined) return encodeElementLayout({ x: box.x, y: box.y });
  const style = resolveElementStyle(element, draft.workspace.styles);
  const shapeSize = defaultSize(style.shape);
  const width = roundHalfAway(style.width ?? shapeSize.width);
  const height = roundHalfAway(style.height ?? shapeSize.height);
  const sameSize = roundHalfAway(box.width) === width && roundHalfAway(box.height) === height;
  return encodeElementLayout(
    sameSize
      ? { x: box.x, y: box.y }
      : { x: box.x, y: box.y, width: box.width, height: box.height },
  );
}

export function isPinned(draft: Draft, key: ViewKey): boolean {
  const definition = draft.workspace.views.find((view) => view.key === key);
  return Object.keys(definition?.properties ?? {}).some((name) =>
    name.startsWith(ELEMENT_LAYOUT_PREFIX),
  );
}

/**
 * The first edit that changes a view's geometry or graph first writes the box of every element
 * the user sees there, so nothing jumps afterwards (SPEC 3.6). In a view pinned already, every
 * later such edit writes the box of each element still without one (added in the text, or
 * placed by `placeUnplaced`): its place depends on the graph, so the next relationship would move
 * it.
 */
export function pin(
  draft: Draft,
  key: ViewKey,
  leaveOut: ReadonlySet<ElementId> = new Set(),
): void {
  if (draft.sources.viewSite(key) === undefined) return;
  const stored = isPinned(draft, key)
    ? (draft.workspace.views.find((view) => view.key === key)?.properties ?? {})
    : {};
  const members = draft.members(key);
  const ids = (members?.elements ?? []).filter(
    (id) =>
      draft.context.boxes.has(id) &&
      !leaveOut.has(id) &&
      stored[elementLayoutKey(id)] === undefined,
  );
  if (ids.length === 0) return;
  ensureIdentifiers(draft, ids);
  const changes = new Map<string, string | null>();
  for (const id of ids) {
    changes.set(elementLayoutKey(id), encodeBox(draft, id, draft.context.boxes.get(id) as Box));
  }
  setViewProperties(draft, key, changes);
}

function insertBefore(draft: Draft, anchor: Statement, statements: readonly Written[]): TextEdit {
  const start = lineStart(draft.text, anchor.range.start);
  const text = statements
    .map((statement) => render(statement, anchor.indent, draft.indentUnit, draft.lineBreak))
    .join(draft.lineBreak);
  return { start, end: start, insert: `${text}${draft.lineBreak}` };
}

/** Nothing but `c4modeler.*` entries and blank lines: a comment or another key keeps the block. */
function onlyModelerKeys(block: ViewSite["propertiesBlocks"][number]): boolean {
  const children = (block.statement.block?.children ?? []).filter(
    (child) => child.kind !== "blank",
  );
  return (
    children.length === block.entries.length &&
    block.entries.every((entry) => entry.key.startsWith(MODELER_PREFIX))
  );
}

/**
 * Sets (a value) or removes (`null`) properties of a view (SPEC 3.5 rule 8): in its last
 * `properties` block, `c4modeler.*` keys in ascending order, the same key in an earlier block
 * removed, a block that held only our keys and is emptied removed.
 */
export function setViewProperties(
  draft: Draft,
  key: ViewKey,
  changes: ReadonlyMap<string, string | null>,
): void {
  if (changes.size === 0) return;
  let site = draft.sources.viewSite(key);
  if (site === undefined) refuse("verification-failed", "The view isn't written.");
  draft.touch(key);
  const blocks = site.propertiesBlocks;
  const last = blocks.at(-1);
  const gone: Statement[] = [];
  const edits: TextEdit[] = [];
  const inserts = new Map<string, string>();
  for (const earlier of blocks.slice(0, -1)) {
    for (const entry of earlier.entries) if (changes.has(entry.key)) gone.push(entry.statement);
  }
  const seen = new Set<string>();
  const lastEntries = last?.entries ?? [];
  for (let index = lastEntries.length - 1; index >= 0; index -= 1) {
    const entry = lastEntries[index];
    if (entry === undefined || !changes.has(entry.key)) continue;
    const value = changes.get(entry.key);
    if (seen.has(entry.key) || value === null || value === undefined) {
      gone.push(entry.statement);
    } else if (entry.value !== value) {
      const token = entry.statement.tokens[1];
      if (token === undefined) gone.push(entry.statement);
      else edits.push(replaceToken(token, quote(value)));
    }
    seen.add(entry.key);
  }
  for (const [name, value] of changes) {
    if (value !== null && !seen.has(name)) inserts.set(name, value);
  }
  const emptied = blocks.filter((candidate) => {
    if (candidate === last && inserts.size > 0) return false;
    const remaining = statementChildren(candidate.statement).filter(
      (child) => !gone.includes(child),
    );
    return remaining.length === 0 && onlyModelerKeys(candidate);
  });
  draft.apply([
    ...edits,
    ...removals(draft.text, [
      ...gone.filter(
        (statement) => !emptied.some((candidate) => contains(candidate.statement, statement)),
      ),
      ...emptied.map((candidate) => candidate.statement),
    ]),
  ]);
  if (inserts.size === 0) return;
  site = draft.sources.viewSite(key) as ViewSite;
  const sorted = [...inserts].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const target = site.propertiesBlocks.at(-1);
  if (target === undefined) {
    const properties = block(
      "properties",
      sorted.map(([name, value]) => oneLine(propertyLine(name, value))),
    );
    const edit = addChildren(draft, site.statement, [properties], "last");
    if (edit === undefined) refuse("not-allowed", "This view's line can't be opened.");
    draft.apply([edit]);
    return;
  }
  const ours = target.entries.filter((entry) => entry.key.startsWith(MODELER_PREFIX));
  const groups = new Map<Statement | "end", [string, string][]>();
  for (const pair of sorted) {
    const next = ours.find((entry) => entry.key > pair[0]);
    const anchor = next?.statement ?? "end";
    groups.set(anchor, [...(groups.get(anchor) ?? []), pair]);
  }
  const insertEdits: TextEdit[] = [];
  for (const [anchor, pairs] of groups) {
    const lines = pairs.map(([name, value]) => oneLine(propertyLine(name, value)));
    if (anchor !== "end") {
      insertEdits.push(insertBefore(draft, anchor, lines));
      continue;
    }
    const after = ours.at(-1)?.statement;
    insertEdits.push(
      after === undefined
        ? insertLastChild(draft, target.statement, lines)
        : insertAfter(draft, after, lines),
    );
  }
  draft.apply(insertEdits);
}

/** The written view whose block holds a statement. */
export function viewKeyOf(draft: Draft, statement: Statement): ViewKey | undefined {
  for (
    let node: Statement | undefined = statement;
    node !== undefined;
    node = draft.sources.parentOf(node)
  ) {
    if (draft.sources.roleOf(node) !== "view") continue;
    return draft.workspace.views.find(
      (view) => draft.sources.viewSite(view.key)?.statement === node,
    )?.key;
  }
  return undefined;
}

function contains(outer: Statement, inner: Statement): boolean {
  return inner.range.start >= outer.range.start && inner.range.end <= outer.range.end;
}

/** Removes every `c4modeler.*` key of a view ("Lay out automatically", SPEC 4.4). */
export function clearLayout(draft: Draft, key: ViewKey): void {
  const site = draft.sources.viewSite(key);
  if (site === undefined) return;
  const names = site.propertiesBlocks.flatMap((properties) =>
    properties.entries
      .filter((entry) => entry.key.startsWith(MODELER_PREFIX))
      .map((entry) => entry.key),
  );
  setViewProperties(draft, key, new Map(names.map((name) => [name, null])));
}

/** The view's include and exclude statements, in order. */
function contentStatements(site: ViewSite): Statement[] {
  return site.contents.map((content) => content.statement);
}

/** A child statement after the view's last include or exclude, else as its first child (rule 6). */
function appendContent(draft: Draft, key: ViewKey, lines: readonly Written[]): void {
  draft.touch(key);
  const site = draft.sources.viewSite(key) as ViewSite;
  const anchor = contentStatements(site).at(-1);
  const edit = addChildren(draft, site.statement, lines, anchor ?? "first");
  if (edit === undefined) refuse("not-allowed", "This view's line can't be opened.");
  draft.apply([edit]);
}

/** Exact identifier terms of the view's include or exclude statements that name `id`. */
function termsNaming(draft: Draft, key: ViewKey, id: ElementId, kind: "include" | "exclude") {
  const site = draft.sources.viewSite(key) as ViewSite;
  const statements = new Set(
    site.contents.filter((content) => content.kind === kind).map((content) => content.statement),
  );
  return draft.sources
    .references(id)
    .filter((reference) => reference.kind === "view-term" && reference.exact)
    .filter((reference) => statements.has(reference.statement));
}

const KEYWORD_TERMS = new Set(["include", "exclude", "animationstep"]);

/** The index of a view statement's first term: after its keyword, or 0 for an animation line. */
export function termStart(statement: Statement): number {
  return KEYWORD_TERMS.has(statement.tokens[0]?.value.toLowerCase() ?? "") ? 1 : 0;
}

/** The edits that remove tokens of statements, a statement whose every term goes as a whole. */
function termRemovals(
  draft: Draft,
  terms: readonly { readonly statement: Statement; readonly token: number }[],
): TextEdit[] {
  const byStatement = new Map<Statement, Set<number>>();
  for (const term of terms) {
    byStatement.set(
      term.statement,
      new Set([...(byStatement.get(term.statement) ?? []), term.token]),
    );
  }
  const whole: Statement[] = [];
  const edits: TextEdit[] = [];
  for (const [statement, tokens] of byStatement) {
    if (tokens.size >= statement.tokens.length - termStart(statement)) whole.push(statement);
    else edits.push(...removeTokens(draft.text, statement, tokens));
  }
  return [...edits, ...removals(draft.text, whole)];
}

function trial(draft: Draft, edits: readonly TextEdit[]): ParseResult {
  return parseWorkspace(applyTextEdits(draft.text, edits));
}

function isMember(parse: ParseResult, key: ViewKey, id: ElementId, relationship = false): boolean {
  const entry = viewCatalog(parse.workspace).resolve(key);
  if (entry === undefined) return false;
  const members = viewMembers(parse.workspace, entry);
  return relationship ? members.relationships.includes(id) : members.elements.includes(id);
}

/** Rule 6 for an element the view should show: a matching `exclude` token goes, else `include <id>`. */
export function includeElement(draft: Draft, key: ViewKey, id: ElementId): void {
  if (isMember(draft.parse, key, id)) return;
  const excludes = termsNaming(draft, key, id, "exclude");
  if (excludes.length > 0) {
    const edits = termRemovals(draft, excludes);
    const result = trial(draft, edits);
    if (isMember(result, key, id)) {
      draft.touch(key);
      draft.apply(edits);
      return;
    }
  }
  ensureIdentifiers(draft, [id]);
  appendContent(draft, key, [oneLine(`include ${id}`)]);
}

/**
 * Animation steps that name an element the view no longer shows: Structurizr refuses a step
 * that adds nothing, so its term goes, and a step or `animation` block left empty goes too.
 */
function dropAnimationTerms(draft: Draft, key: ViewKey, id: ElementId): void {
  const site = draft.sources.viewSite(key);
  if (site === undefined) return;
  const inView = (statement: Statement) => viewKeyOf(draft, statement) === key;
  const terms = draft.sources
    .references(id)
    .filter(
      (reference) =>
        reference.kind === "animation-term" && reference.exact && inView(reference.statement),
    );
  if (terms.length === 0) return;
  const dropped = draft.intent.droppedAnimationTerms.get(key) ?? new Set<ElementId>();
  dropped.add(id);
  draft.intent.droppedAnimationTerms.set(key, dropped);
  const removedSteps = new Set(
    terms
      .map((term) => term.statement)
      .filter(
        (statement) =>
          terms.filter((term) => term.statement === statement).length >=
          statement.tokens.length - termStart(statement),
      ),
  );
  const emptiedBlocks = site.animations.filter((animation) => {
    const lines = statementChildren(animation);
    return (
      animation.block !== undefined &&
      lines.length > 0 &&
      lines.every((line) => removedSteps.has(line))
    );
  });
  const edits =
    emptiedBlocks.length > 0
      ? [
          ...termRemovals(
            draft,
            terms.filter((term) => !emptiedBlocks.some((block) => contains(block, term.statement))),
          ),
          ...removals(draft.text, emptiedBlocks),
        ]
      : termRemovals(draft, terms);
  draft.touch(key);
  draft.apply(edits);
}

/** Rule 6 for an element the view should no longer show: its include token, else `exclude <id>`. */
export function excludeElement(draft: Draft, key: ViewKey, id: ElementId): void {
  excludeMember(draft, key, id);
  if (!isMember(draft.parse, key, id)) dropAnimationTerms(draft, key, id);
}

function excludeMember(draft: Draft, key: ViewKey, id: ElementId): void {
  if (!isMember(draft.parse, key, id)) return;
  const entry = draft.view(key);
  if (entry?.type === "systemContext" && entry.scopeId === id) {
    refuse(
      "not-allowed",
      "A system context view always shows its system. To leave it out, delete the view.",
    );
  }
  const includes = termsNaming(draft, key, id, "include");
  if (includes.length > 0) {
    const edits = termRemovals(draft, includes);
    const result = trial(draft, edits);
    if (!isMember(result, key, id)) {
      draft.touch(key);
      draft.apply(edits);
      return;
    }
  }
  ensureIdentifiers(draft, [id]);
  appendContent(draft, key, [oneLine(`exclude ${id}`)]);
}

/**
 * Names an unnamed relationship (SPEC 3.6): `deriveIdentifier("<src> to <dst>")` written before
 * its statement, its layout keys follow in every view, and the canvas key change is reported.
 */
export function nameRelationship(draft: Draft, canvasKey: string): string {
  const relationship = draft.relationship(canvasKey);
  if (relationship === undefined || relationship.implied) {
    refuse("not-allowed", "This relationship can't be named.");
  }
  if (relationship.identifier !== undefined) return relationship.identifier;
  if (relationship.bulk)
    refuse("field-not-editable", "Set by a !relationships statement. Edit the text instead.");
  const site = draft.sources.relationshipSite(canvasKey);
  const first = site?.statement.tokens[0];
  if (site === undefined || first === undefined) {
    refuse("not-allowed", "This relationship can't be named.");
  }
  const identifier = deriveIdentifier(
    `${relationship.sourceId} to ${relationship.destinationId}`,
    "custom",
    identifierRegister(draft),
    "flat",
  );
  const oldKey = relationship.key;
  const unnamedSiblings = () =>
    draft.workspace.relationships
      .filter(
        (other) =>
          !other.implied &&
          other.identifier === undefined &&
          other.sourceId === relationship.sourceId &&
          other.destinationId === relationship.destinationId,
      )
      .map((other) => other.canvasKey);
  const siblingsBefore = unnamedSiblings().filter((key) => key !== canvasKey);
  draft.apply([{ start: first.range.start, end: first.range.start, insert: `${identifier} = ` }]);
  draft.rename({ kind: "relationship", from: canvasKey, to: identifier });
  // The other unnamed ones of an ambiguous pair are renumbered, or lose the `#n` when one is left.
  unnamedSiblings().forEach((key, index) => {
    const before = siblingsBefore[index];
    if (before !== undefined && before !== key)
      draft.rename({ kind: "relationship", from: before, to: key });
  });
  if (oldKey !== undefined)
    renameLayoutKeys(draft, relationshipLayoutKey(oldKey), relationshipLayoutKey(identifier));
  return identifier;
}

/** A layout key renamed in every view that holds it. */
export function renameLayoutKeys(draft: Draft, from: string, to: string): void {
  for (const view of draft.workspace.views) {
    if (view.properties[from] !== undefined)
      renameViewProperties(draft, view.key, new Map([[from, to]]));
  }
}

/**
 * Property keys renamed: the key tokens in place when the `c4modeler.*` lines stay in ascending
 * order and each key sits once in the last block, so a rename stays a one-token diff; otherwise
 * the lines move to their sorted places (rule 8).
 */
export function renameViewProperties(
  draft: Draft,
  key: ViewKey,
  renames: ReadonlyMap<string, string>,
): void {
  const site = draft.sources.viewSite(key);
  const definition = draft.workspace.views.find((view) => view.key === key);
  if (site === undefined || definition === undefined) return;
  const present = [...renames].filter(([from]) => definition.properties[from] !== undefined);
  if (present.length === 0) return;
  const blocks = site.propertiesBlocks;
  const entries = blocks.at(-1)?.entries ?? [];
  const keys = entries.map((entry) => entry.key);
  const renamedKeys = entries
    .filter((entry) => entry.key.startsWith(MODELER_PREFIX))
    .map((entry) => renames.get(entry.key) ?? entry.key);
  const inPlace =
    present.every(([from, to]) => {
      const once = keys.filter((name) => name === from).length === 1;
      const earlier = blocks
        .slice(0, -1)
        .some((block) => block.entries.some((entry) => entry.key === from));
      return once && !earlier && !keys.includes(to);
    }) &&
    renamedKeys.every((name, index) => index === 0 || (renamedKeys[index - 1] as string) < name);
  if (!inPlace) {
    const changes = new Map<string, string | null>();
    for (const [from, to] of present) {
      changes.set(from, null);
      changes.set(to, definition.properties[from] as string);
    }
    setViewProperties(draft, key, changes);
    return;
  }
  draft.touch(key);
  const edits: TextEdit[] = [];
  for (const entry of entries) {
    const to = renames.get(entry.key);
    const token = entry.statement.tokens[0];
    if (to !== undefined && token !== undefined) edits.push(replaceToken(token, quote(to)));
  }
  draft.apply(edits);
}

/** Rule 6 for a relationship: excluded by identifier, by `"<src>-><dst>"`, or named first. */
export function excludeRelationship(draft: Draft, key: ViewKey, canvasKey: string): void {
  if (!isMember(draft.parse, key, canvasKey, true)) return;
  const relationship = draft.relationship(canvasKey);
  if (relationship === undefined) return;
  const members = draft.members(key);
  ensureIdentifiers(draft, [relationship.sourceId, relationship.destinationId]);
  const pairExpression = quote(`${relationship.sourceId}->${relationship.destinationId}`);
  if (relationship.implied) {
    appendContent(draft, key, [oneLine(`exclude ${pairExpression}`)]);
    return;
  }
  if (relationship.identifier !== undefined) {
    appendContent(draft, key, [oneLine(`exclude ${relationship.identifier}`)]);
    return;
  }
  const shown = (members?.relationships ?? []).map((shownKey) => draft.relationship(shownKey));
  const samePair = shown.filter(
    (other) =>
      other !== undefined &&
      other.canvasKey !== canvasKey &&
      other.sourceId === relationship.sourceId &&
      other.destinationId === relationship.destinationId,
  );
  const relatives = shown.filter(
    (other) =>
      other?.implied === true &&
      relationship.key !== undefined &&
      other.impliedBy === relationship.key,
  );
  if (relationship.key !== undefined && samePair.length === 0 && relatives.length === 0) {
    appendContent(draft, key, [oneLine(`exclude ${pairExpression}`)]);
    return;
  }
  const identifier = nameRelationship(draft, canvasKey);
  appendContent(draft, key, [oneLine(`exclude ${identifier}`)]);
}

/** Rule 7: the last title statement, else a new one after the view's last content statement. */
export function setTitle(draft: Draft, key: ViewKey, title: string | null): void {
  draft.touch(key);
  const site = draft.sources.viewSite(key) as ViewSite;
  if (title === null) {
    draft.apply(removals(draft.text, site.titleStatements));
    return;
  }
  const last = site.titleStatements.at(-1);
  if (last !== undefined) {
    writeValueToken(draft, last, 1, title);
    return;
  }
  insertViewChild(draft, site, oneLine(`title ${quote(title)}`));
}

/** Rule 7: the effective source of the description (the last writer), never a new positional token. */
export function setDescription(draft: Draft, key: ViewKey, description: string | null): void {
  draft.touch(key);
  const site = draft.sources.viewSite(key) as ViewSite;
  const positional =
    site.positionalDescriptionToken === undefined
      ? undefined
      : site.statement.tokens[site.positionalDescriptionToken];
  if (description === null) {
    const edits: TextEdit[] = [...removals(draft.text, site.descriptionStatements)];
    if (positional !== undefined) {
      const lastToken = site.statement.tokens.at(-1) === positional;
      edits.push(lastToken ? removeToken(draft.text, positional) : replaceToken(positional, '""'));
    }
    draft.apply(edits);
    return;
  }
  const last = site.descriptionStatements.at(-1);
  if (last !== undefined) {
    writeValueToken(draft, last, 1, description);
    return;
  }
  if (positional !== undefined) {
    writeValueToken(draft, site.statement, site.positionalDescriptionToken as number, description);
    return;
  }
  insertViewChild(draft, site, oneLine(`description ${quote(description)}`));
}

/** A value token rewritten in place, as a text block when it is one. */
export function writeValueToken(
  draft: Draft,
  statement: Statement,
  index: number,
  value: string,
): void {
  const token = statement.tokens[index];
  if (token === undefined) refuse("verification-failed", "The value's token is missing.");
  if (token.value === value && !token.substitutes) return;
  const raw = token.textBlock ? textBlock(draft.text, token, value, draft.lineBreak) : quote(value);
  draft.apply([replaceToken(token, raw)]);
}

/** After the view's last include, exclude, autoLayout, animation or default statement, else first. */
function insertViewChild(draft: Draft, site: ViewSite, line: Written): void {
  const candidates = [
    ...contentStatements(site),
    ...site.autoLayoutStatements,
    ...site.animations,
    ...site.defaultStatements,
    ...site.titleStatements,
    ...site.descriptionStatements,
  ].filter((statement) => draft.sources.parentOf(statement) === site.statement);
  const anchor = candidates.sort((left, right) => left.range.start - right.range.start).at(-1);
  const edit = addChildren(draft, site.statement, [line], anchor ?? "first");
  if (edit === undefined) refuse("not-allowed", "This view's line can't be opened.");
  draft.apply([edit]);
}

/** Layout keys of the elements and relationships among `ids` and `relationships` removed from a view. */
export function removeLayoutKeys(
  draft: Draft,
  key: ViewKey,
  ids: readonly ElementId[],
  relationships: readonly string[],
): void {
  const definition = draft.workspace.views.find((view) => view.key === key);
  if (definition === undefined) return;
  const names = [...ids.map(elementLayoutKey), ...relationships.map(relationshipLayoutKey)].filter(
    (name) => definition.properties[name] !== undefined,
  );
  setViewProperties(draft, key, new Map(names.map((name) => [name, null])));
}
