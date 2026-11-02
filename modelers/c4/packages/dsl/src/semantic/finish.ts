/*
 * From the builder's records to the plain data of `Workspace` (SPEC 3.2): final ids, field
 * sources, relationships, groups, views with their stored layout read against what each view
 * shows, styles, terminology, and the diagnostics that need the finished model.
 */
import {
  defaultTerminology,
  type ElementStyle,
  type FieldName,
  type FieldSource,
  type GroupDefinition,
  type ModelElement,
  type Relationship,
  type RelationshipStyle,
  type Styles,
  type Terminology,
  type ViewKey,
  type Workspace,
} from "@miragon/c4-schema-model";
import { dynamicSteps } from "./checks.js";
import { assignIds } from "./identity.js";
import { finishLayout, finishViews } from "./finishViews.js";
import { groupIdentifier, type ElementRecord, type StyleRecord } from "./records.js";
import { finishRelationships, type FinishedRelationships } from "./relations.js";
import type { Build } from "./state.js";

const FIELDS: readonly FieldName[] = [
  "name",
  "description",
  "technology",
  "metadata",
  "tags",
  "url",
];

const KIND_TAGS: Readonly<Record<ModelElement["kind"], string | undefined>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  custom: undefined,
};

export interface Finished {
  readonly workspace: Workspace;
  readonly relationships: FinishedRelationships;
}

export function finish(build: Build): Finished {
  assignIds(build);
  const relationships = finishRelationships(build);
  dynamicSteps(build, relationships);
  const draft: Workspace = {
    name: build.workspace.name,
    description: build.workspace.description,
    elements: build.elements.map((record) => modelElement(build, record)),
    relationships: relationships.relationships,
    views: finishViews(build),
    groups: build.groups.map(groupDefinition),
    styles: styles(build.styles, build.themes),
    terminology: terminology(build),
    dynamicReferences: dynamicReferences(build, relationships),
    instances: new Map([...build.instances].map(([record, instances]) => [record.id, instances])),
    openWorld: build.openWorld,
    opaqueTexts: build.opaque.map((site) => site.text),
  };
  return { workspace: { ...draft, views: finishLayout(build, draft) }, relationships };
}

function modelElement(build: Build, record: ElementRecord): ModelElement {
  const kindTag = KIND_TAGS[record.kind];
  const tags = ["Element", ...(kindTag ? [kindTag] : [])];
  for (const tag of [...record.archetypeTags, ...record.ownTags])
    if (!tags.includes(tag)) tags.push(tag);
  const fields = Object.fromEntries(
    FIELDS.map((field) => [field, fieldSource(build, record, field)]),
  ) as Record<FieldName, FieldSource>;
  return {
    id: record.id,
    identifier: record.identifier,
    implicit: record.anonymous,
    kind: record.kind,
    archetype: record.archetype,
    parentId: record.parent?.id,
    name: record.name,
    description: record.description,
    technology: record.technology,
    metadata: record.metadata,
    tags,
    ownTags: [...record.ownTags],
    url: record.url,
    properties: Object.fromEntries(record.properties),
    group: record.group,
    fields,
  };
}

function applies(record: ElementRecord, field: FieldName): boolean {
  if (field === "technology") return record.kind === "container" || record.kind === "component";
  if (field === "metadata") return record.kind === "custom";
  return true;
}

/** The effective source of a field: its last writer (SPEC 3.5), read-only for the reasons named there. */
function fieldSource(build: Build, record: ElementRecord, field: FieldName): FieldSource {
  const last = record.writes[field].at(-1);
  if (!applies(record, field)) {
    return {
      form: "absent",
      statement: build.indexOf(record.definition),
      token: undefined,
      editable: false,
      reason: undefined,
    };
  }
  const bulk = field !== "name" && field !== "metadata" && build.bulkElementFields.has(field);
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
    statement: build.indexOf(last?.statement ?? record.definition),
    token: last?.token,
    editable: reason === undefined,
    reason,
  };
}

function groupDefinition(group: Build["groups"][number]): GroupDefinition {
  const definition: GroupDefinition = {
    name: group.name,
    identifier: groupIdentifier(group),
    path: group.path,
    members: group.members.map((member) => member.id),
  };
  return group.parent ? { ...definition, parentId: group.parent.id } : definition;
}

/** Unscoped and `light` styles merged per tag, in the order the tags were first defined. */
function styles(records: readonly StyleRecord[], themes: readonly string[]): Styles {
  const merge = <Style extends { readonly tag: string }>(type: StyleRecord["type"]): Style[] => {
    const byTag = new Map<string, Record<string, unknown>>();
    for (const record of records) {
      if (record.type !== type || record.scheme === "dark") continue;
      byTag.set(record.tag, {
        ...(byTag.get(record.tag) ?? { tag: record.tag }),
        ...record.values,
      });
    }
    return [...byTag.values()] as unknown as Style[];
  };
  return {
    elements: merge<ElementStyle>("elementStyle"),
    relationships: merge<RelationshipStyle>("relationshipStyle"),
    themes: [...themes],
  };
}

function terminology(build: Build): Terminology {
  const defaults = defaultTerminology();
  const words = build.terminology;
  return {
    person: words["person"] ?? defaults.person,
    softwareSystem: words["softwaresystem"] ?? defaults.softwareSystem,
    container: words["container"] ?? defaults.container,
    component: words["component"] ?? defaults.component,
    deploymentNode: words["deploymentnode"] ?? defaults.deploymentNode,
    infrastructureNode: words["infrastructurenode"] ?? defaults.infrastructureNode,
    relationship: words["relationship"] ?? defaults.relationship,
    metadataSymbols: words.metadataSymbols ?? defaults.metadataSymbols,
  };
}

function dynamicReferences(
  build: Build,
  relationships: FinishedRelationships,
): Workspace["dynamicReferences"] {
  const references = new Map<ViewKey, { elements: string[]; relationships: string[] }>();
  for (const step of build.dynamicSteps) {
    const entry = references.get(step.view.key) ?? { elements: [], relationships: [] };
    for (const element of step.elements)
      if (!entry.elements.includes(element.id)) entry.elements.push(element.id);
    const relationship: Relationship | undefined =
      step.relationship && relationships.byRecord.get(step.relationship);
    if (relationship?.key !== undefined && !entry.relationships.includes(relationship.key)) {
      entry.relationships.push(relationship.key);
    }
    references.set(step.view.key, entry);
  }
  for (const view of build.views) {
    if (view.viewType === "dynamic" && !references.has(view.key))
      references.set(view.key, { elements: [], relationships: [] });
  }
  return references;
}
