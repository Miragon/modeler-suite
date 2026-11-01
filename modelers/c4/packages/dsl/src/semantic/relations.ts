/*
 * The relationships the canvas draws: explicit ones in document order minus those Structurizr
 * refuses because the source already has one to the destination with the same description,
 * implied ones included (`Element.has`, SPEC 3.4), then the implied ones in creation order
 * (`schema-model/implied.ts`), and the keys of SPEC 3.6.
 */
import {
  impliedRelationships,
  type FieldSource,
  type ImpliedStrategy,
  type Relationship,
} from "@miragon/c4-schema-model";
import type { ElementRecord, FieldWrite, RelationshipRecord } from "./records.js";
import type { Build } from "./state.js";

interface Edge {
  readonly destination: ElementRecord;
  readonly description: string;
}

interface ImpliedOrigin {
  readonly source: ElementRecord;
  readonly destination: ElementRecord;
  readonly origin: RelationshipRecord;
}

/** `Model.addRelationship` with the strategy in force where each one is written. */
class Created {
  private readonly outgoing = new Map<ElementRecord, Edge[]>();
  readonly implied: ImpliedOrigin[] = [];

  hasSame(
    source: ElementRecord,
    destination: ElementRecord,
    description: string,
  ): Edge | undefined {
    return (this.outgoing.get(source) ?? []).find(
      (edge) => edge.destination === destination && edge.description === description,
    );
  }

  private hasAny(source: ElementRecord, destination: ElementRecord): boolean {
    return (this.outgoing.get(source) ?? []).some((edge) => edge.destination === destination);
  }

  private add(source: ElementRecord, destination: ElementRecord, description: string): void {
    const list = this.outgoing.get(source) ?? [];
    list.push({ destination, description });
    this.outgoing.set(source, list);
  }

  accept(record: RelationshipRecord, strategy: ImpliedStrategy): void {
    this.add(record.source, record.destination, record.description);
    if (strategy === "none") return;
    for (const source of selfAndAncestors(record.source)) {
      for (const destination of selfAndAncestors(record.destination)) {
        if (!impliedAllowed(source, destination)) continue;
        const exists =
          strategy === "unless-any"
            ? this.hasAny(source, destination)
            : this.hasSame(source, destination, record.description) !== undefined;
        if (exists) continue;
        this.add(source, destination, record.description);
        this.implied.push({ source, destination, origin: record });
      }
    }
  }
}

function selfAndAncestors(record: ElementRecord): ElementRecord[] {
  const chain: ElementRecord[] = [];
  for (let current: ElementRecord | undefined = record; current; current = current.parent) {
    chain.push(current);
  }
  return chain;
}

function impliedAllowed(source: ElementRecord, destination: ElementRecord): boolean {
  if (source === destination) return false;
  return (
    !selfAndAncestors(destination).slice(1).includes(source) &&
    !selfAndAncestors(source).slice(1).includes(destination)
  );
}

export interface FinishedRelationships {
  readonly relationships: readonly Relationship[];
  /**
   * The order Structurizr creates them in, each explicit one followed by those it implies: the
   * order an element's relationships are iterated in (`Element.getEfferentRelationshipWith`).
   */
  readonly creationOrder: readonly Relationship[];
  readonly byRecord: ReadonlyMap<RelationshipRecord, Relationship>;
  readonly records: ReadonlyMap<string, RelationshipRecord>;
}

export function finishRelationships(build: Build): FinishedRelationships {
  const created = new Created();
  const accepted: RelationshipRecord[] = [];
  for (const record of build.relationships) {
    const same = created.hasSame(record.source, record.destination, record.description);
    if (same !== undefined) {
      record.refused = true;
      reportExisting(build, record, created);
      continue;
    }
    created.accept(record, record.strategy);
    accepted.push(record);
  }
  const keys = relationshipKeys(build, accepted);
  const byRecord = new Map<RelationshipRecord, Relationship>();
  const records = new Map<string, RelationshipRecord>();
  const explicit = accepted.map((record) => {
    const relationship = toRelationship(build, record, keys.get(record));
    byRecord.set(record, relationship);
    records.set(relationship.canvasKey, record);
    return relationship;
  });
  const implied = impliedRelationships(
    explicit.map((relationship, index) => ({
      relationship,
      strategy: accepted[index]?.strategy ?? "unless-any",
    })),
    {
      parents: new Map(
        build.elements.flatMap((record) =>
          record.parent ? [[record.id, record.parent.id] as const] : [],
        ),
      ),
    },
  ).map((relationship, index) => {
    const origin = created.implied[index]?.origin;
    return origin && origin.properties.size > 0
      ? { ...relationship, properties: Object.fromEntries(origin.properties) }
      : relationship;
  });
  const impliedBy = new Map<RelationshipRecord, Relationship[]>();
  implied.forEach((relationship, index) => {
    const origin = created.implied[index]?.origin;
    if (origin) impliedBy.set(origin, [...(impliedBy.get(origin) ?? []), relationship]);
  });
  const creationOrder = accepted.flatMap((record) => {
    const relationship = byRecord.get(record);
    return relationship ? [relationship, ...(impliedBy.get(record) ?? [])] : [];
  });
  return { relationships: [...explicit, ...implied], creationOrder, byRecord, records };
}

function reportExisting(build: Build, record: RelationshipRecord, created: Created): void {
  const implied = created.implied.some(
    (entry) =>
      entry.source === record.source &&
      entry.destination === record.destination &&
      entry.origin.description === record.description,
  );
  const message = implied
    ? `An implied relationship already connects ${record.source.name} to ${record.destination.name} with this description, so Structurizr refuses this one and it isn't drawn. Give it another description, or remove it.`
    : `${record.source.name} already has a relationship to ${record.destination.name} with this description, so Structurizr refuses this one and it isn't drawn. Give it another description, or remove it.`;
  build.report.incompatible(
    "relationship-exists",
    message,
    record.statement.head,
    () =>
      `${record.source.id}->${record.destination.id} ${build.report.statementText(record.statement.head)}`,
  );
}

/** The identifier; else `<src>-><dst>` for the only unnamed one of the pair; else none (SPEC 3.6). */
function relationshipKeys(
  build: Build,
  accepted: readonly RelationshipRecord[],
): Map<RelationshipRecord, { readonly key: string | undefined; readonly canvasKey: string }> {
  const unnamed = new Map<string, RelationshipRecord[]>();
  for (const record of accepted) {
    if (record.identifier !== undefined) continue;
    const pair = `${record.source.id}->${record.destination.id}`;
    const list = unnamed.get(pair) ?? [];
    list.push(record);
    unnamed.set(pair, list);
  }
  const keys = new Map<RelationshipRecord, { key: string | undefined; canvasKey: string }>();
  for (const record of accepted) {
    if (record.identifier !== undefined) {
      keys.set(record, { key: record.identifier, canvasKey: record.identifier });
      continue;
    }
    const pair = `${record.source.id}->${record.destination.id}`;
    const siblings = unnamed.get(pair) ?? [];
    if (siblings.length === 1) {
      keys.set(record, { key: pair, canvasKey: pair });
      continue;
    }
    const position = siblings.indexOf(record) + 1;
    keys.set(record, { key: undefined, canvasKey: `${pair}#${position}` });
    build.report.note(
      "relationship-ambiguous",
      "info",
      `${record.source.name} has more than one unnamed relationship to ${record.destination.name}, so the modeler stores no bends for them. Moving or editing one on the canvas names it first.`,
      record.statement.head,
      () => `${pair} ${build.report.statementText(record.statement.head)}`,
    );
  }
  return keys;
}

function toRelationship(
  build: Build,
  record: RelationshipRecord,
  key: { readonly key: string | undefined; readonly canvasKey: string } | undefined,
): Relationship {
  const tags = ["Relationship"];
  for (const tag of [...record.archetypeTags, ...record.ownTags])
    if (!tags.includes(tag)) tags.push(tag);
  const source = (field: "description" | "technology" | "tags" | "url") =>
    relationshipFieldSource(build, record, field);
  return {
    key: key?.key,
    canvasKey: key?.canvasKey ?? `${record.source.id}->${record.destination.id}`,
    identifier: record.identifier,
    sourceId: record.source.id,
    destinationId: record.destination.id,
    description: record.description,
    technology: record.technology,
    tags,
    url: record.url,
    implied: false,
    impliedBy: undefined,
    bulk: false,
    fields: {
      description: source("description"),
      technology: source("technology"),
      tags: source("tags"),
      url: source("url"),
    },
    ...(record.properties.size > 0 ? { properties: Object.fromEntries(record.properties) } : {}),
  };
}

function relationshipFieldSource(
  build: Build,
  record: RelationshipRecord,
  field: "description" | "technology" | "tags" | "url",
): FieldSource {
  const last: FieldWrite | undefined = record.writes[field].at(-1);
  const bulk = build.bulkRelationshipFields.has(field);
  const several = field === "tags" && record.tagSources > 1;
  const reason = last?.substituted
    ? "substitution"
    : bulk
      ? "bulk"
      : several
        ? "several-statements"
        : undefined;
  return {
    form: last?.form ?? "absent",
    statement: build.indexOf(last?.statement ?? record.statement),
    token: last?.token,
    editable: reason === undefined,
    reason,
  };
}
