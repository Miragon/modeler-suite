/*
 * The builder's working state: one mutable record per element, relationship, group, deployment
 * item, view and style, holding the statements they come from. `finish.ts` turns them into the
 * plain data of `Workspace` once every identifier is known.
 */
import type {
  AutoLayout,
  ElementId,
  ElementKind,
  ElementStyle,
  FieldName,
  IdentifierMode,
  ImpliedStrategy,
  RelationshipStyle,
  ViewKey,
  ViewType,
} from "@miragon/c4-schema-model";
import type { RawBlock, Statement } from "../types.js";

/** One place that sets a field, in document order; the last one is the effective source. */
export interface FieldWrite {
  readonly form: "positional" | "statement" | "reopen" | "archetype";
  readonly statement: Statement;
  readonly token: number | undefined;
  readonly substituted: boolean;
}

export interface ElementRecord {
  readonly type: "element";
  readonly order: number;
  readonly kind: ElementKind;
  /** As written, the local part in hierarchical mode. */
  readonly identifier: string | undefined;
  readonly mode: IdentifierMode;
  readonly parent: ElementRecord | undefined;
  /** What the register knows it by, lower case; an anonymous element's stands in for Structurizr's UUID. */
  readonly registerKey: string;
  readonly anonymous: boolean;
  readonly archetype: string | undefined;
  readonly definition: Statement;
  readonly reopens: Statement[];
  name: string;
  description: string;
  technology: string;
  metadata: string;
  readonly archetypeTags: string[];
  readonly ownTags: string[];
  url: string | undefined;
  readonly properties: Map<string, string>;
  group: string | undefined;
  readonly writes: Record<FieldName, FieldWrite[]>;
  /** Places that write own tags: positional, `tag`/`tags` statements, re-opens. */
  tagSources: number;
  /** Assigned once every explicit identifier is registered (`finish.ts`). */
  id: ElementId;
}

export interface RelationshipRecord {
  readonly type: "relationship";
  readonly order: number;
  readonly source: ElementRecord;
  readonly destination: ElementRecord;
  readonly identifier: string | undefined;
  readonly statement: Statement;
  readonly form: "explicit" | "implicit";
  /** Token indices of the written ends; undefined for the element in scope (`-> x`, `this`). */
  readonly sourceToken: number | undefined;
  readonly destinationToken: number | undefined;
  readonly strategy: ImpliedStrategy;
  readonly reopens: Statement[];
  description: string;
  technology: string;
  readonly archetypeTags: string[];
  readonly ownTags: string[];
  url: string | undefined;
  readonly properties: Map<string, string>;
  readonly writes: Record<"description" | "technology" | "tags" | "url", FieldWrite[]>;
  tagSources: number;
  /** Structurizr refuses it (a relationship with this description exists): not drawn. */
  refused: boolean;
}

export interface GroupRecord {
  readonly type: "group";
  readonly name: string;
  /** As written. */
  readonly identifier: string | undefined;
  /**
   * Registered under the parent's key, as Structurizr's hierarchical mode keys a system's or a
   * container's group (`s.g`): text names it by the full key, so `groupIdentifier` reports that.
   */
  readonly hierarchical: boolean;
  readonly path: string;
  /** The element whose block holds the group; undefined at model level. */
  readonly parent: ElementRecord | undefined;
  readonly outer: GroupRecord | undefined;
  readonly statement: Statement | undefined;
  readonly members: ElementRecord[];
}

export type DeploymentKind =
  | "deploymentEnvironment"
  | "deploymentNode"
  | "infrastructureNode"
  | "softwareSystemInstance"
  | "containerInstance"
  | "deploymentGroup"
  | "deploymentRelationship";

export interface DeploymentRecord {
  readonly type: "deployment";
  readonly kind: DeploymentKind;
  readonly name: string;
  readonly identifier: string | undefined;
  readonly registerKey: string;
  readonly parent: DeploymentRecord | undefined;
  readonly environment: string;
  readonly statement: Statement;
  /** The software system or container an instance is of. */
  readonly instanceOf: ElementRecord | undefined;
}

/** Where a statement names an element, a relationship, a view or a group (SPEC 3.3 renames, 3.5 cascade). */
export interface ReferenceSite {
  readonly statement: Statement;
  readonly token: number;
  readonly kind:
    | "relationship-source"
    | "relationship-destination"
    | "reopen"
    | "view-scope"
    | "view-term"
    | "animation-term"
    | "dynamic-step"
    | "instance"
    | "deployment-relationship"
    | "no-relationship"
    | "view-base"
    | "image-source";
  /** The identifier as written (a term's operand, not the whole term). */
  readonly written: string;
  /** The token is exactly the identifier, not an expression holding it. */
  readonly exact: boolean;
  /** Hierarchical lookup found it under this element's key, so `written` is relative. */
  readonly relativeTo: ElementRecord | undefined;
  readonly target: ElementRecord | RelationshipRecord | GroupRecord | DeploymentRecord | undefined;
  /** For view-key references (`filtered`, image views). */
  readonly viewKey?: ViewKey;
}

export interface ViewTermSite {
  readonly token: number;
  readonly text: string;
}

export interface ViewContentStatement {
  readonly statement: Statement;
  readonly kind: "include" | "exclude";
  readonly terms: readonly ViewTermSite[];
}

export interface PropertyEntrySite {
  readonly statement: Statement;
  readonly key: string;
  readonly value: string;
}

export interface PropertiesBlockSite {
  readonly statement: Statement;
  readonly entries: PropertyEntrySite[];
}

export interface ViewRecord {
  readonly type: "view";
  readonly order: number;
  readonly viewType: ViewType;
  readonly statement: Statement;
  readonly key: ViewKey;
  readonly keyGenerated: boolean;
  /** The token holding the key; undefined for a keyless view. */
  readonly keyToken: number | undefined;
  readonly scopeToken: number | undefined;
  readonly scopeText: string | undefined;
  readonly scope: ElementRecord | undefined;
  readonly scopeValid: boolean;
  readonly baseKey: ViewKey | undefined;
  /** A deployment view's environment by name. */
  readonly environment: string | undefined;
  readonly positionalDescriptionToken: number | undefined;
  /** Custom views take a title in the head. */
  readonly positionalTitleToken: number | undefined;
  title: string | undefined;
  description: string | undefined;
  readonly titleStatements: Statement[];
  readonly descriptionStatements: Statement[];
  readonly defaultStatements: Statement[];
  readonly autoLayoutStatements: Statement[];
  autoLayout: AutoLayout | undefined;
  readonly contents: ViewContentStatement[];
  readonly animations: Statement[];
  /** Every animation step in document order: an `animationStep` line or a line of an `animation` block. */
  readonly animationSteps: { readonly statement: Statement; readonly terms: readonly string[] }[];
  readonly propertiesBlocks: PropertiesBlockSite[];
  readonly properties: Map<string, string>;
  /** A term outside the supported set (SPEC 4.1). */
  unsupported: boolean;
}

export interface StyleRecord {
  readonly type: "elementStyle" | "relationshipStyle";
  readonly tag: string;
  readonly scheme: "light" | "dark" | undefined;
  readonly statement: Statement;
  readonly values: Partial<Record<keyof ElementStyle | keyof RelationshipStyle, unknown>>;
}

export interface OpaqueSite {
  readonly node: Statement | RawBlock;
  readonly text: string;
}

export type Target = ElementRecord | RelationshipRecord | GroupRecord | DeploymentRecord;

/** The identifier text names the group by, once the parent's id is assigned. */
export function groupIdentifier(group: GroupRecord): string | undefined {
  if (group.identifier === undefined) return undefined;
  return group.hierarchical && group.parent
    ? `${group.parent.id}.${group.identifier}`
    : group.identifier;
}

export function emptyWrites<Field extends string>(
  fields: readonly Field[],
): Record<Field, FieldWrite[]> {
  return Object.fromEntries(fields.map((field) => [field, [] as FieldWrite[]])) as Record<
    Field,
    FieldWrite[]
  >;
}
