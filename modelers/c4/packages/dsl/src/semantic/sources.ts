/*
 * The source index (SPEC 3.2, 11.2 WP3): which statements and tokens hold each element,
 * relationship, view and field, so the edit layer writes back exactly there. `SourceIndex` is the
 * frozen part; `SemanticSources` adds what the edit layer of this package reads besides.
 */
import type {
  ElementId,
  FieldName,
  IdentifierMode,
  ModelElement,
  ViewKey,
  Workspace,
} from "@miragon/c4-schema-model";
import type { RawBlock, SourceIndex, Statement } from "../types.js";
import {
  groupIdentifier,
  type PropertiesBlockSite,
  type ReferenceSite,
  type RelationshipRecord,
  type ViewContentStatement,
  type ViewRecord,
} from "./records.js";
import type { FinishedRelationships } from "./relations.js";
import type { Build, StatementRole } from "./state.js";

/** What a reference names, by the ids of the finished model. */
export type ReferenceTarget =
  | { readonly kind: "element"; readonly id: ElementId }
  | { readonly kind: "relationship"; readonly key: string }
  | { readonly kind: "group"; readonly path: string; readonly identifier: string | undefined }
  | { readonly kind: "deployment"; readonly identifier: string | undefined }
  | { readonly kind: "view"; readonly key: ViewKey };

export interface ResolvedReference {
  readonly statement: Statement;
  readonly token: number;
  readonly kind: ReferenceSite["kind"];
  /** The identifier as written; for an expression term, the operand, not the whole token. */
  readonly written: string;
  /** The token is exactly the reference; otherwise an expression term that holds it. */
  readonly exact: boolean;
  /** Set when a hierarchical lookup resolved `written` under this element's id (a relative reference). */
  readonly relativeTo: ElementId | undefined;
  readonly target: ReferenceTarget;
}

export interface ElementSite {
  readonly id: ElementId;
  readonly definition: Statement;
  readonly reopens: readonly Statement[];
  /** The block statement the definition sits in: `model`, a group, a system, a container or a re-open. */
  readonly parentStatement: Statement | undefined;
  /** The innermost `group` block around the definition. */
  readonly groupStatement: Statement | undefined;
  readonly anonymous: boolean;
  readonly mode: IdentifierMode;
}

export interface RelationshipSite {
  readonly key: string | undefined;
  readonly canvasKey: string;
  readonly statement: Statement;
  readonly form: "explicit" | "implicit";
  /** Token indices of the written ends; undefined for the element in scope (`-> x`, `this`). */
  readonly sourceToken: number | undefined;
  readonly destinationToken: number | undefined;
  readonly reopens: readonly Statement[];
  readonly parentStatement: Statement | undefined;
}

export interface ViewSite {
  readonly key: ViewKey;
  readonly statement: Statement;
  readonly keyGenerated: boolean;
  /** The token holding the key; undefined for a keyless view. */
  readonly keyToken: number | undefined;
  readonly scopeToken: number | undefined;
  readonly positionalDescriptionToken: number | undefined;
  readonly positionalTitleToken: number | undefined;
  readonly titleStatements: readonly Statement[];
  readonly descriptionStatements: readonly Statement[];
  readonly defaultStatements: readonly Statement[];
  readonly autoLayoutStatements: readonly Statement[];
  readonly contents: readonly ViewContentStatement[];
  readonly animations: readonly Statement[];
  readonly propertiesBlocks: readonly PropertiesBlockSite[];
}

export interface GroupSite {
  readonly statement: Statement | undefined;
  readonly name: string;
  readonly identifier: string | undefined;
  readonly path: string;
  readonly parentId: ElementId | undefined;
  readonly members: readonly ElementId[];
}

export interface DynamicStep {
  readonly view: ViewKey;
  readonly statement: Statement;
  readonly elements: readonly ElementId[];
  /** The canvas key of the relationship the step names or, written by its ends, shows. */
  readonly relationship: string | undefined;
}

export interface WorkspaceSite {
  readonly statement: Statement | undefined;
  readonly extendsSource: string | undefined;
  readonly nameToken: number | undefined;
  readonly descriptionToken: number | undefined;
  readonly nameStatements: readonly Statement[];
  readonly descriptionStatements: readonly Statement[];
}

export interface StyleSite {
  readonly type: "elementStyle" | "relationshipStyle";
  readonly tag: string;
  readonly scheme: "light" | "dark" | undefined;
  readonly statement: Statement;
}

/** Everything the edit layer of `@miragon/c4-dsl` reads from a parse besides the frozen `SourceIndex`. */
export interface SemanticSources extends SourceIndex {
  /** Every statement in document order; `FieldSource.statement` indexes into it. */
  readonly statements: readonly Statement[];
  statementAt(index: number): Statement | undefined;
  indexOf(statement: Statement): number;
  /** The block statement a statement sits in; undefined at the top level. */
  parentOf(statement: Statement): Statement | undefined;
  roleOf(statement: Statement): StatementRole | undefined;
  workspace(): WorkspaceSite;
  elementSite(id: ElementId): ElementSite | undefined;
  /** By key or canvas key. */
  relationshipSite(key: string): RelationshipSite | undefined;
  viewSite(key: ViewKey): ViewSite | undefined;
  groups(): readonly GroupSite[];
  /** The model's top-level `deploymentEnvironment` statements, in document order. */
  deploymentEnvironments(): readonly Statement[];
  dynamicSteps(): readonly DynamicStep[];
  /** References to an element (frozen in `SourceIndex`), with what each one names and how it is written. */
  references(id: ElementId): readonly ResolvedReference[];
  /** Every resolved reference, in document order. */
  allReferences(): readonly ResolvedReference[];
  /** References to an element, a relationship (key or canvas key) or a view key. */
  referencesTo(target: ReferenceTarget): readonly ResolvedReference[];
  opaque(): readonly { readonly node: Statement | RawBlock; readonly text: string }[];
  styles(): readonly StyleSite[];
  /** Animation steps whose result the builder couldn't check, in document order. */
  uncheckedAnimationSteps(): readonly { readonly view: ViewKey; readonly statement: Statement }[];
}

const indexes = new WeakSet<object>();

/** The sources of a parse of this package; a parse from elsewhere (a test's fake) yields none. */
export function semanticSources(sources: SourceIndex): SemanticSources | undefined {
  return indexes.has(sources) ? (sources as SemanticSources) : undefined;
}

export function sourceIndex(
  build: Build,
  workspace: Workspace,
  finished: FinishedRelationships,
): SemanticSources {
  const elements = new Map(build.elements.map((record) => [record.id, record]));
  const modelElements = new Map(workspace.elements.map((element) => [element.id, element]));
  const views = new Map<ViewKey, ViewRecord>();
  for (const view of build.views) if (!views.has(view.key)) views.set(view.key, view);
  const relationshipKey = (record: RelationshipRecord) => finished.byRecord.get(record);
  const references = build.references.flatMap((site) => resolve(site, relationshipKey));
  const groupStatementOf = (statement: Statement): Statement | undefined => {
    const parent = build.parents.get(statement);
    return parent && build.roles.get(parent) === "group" ? parent : undefined;
  };
  const relationshipRecord = (key: string) =>
    finished.records.get(key) ??
    [...finished.byRecord].find(([, relationship]) => relationship.key === key)?.[0];
  const index: SemanticSources = {
    statements: build.statements,
    statementAt: (position) => build.statements[position],
    indexOf: (statement) => build.indexOf(statement),
    parentOf: (statement) => build.parents.get(statement),
    roleOf: (statement) => build.roles.get(statement),
    element: (id) => {
      const record = elements.get(id);
      return record && { definition: record.definition, reopens: record.reopens };
    },
    field: (id, field: FieldName) => fieldSite(build, modelElements.get(id), field),
    relationship: (key) => relationshipRecord(key)?.statement,
    view: (key) => views.get(key)?.statement,
    modelBlock: () => build.modelStatement,
    viewsBlock: () => build.viewsStatement,
    stylesBlock: () => build.stylesStatement,
    identifierModeAt: (offset) => {
      let mode: IdentifierMode = "flat";
      for (const change of build.modeChanges) if (change.offset <= offset) mode = change.mode;
      return mode;
    },
    references: (id) =>
      references.filter((site) => site.target.kind === "element" && site.target.id === id),
    workspace: () => ({ ...build.workspace }),
    elementSite: (id) => {
      const record = elements.get(id);
      if (record === undefined) return undefined;
      return {
        id,
        definition: record.definition,
        reopens: record.reopens,
        parentStatement: build.parents.get(record.definition),
        groupStatement: groupStatementOf(record.definition),
        anonymous: record.anonymous,
        mode: record.mode,
      };
    },
    relationshipSite: (key) => {
      const record = relationshipRecord(key);
      const relationship = record && finished.byRecord.get(record);
      if (record === undefined || relationship === undefined) return undefined;
      return {
        key: relationship.key,
        canvasKey: relationship.canvasKey,
        statement: record.statement,
        form: record.form,
        sourceToken: record.sourceToken,
        destinationToken: record.destinationToken,
        reopens: record.reopens,
        parentStatement: build.parents.get(record.statement),
      };
    },
    viewSite: (key) => {
      const view = views.get(key);
      return view && viewSite(view);
    },
    groups: () =>
      build.groups.map((group) => ({
        statement: group.statement,
        name: group.name,
        identifier: groupIdentifier(group),
        path: group.path,
        parentId: group.parent?.id,
        members: group.members.map((member) => member.id),
      })),
    deploymentEnvironments: () => build.deploymentEnvironments,
    dynamicSteps: () =>
      build.dynamicSteps.map((step) => ({
        view: step.view.key,
        statement: step.statement,
        elements: step.elements.map((element) => element.id),
        relationship:
          (step.relationship && finished.byRecord.get(step.relationship)?.canvasKey) ??
          step.resolved?.canvasKey,
      })),
    allReferences: () => references,
    referencesTo: (target) => references.filter((site) => sameTarget(site.target, target)),
    opaque: () => build.opaque,
    styles: () =>
      build.styles.map(({ type, tag, scheme, statement }) => ({ type, tag, scheme, statement })),
    uncheckedAnimationSteps: () =>
      build.uncheckedSteps.map(({ view, statement }) => ({ view: view.key, statement })),
  };
  indexes.add(index);
  return index;
}

function fieldSite(
  build: Build,
  element: ModelElement | undefined,
  field: FieldName,
): { readonly statement: Statement; readonly token: number | undefined } | undefined {
  const source = element?.fields[field];
  const statement = source === undefined ? undefined : build.statements[source.statement];
  return statement && source ? { statement, token: source.token } : undefined;
}

function viewSite(view: ViewRecord): ViewSite {
  return {
    key: view.key,
    statement: view.statement,
    keyGenerated: view.keyGenerated,
    keyToken: view.keyToken,
    scopeToken: view.scopeToken,
    positionalDescriptionToken: view.positionalDescriptionToken,
    positionalTitleToken: view.positionalTitleToken,
    titleStatements: view.titleStatements,
    descriptionStatements: view.descriptionStatements,
    defaultStatements: view.defaultStatements,
    autoLayoutStatements: view.autoLayoutStatements,
    contents: view.contents,
    animations: view.animations,
    propertiesBlocks: view.propertiesBlocks,
  };
}

function resolve(
  site: ReferenceSite,
  relationshipKey: (
    record: RelationshipRecord,
  ) => { readonly key: string | undefined; readonly canvasKey: string } | undefined,
): ResolvedReference[] {
  const target = site.target;
  let resolved: ReferenceTarget | undefined;
  if (site.viewKey !== undefined) resolved = { kind: "view", key: site.viewKey };
  else if (target?.type === "element") resolved = { kind: "element", id: target.id };
  else if (target?.type === "relationship") {
    const relationship = relationshipKey(target);
    resolved = relationship && { kind: "relationship", key: relationship.canvasKey };
  } else if (target?.type === "group")
    resolved = { kind: "group", path: target.path, identifier: groupIdentifier(target) };
  else if (target?.type === "deployment")
    resolved = { kind: "deployment", identifier: target.identifier };
  if (resolved === undefined) return [];
  return [
    {
      statement: site.statement,
      token: site.token,
      kind: site.kind,
      written: site.written,
      exact: site.exact,
      relativeTo: site.relativeTo?.id,
      target: resolved,
    },
  ];
}

function sameTarget(left: ReferenceTarget, right: ReferenceTarget): boolean {
  switch (left.kind) {
    case "element":
      return right.kind === "element" && right.id === left.id;
    case "relationship":
      return right.kind === "relationship" && right.key === left.key;
    case "view":
      return right.kind === "view" && right.key === left.key;
    case "group":
      return (
        right.kind === "group" && right.path === left.path && right.identifier === left.identifier
      );
    case "deployment":
      return right.kind === "deployment" && right.identifier === left.identifier;
  }
}
