import { impliedRelationships } from "../../src/implied.js";
import { parseExpression } from "../../src/views/expressions.js";
import type {
  ElementKind,
  FieldName,
  FieldSource,
  GroupDefinition,
  ImpliedStrategy,
  ModelElement,
  Relationship,
  Styles,
  ViewDefinition,
  ViewType,
  Workspace,
} from "../../src/types.js";
import { defaultTerminology } from "../../src/terminology.js";

/** Hand-built semantic models: what the dsl builder would produce, without a parser. */

const SOURCE: FieldSource = {
  form: "positional",
  statement: 0,
  token: 1,
  editable: true,
  reason: undefined,
};

const KIND_TAGS: Readonly<Record<ElementKind, string | undefined>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  custom: undefined,
};

export interface ElementOptions {
  readonly name?: string;
  readonly parent?: string;
  readonly tags?: readonly string[];
  readonly technology?: string;
  readonly metadata?: string;
  readonly description?: string;
  readonly group?: string;
  readonly implicit?: boolean;
  readonly properties?: Readonly<Record<string, string>>;
}

export function element(id: string, kind: ElementKind, options: ElementOptions = {}): ModelElement {
  const ownTags = options.tags ?? [];
  const kindTag = KIND_TAGS[kind];
  const fields = Object.fromEntries(
    (["name", "description", "technology", "metadata", "tags", "url"] as FieldName[]).map(
      (field) => [field, SOURCE],
    ),
  ) as Record<FieldName, FieldSource>;
  return {
    id,
    identifier: options.implicit ? undefined : id.split(".").at(-1),
    implicit: options.implicit ?? false,
    kind,
    archetype: undefined,
    parentId: options.parent,
    name: options.name ?? id,
    description: options.description ?? "",
    technology: options.technology ?? "",
    metadata: options.metadata ?? "",
    tags: ["Element", ...(kindTag ? [kindTag] : []), ...ownTags],
    ownTags,
    url: undefined,
    properties: options.properties ?? {},
    group: options.group,
    fields,
  };
}

export const person = (id: string, options?: ElementOptions) => element(id, "person", options);
export const system = (id: string, options?: ElementOptions) =>
  element(id, "softwareSystem", options);
export const container = (id: string, parent: string, options?: ElementOptions) =>
  element(id, "container", { ...options, parent });
export const component = (id: string, parent: string, options?: ElementOptions) =>
  element(id, "component", { ...options, parent });
export const custom = (id: string, options?: ElementOptions) => element(id, "custom", options);

export interface RelationshipOptions {
  readonly identifier?: string;
  readonly description?: string;
  readonly technology?: string;
  readonly tags?: readonly string[];
}

export function relationship(
  sourceId: string,
  destinationId: string,
  options: RelationshipOptions = {},
): Relationship {
  const key = options.identifier ?? `${sourceId}->${destinationId}`;
  return {
    key,
    canvasKey: key,
    identifier: options.identifier,
    sourceId,
    destinationId,
    description: options.description ?? "",
    technology: options.technology ?? "",
    tags: ["Relationship", ...(options.tags ?? [])],
    url: undefined,
    implied: false,
    impliedBy: undefined,
    bulk: false,
    fields: { description: SOURCE, technology: SOURCE, tags: SOURCE, url: SOURCE },
  };
}

/** `"include *"`, `"exclude a b"`; a term with spaces goes in as its own array entry. */
export type StatementSpec = string | readonly ["include" | "exclude", ...string[]];

export interface ViewOptions {
  readonly scope?: string;
  readonly statements?: readonly StatementSpec[];
  readonly title?: string;
  readonly isDefault?: boolean;
  readonly editable?: boolean;
  readonly baseKey?: string;
  readonly properties?: Readonly<Record<string, string>>;
}

export function view(key: string, type: ViewType, options: ViewOptions = {}): ViewDefinition {
  const statements = (options.statements ?? ["include *"]).map((spec) => {
    const [kind, ...terms] = typeof spec === "string" ? spec.split(/\s+/) : spec;
    return {
      kind: kind as "include" | "exclude",
      terms: terms.map((text) => ({ text, expression: parseExpression(text) })),
    };
  });
  const supported = statements.every((statement) =>
    statement.terms.every((term) => term.expression !== undefined),
  );
  const staticType = ["systemLandscape", "systemContext", "container", "component"].includes(type);
  const editable = options.editable ?? (staticType && supported);
  return {
    key,
    keyGenerated: false,
    type,
    scopeId: options.scope,
    baseKey: options.baseKey,
    title: options.title,
    description: undefined,
    isDefault: options.isDefault ?? false,
    autoLayout: undefined,
    statements,
    properties: options.properties ?? {},
    layout: { elements: new Map(), relationships: new Map(), unmatched: [], malformed: [] },
    editable,
    readOnlyReason: editable ? undefined : staticType ? "expression" : "type",
  };
}

export const NO_STYLES: Styles = { elements: [], relationships: [], themes: [] };

export interface WorkspaceSpec {
  readonly elements?: readonly ModelElement[];
  readonly relationships?: readonly Relationship[];
  readonly views?: readonly ViewDefinition[];
  readonly groups?: readonly GroupDefinition[];
  readonly styles?: Styles;
  readonly strategy?: ImpliedStrategy;
  readonly openWorld?: boolean;
  readonly name?: string;
}

/** A workspace with the implied relationships Structurizr's default strategy creates. */
export function workspace(spec: WorkspaceSpec = {}): Workspace {
  const elements = spec.elements ?? [];
  const explicit = spec.relationships ?? [];
  const parents = new Map(
    elements.flatMap((item) =>
      item.parentId === undefined ? [] : [[item.id, item.parentId] as const],
    ),
  );
  const implied = impliedRelationships(
    explicit.map((item) => ({ relationship: item, strategy: spec.strategy ?? "unless-any" })),
    { parents },
  );
  return {
    name: spec.name ?? "Workspace",
    description: "",
    elements,
    relationships: [...explicit, ...implied],
    views: spec.views ?? [],
    groups: spec.groups ?? [],
    styles: spec.styles ?? NO_STYLES,
    terminology: defaultTerminology(),
    dynamicReferences: new Map(),
    instances: new Map(),
    openWorld: spec.openWorld ?? false,
    opaqueTexts: [],
  };
}
