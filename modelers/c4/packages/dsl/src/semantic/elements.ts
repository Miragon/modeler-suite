/*
 * Elements, groups, re-opens and their field statements, as the reference parser's element
 * parsers read them (R-DSL §5, §7, §8.4, §9): positional slots after the keyword, archetype
 * defaults under them, `description` / `technology` / `tag(s)` / `url` children and `!element`
 * re-opens over them, the last writer winning.
 */
import type { ElementKind, FieldName } from "@miragon/c4-schema-model";
import { javaTrim } from "../syntax/characters.js";
import type { Statement } from "../types.js";
import {
  child,
  ELEMENT_KEYWORDS,
  type ArchetypeBase,
  type ArchetypeRecord,
  type Context,
} from "./context.js";
import { checkArity, type Outcome } from "./outcome.js";
import { emptyWrites, type ElementRecord, type FieldWrite, type GroupRecord } from "./records.js";
import type { Build, Values } from "./state.js";
import { tagsOf } from "./values.js";

const FIELDS: readonly FieldName[] = [
  "name",
  "description",
  "technology",
  "metadata",
  "tags",
  "url",
];

/** Positional slots after the keyword (SPEC 3.5). */
const SLOTS: Readonly<Record<ElementKind, Partial<Record<FieldName, number>>>> = {
  person: { name: 1, description: 2, tags: 3 },
  softwareSystem: { name: 1, description: 2, tags: 3 },
  container: { name: 1, description: 2, technology: 3, tags: 4 },
  component: { name: 1, description: 2, technology: 3, tags: 4 },
  custom: { name: 1, metadata: 2, description: 3, tags: 4 },
};

const GRAMMARS: Readonly<Record<ElementKind, string>> = {
  person: "person <name> [description] [tags]",
  softwareSystem: "softwareSystem <name> [description] [tags]",
  container: "container <name> [description] [technology] [tags]",
  component: "component <name> [description] [technology] [tags]",
  custom: "element <name> [metadata] [description] [tags]",
};

const KIND_WORDS: Readonly<Record<ElementKind, string>> = {
  person: "person",
  softwareSystem: "software system",
  container: "container",
  component: "component",
  custom: "element",
};

/** The context kind an element of each kind is defined in, and the parent kind it needs. */
const PARENT_KIND: Readonly<Record<ElementKind, ElementKind | undefined>> = {
  person: undefined,
  softwareSystem: undefined,
  custom: undefined,
  container: "softwareSystem",
  component: "container",
};

export function archetypeOf(
  build: Build,
  base: ArchetypeBase,
  keyword: string,
): ArchetypeRecord | undefined {
  return build.archetypes.get(base)?.get(keyword.toLowerCase());
}

/** The element kind a keyword or an element archetype's name creates. */
export function elementKeyword(
  build: Build,
  keyword: string,
): { readonly kind: ElementKind; readonly archetype: ArchetypeRecord | undefined } | undefined {
  const lower = keyword.toLowerCase();
  const order: readonly [ElementKind, ArchetypeBase][] = [
    ["custom", "element"],
    ["person", "person"],
    ["softwareSystem", "softwareSystem"],
    ["container", "container"],
    ["component", "component"],
  ];
  for (const [kind, base] of order) {
    const named = ELEMENT_KEYWORDS[lower] === kind;
    const archetype = archetypeOf(build, base, named ? base : lower);
    if (named) return { kind, archetype };
    if (archetype) return { kind, archetype };
  }
  return undefined;
}

/** `person`, `softwareSystem`, `element` in the model, `container` in a system, `component` in a container. */
export function definesHere(kind: ElementKind, context: Context): boolean {
  const parentKind = PARENT_KIND[kind];
  if (parentKind === undefined) return context.kind === "model";
  return context.kind === "element" && context.element?.kind === parentKind;
}

export function createElement(
  build: Build,
  values: Values,
  context: Context,
  kind: ElementKind,
  archetype: ArchetypeRecord | undefined,
): Outcome {
  const statement = values.statement;
  const slots = SLOTS[kind];
  checkArity(build, values, context, GRAMMARS[kind], 2, (slots.tags ?? 3) + 1);
  const parent = PARENT_KIND[kind] === undefined ? undefined : context.element;
  const identifier = values.assignee;
  const record = newElement(build, statement, kind, parent, identifier, archetype?.name);
  applyArchetype(record, archetype, statement);
  applyPositional(values, record);
  if (identifier !== undefined) {
    build.registerKey(record.registerKey, record, values, context);
  }
  checkName(build, values, record);
  if (context.group) joinGroup(record, context.group);
  build.elements.push(record);
  build.role(statement, "element");
  return elementContext(record, false);
}

const URL_PROTOCOLS = new Set(["http", "https", "ftp", "file", "jar", "mailto"]);

/**
 * `ModelItem.setUrl`: empty clears it, `{workspace}` links stay, anything else must be a URL
 * Java can open; Structurizr refuses the rest.
 */
export function checkedUrl(build: Build, values: Values, context: Context): string | undefined {
  const url = values.tokens[1] ?? "";
  if (url === "") return undefined;
  if (url.startsWith("{workspace}") || /^\{workspace:\d+\}/.test(url)) return url;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\S+$/.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined || !URL_PROTOCOLS.has(scheme)) {
    build.incompatible(
      values,
      context,
      `Structurizr refuses “${url}” as a URL. Write a full address, such as https://example.com.`,
      "invalid-statement",
      1,
    );
  }
  return url;
}

export function invalidIdentifier(identifier: string): string {
  return `“${identifier}” isn't a valid identifier. Use only letters, digits, “_” and “-”, and don't start with “-”.`;
}

function newElement(
  build: Build,
  statement: Statement,
  kind: ElementKind,
  parent: ElementRecord | undefined,
  identifier: string | undefined,
  archetype: string | undefined,
): ElementRecord {
  const anonymous = identifier === undefined;
  const local = identifier?.toLowerCase() ?? build.anonymousKey();
  const registerKey =
    build.mode === "hierarchical" && parent !== undefined && !anonymous
      ? `${parent.registerKey}.${local}`
      : local;
  return {
    type: "element",
    order: build.elements.length,
    kind,
    identifier,
    mode: build.mode,
    parent,
    registerKey,
    anonymous,
    archetype,
    definition: statement,
    reopens: [],
    name: "",
    description: "",
    technology: "",
    metadata: "",
    archetypeTags: [],
    ownTags: [],
    url: undefined,
    properties: new Map(),
    group: undefined,
    writes: emptyWrites(FIELDS),
    tagSources: 0,
    id: identifier ?? "",
  };
}

function applyArchetype(
  record: ElementRecord,
  archetype: ArchetypeRecord | undefined,
  statement: Statement,
): void {
  if (archetype === undefined) return;
  const write = (field: FieldName) =>
    record.writes[field].push({
      form: "archetype",
      statement,
      token: undefined,
      substituted: false,
    });
  if (archetype.description !== "") {
    record.description = archetype.description;
    write("description");
  }
  if (archetype.technology !== "" && (record.kind === "container" || record.kind === "component")) {
    record.technology = archetype.technology;
    write("technology");
  }
  if (archetype.metadata !== "" && record.kind === "custom") {
    record.metadata = archetype.metadata;
    write("metadata");
  }
  if (archetype.tags.length > 0) {
    addTags(record.archetypeTags, archetype.tags);
    write("tags");
  }
  for (const [name, value] of archetype.properties) record.properties.set(name, value);
}

function applyPositional(values: Values, record: ElementRecord): void {
  const slots = SLOTS[record.kind];
  for (const field of FIELDS) {
    const token = slots[field];
    const value = token === undefined ? undefined : values.tokens[token];
    if (token === undefined || value === undefined) continue;
    writeField(record, field, value, {
      form: "positional",
      statement: values.statement,
      token,
      substituted: values.substituted[token] === true,
    });
  }
}

/** Sets a field and records where it came from; tags add to the own tags. */
export function writeField(
  record: ElementRecord,
  field: FieldName,
  value: string,
  write: FieldWrite,
): void {
  record.writes[field].push(write);
  switch (field) {
    case "name":
      record.name = value;
      return;
    case "description":
      record.description = value;
      return;
    case "technology":
      record.technology = value;
      return;
    case "metadata":
      record.metadata = value;
      return;
    case "url":
      record.url = value === "" ? undefined : value;
      return;
    case "tags":
      record.tagSources += 1;
      addTags(record.ownTags, tagsOf(value));
  }
}

export function addTags(into: string[], tags: readonly string[]): void {
  for (const tag of tags) {
    const trimmed = javaTrim(tag);
    if (!into.includes(trimmed)) into.push(trimmed);
  }
}

/** Names are required, and unique per kind at the top level, per system and per container. */
function checkName(build: Build, values: Values, record: ElementRecord): void {
  const elementId = build.elementId(record);
  const range = build.tokenRange(values.statement, 1);
  if (javaTrim(record.name) === "") {
    build.report.incompatible(
      "invalid-statement",
      `Structurizr needs a name for every ${KIND_WORDS[record.kind]}. Write one in quotes after “${values.keyword}”.`,
      range,
      () => `element:${record.id}`,
      elementId,
    );
    return;
  }
  const scope = `${record.kind}\u0000${record.parent?.order ?? ""}\u0000${record.name}`;
  const clash = build.names.has(scope);
  build.names.add(scope);
  if (!clash) return;
  const where = record.parent === undefined ? "" : ` in ${record.parent.name}`;
  build.report.incompatible(
    "duplicate-name",
    `A ${KIND_WORDS[record.kind]} named ${record.name} already exists${where}, so Structurizr refuses this one. Rename one of them.`,
    range,
    () => `element:${record.id}`,
    elementId,
  );
}

/**
 * `ElementGroup.addElement`, which adds to the outer groups too. `CustomElementParser` only sets
 * the group name, so a custom element is drawn in the frame but never named by the group.
 */
export function joinGroup(record: ElementRecord, group: GroupRecord): void {
  record.group = group.path;
  if (record.kind === "custom") return;
  for (let current: GroupRecord | undefined = group; current; current = current.outer) {
    current.members.push(record);
  }
}

export function elementContext(record: ElementRecord, reopened: boolean): Context {
  return {
    kind: "element",
    element: record,
    reopened,
    anchor: () => `${record.id} `,
  };
}

/** `group <name> {` in the model, a system or a container (R-DSL §5). */
export function createGroup(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  build.role(statement, "group");
  if (values.tokens.length !== 2 || statement.block === undefined) {
    build.incompatible(
      values,
      context,
      "Structurizr expects group <name> { here. Give the group one name and open its block with “{”.",
    );
  }
  const name = values.tokens[1] ?? "";
  const outer = context.group;
  let path = name;
  if (outer) {
    const separator = build.modelProperties.get("structurizr.groupSeparator") ?? "";
    if (separator === "") {
      build.incompatible(
        values,
        context,
        "Structurizr nests groups only when the model sets “structurizr.groupSeparator”. Add it to the model's properties, for example “structurizr.groupSeparator /”.",
      );
    }
    path = `${outer.path}${separator === "" ? "/" : separator}${name}`;
  }
  const parent = context.kind === "element" ? context.element : undefined;
  const hierarchical = build.mode === "hierarchical" && parent !== undefined;
  const group: GroupRecord = {
    type: "group",
    name,
    identifier: values.assignee,
    hierarchical,
    path,
    parent,
    outer,
    statement,
    members: [],
  };
  if (values.assignee !== undefined) {
    const local = values.assignee.toLowerCase();
    const key = hierarchical ? `${parent.registerKey}.${local}` : local;
    build.registerKey(key, group, values, context);
  }
  build.groups.push(group);
  return { ...context, group };
}

/** `tag`, `tags`, `description`, `technology`, `url`, `metadata` inside an element block. */
export function elementField(build: Build, values: Values, context: Context): Outcome {
  const record = context.element;
  if (record === undefined || context.group !== undefined) return undefined;
  const field = fieldOfStatement(values.lower, record.kind);
  if (field === undefined) return undefined;
  const statement = values.statement;
  build.role(statement, field);
  const form = context.reopened ? "reopen" : "statement";
  if (field === "tags") {
    if (values.tokens.length < 2) {
      build.incompatible(values, context, "Structurizr expects tags <tags> [tags]. Add the tags.");
      return "leaf";
    }
    record.writes.tags.push({
      form,
      statement,
      token: 1,
      substituted: values.substituted.slice(1).some(Boolean),
    });
    record.tagSources += 1;
    for (const value of values.tokens.slice(1)) addTags(record.ownTags, tagsOf(value));
    return "leaf";
  }
  if (!checkArity(build, values, context, `${values.keyword} <${field}>`, 2, 2)) return "leaf";
  const value = field === "url" ? checkedUrl(build, values, context) : values.tokens[1];
  writeField(record, field, value ?? "", {
    form,
    statement,
    token: 1,
    substituted: values.substituted[1] === true,
  });
  return "leaf";
}

function fieldOfStatement(
  lower: string,
  kind: ElementKind,
): "tags" | "description" | "url" | "technology" | undefined {
  switch (lower) {
    case "tag":
    case "tags":
      return "tags";
    case "description":
      return "description";
    case "url":
      return "url";
    case "technology":
      return kind === "container" || kind === "component" ? "technology" : undefined;
    default:
      return undefined;
  }
}

/** `group <name>` inside a component: a property, no block (R-DSL §5). */
export function componentGroup(build: Build, values: Values, context: Context): Outcome {
  const record = context.element;
  if (record === undefined) return "leaf";
  build.role(values.statement, "groupProperty");
  if (!checkArity(build, values, context, "group <name>", 2, 2)) return "leaf";
  const name = values.tokens[1] ?? "";
  if (record.group !== undefined && record.group !== "") {
    const separator = build.modelProperties.get("structurizr.groupSeparator") ?? "";
    if (separator === "") {
      build.incompatible(
        values,
        context,
        "Structurizr nests groups only when the model sets “structurizr.groupSeparator”. Add it to the model's properties.",
      );
    }
    record.group = `${record.group}${separator === "" ? "/" : separator}${name}`;
  } else {
    record.group = name;
  }
  propertyGroup(build, record);
  return "leaf";
}

/**
 * A component's `group` property names no group block, but the view draws a frame for it: one
 * group definition per level of the path, in the component's container.
 */
function propertyGroup(build: Build, record: ElementRecord): void {
  const path = record.group ?? "";
  const separator = build.modelProperties.get("structurizr.groupSeparator") ?? "";
  const names = separator === "" ? [path] : path.split(separator);
  let outer: GroupRecord | undefined;
  let prefix = "";
  names.forEach((name, index) => {
    prefix = index === 0 ? name : `${prefix}${separator}${name}`;
    const existing = build.groups.find(
      (group) => group.parent === record.parent && group.path === prefix,
    );
    const group: GroupRecord = existing ?? {
      type: "group",
      name,
      identifier: undefined,
      hierarchical: false,
      path: prefix,
      parent: record.parent,
      outer,
      statement: undefined,
      members: [],
    };
    if (!existing) build.groups.push(group);
    if (index === names.length - 1 && !group.members.includes(record)) group.members.push(record);
    outer = group;
  });
}

/** Canonical names (`CanonicalNameGenerator`): `.` and `/` removed from every name. */
export function canonicalName(record: ElementRecord): string {
  const format = (name: string) => name.replaceAll(".", "").replaceAll("/", "");
  const chain: string[] = [];
  for (let current: ElementRecord | undefined = record; current; current = current.parent) {
    chain.unshift(format(current.name));
  }
  const prefix = {
    person: "Person://",
    softwareSystem: "SoftwareSystem://",
    container: "Container://",
    component: "Component://",
    custom: "Custom://",
  }[record.kind];
  return `${prefix}${chain.join(".")}`;
}

/** `!element <identifier|canonical name>` (R-DSL §8.4). */
export function reopenElement(build: Build, values: Values, context: Context): Outcome {
  const statement = values.statement;
  build.role(statement, "elementReopen");
  if (values.assignee !== undefined) {
    build.incompatible(
      values,
      context,
      "Structurizr 6.2.4 refuses an identifier on “!element”: the element already has one. Remove the assignment.",
    );
  }
  if (!checkArity(build, values, context, "!element <identifier|canonical name>", 2, 2)) {
    return child(context, "unresolved");
  }
  const reference = values.tokens[1] ?? "";
  const found = findElement(build, reference, context);
  if (found === undefined) {
    if (
      !reference.includes("://") ||
      /^(Person|SoftwareSystem|Container|Component|Custom):\/\//.test(reference)
    ) {
      build.unresolved(
        values,
        context,
        1,
        `Nothing in the model is identified by “${reference}”, so Structurizr can't re-open it. Check the identifier, or define the element above.`,
      );
    }
    return child(context, "unresolved");
  }
  if (found.type !== "element") return child(context, "unresolved");
  found.reopens.push(statement);
  build.references.push({
    statement,
    token: 1,
    kind: "reopen",
    written: reference,
    exact: true,
    relativeTo: undefined,
    target: found,
  });
  if (context.group && found.kind !== "custom") found.group = context.group.path;
  return elementContext(found, true);
}

function findElement(build: Build, reference: string, context: Context) {
  if (reference.includes("://")) {
    return build.elements.find((record) => canonicalName(record) === reference);
  }
  return build.lookup(reference, context)?.target;
}

/** `archetypes { … }` definitions (R-DSL §9). */
export function defineArchetype(
  build: Build,
  values: Values,
  context: Context,
  base: ArchetypeBase,
): Outcome {
  build.role(values.statement, "archetype");
  const name = (values.assignee ?? (base === "relationship" ? "->" : base)).toLowerCase();
  const parentName = values.keyword.startsWith("--") ? values.keyword.slice(2, -2) : values.keyword;
  const parent = archetypeOf(build, base, parentName);
  const archetype: ArchetypeRecord = {
    name,
    base,
    metadata: parent?.metadata ?? "",
    description: parent?.description ?? "",
    technology: parent?.technology ?? "",
    tags: [...(parent?.tags ?? [])],
    properties: new Map(),
  };
  build.archetypes.get(base)?.set(name, archetype);
  if (base === "group") return "leaf";
  return child(context, "archetype", { archetype });
}

/** The base type an archetype definition's keyword names (`container`, `application`, `->`, `--https->`). */
export function archetypeBase(build: Build, keyword: string): ArchetypeBase | undefined {
  const lower = keyword.toLowerCase();
  if (lower === "->") return "relationship";
  if (keyword.startsWith("--") && keyword.endsWith("->")) {
    return archetypeOf(build, "relationship", keyword.slice(2, -2)) ? "relationship" : undefined;
  }
  const bases: readonly ArchetypeBase[] = [
    "group",
    "element",
    "person",
    "softwareSystem",
    "container",
    "component",
    "deploymentNode",
    "infrastructureNode",
  ];
  for (const base of bases) {
    if (lower === base.toLowerCase() || build.archetypes.get(base)?.has(lower)) return base;
  }
  return undefined;
}

/** `description`, `technology`, `metadata`, `tag`, `tags` inside an archetype block (`ArchetypeParser`). */
export function archetypeField(build: Build, values: Values, context: Context): Outcome {
  const archetype = context.archetype;
  if (archetype === undefined) return undefined;
  const single = (field: string) =>
    checkArity(build, values, context, `${field} <${field}>`, 2, 2) ? values.tokens[1] : undefined;
  switch (values.lower) {
    case "description": {
      const value = single("description");
      if (value !== undefined) archetype.description = value;
      return "leaf";
    }
    case "technology": {
      if (
        ![
          "container",
          "component",
          "deploymentNode",
          "infrastructureNode",
          "relationship",
        ].includes(archetype.base)
      ) {
        return undefined;
      }
      const value = single("technology");
      if (value !== undefined) archetype.technology = value;
      return "leaf";
    }
    case "metadata": {
      if (archetype.base !== "element") return undefined;
      const value = single("metadata");
      if (value !== undefined) archetype.metadata = value;
      return "leaf";
    }
    case "tag": {
      const value = single("tag");
      if (value !== undefined) addTags(archetype.tags, [value]);
      return "leaf";
    }
    case "tags":
      if (!checkArity(build, values, context, "tags <tags> [tags]", 2, Infinity)) return "leaf";
      for (const tags of values.tokens.slice(1)) addTags(archetype.tags, tagsOf(tags));
      return "leaf";
    default:
      return undefined;
  }
}
