import type {
  ElementDigest,
  ModelElement,
  Relationship,
  RelationshipDigest,
  SemanticDigest,
  ViewDefinition,
  ViewDigest,
  Workspace,
} from "./types.js";

/**
 * The primary digest of SPEC 3.4 step 4: what the text says, without source positions, implied
 * relationships, cascaded tags or terminology. Membership is a pure function of it.
 */
export function semanticDigest(workspace: Workspace): SemanticDigest {
  return {
    name: workspace.name,
    description: workspace.description,
    elements: new Map(workspace.elements.map((element) => [element.id, elementDigest(element)])),
    relationships: workspace.relationships
      .filter((relationship) => !relationship.implied)
      .map(relationshipDigest),
    views: new Map(workspace.views.map((view) => [view.key, viewDigest(view)])),
    styles: canonical(workspace.styles),
    opaque: opaqueDigest(workspace),
  };
}

/**
 * Equal digests. Elements and views compare by key and relationships as a multiset, so an edit
 * states its expected digest without predicting where the text places a new statement; the order
 * of the opaque texts counts.
 */
export function sameDigest(left: SemanticDigest, right: SemanticDigest): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.styles === right.styles &&
    sameKeyedEntries(left.elements, right.elements) &&
    sameKeyedEntries(left.views, right.views) &&
    sameMultiset(left.relationships.map(canonical), right.relationships.map(canonical)) &&
    left.opaque.length === right.opaque.length &&
    left.opaque.every((text, index) => text === right.opaque[index])
  );
}

function elementDigest(element: ModelElement): ElementDigest {
  return {
    kind: element.kind,
    parentId: element.parentId,
    name: element.name,
    description: element.description,
    technology: element.technology,
    metadata: element.metadata,
    ownTags: element.ownTags,
    url: element.url,
    properties: element.properties,
    group: element.group,
  };
}

function relationshipDigest(relationship: Relationship): RelationshipDigest {
  return {
    identifier: relationship.identifier,
    sourceId: relationship.sourceId,
    destinationId: relationship.destinationId,
    description: relationship.description,
    technology: relationship.technology,
    tags: relationship.tags,
    url: relationship.url,
  };
}

function viewDigest(view: ViewDefinition): ViewDigest {
  return {
    key: view.key,
    type: view.type,
    scopeId: view.scopeId,
    baseKey: view.baseKey,
    title: view.title,
    description: view.description,
    isDefault: view.isDefault,
    autoLayout: view.autoLayout,
    statements: view.statements.map((statement) => ({
      kind: statement.kind,
      terms: statement.terms.map((term) => term.text),
    })),
    properties: view.properties,
  };
}

function opaqueDigest(workspace: Workspace): string[] {
  const texts = workspace.opaqueTexts.map((text) => text.trim().replace(/\s+/g, " "));
  for (const [key, references] of workspace.dynamicReferences) {
    texts.push(
      `dynamic ${key}: ${references.elements.join(",")} | ${references.relationships.join(",")}`,
    );
  }
  for (const [elementId, instances] of workspace.instances) {
    texts.push(`instances ${elementId}: ${instances.join(",")}`);
  }
  return texts;
}

function sameKeyedEntries<Value>(
  left: ReadonlyMap<string, Value>,
  right: ReadonlyMap<string, Value>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (!right.has(key) || canonical(value) !== canonical(right.get(key))) return false;
  }
  return true;
}

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((value, index) => value === sortedRight[index]);
}

/** JSON with sorted object keys and maps as sorted entries; undefined members are left out. */
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Map) {
    const entries = [...(value as Map<unknown, unknown>)].map(
      ([key, entry]) => `${JSON.stringify(String(key))}:${canonical(entry)}`,
    );
    return `{${entries.sort().join(",")}}`;
  }
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
  return `{${members.join(",")}}`;
}
