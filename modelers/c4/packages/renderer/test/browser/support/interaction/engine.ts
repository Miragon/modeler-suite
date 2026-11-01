/*
 * The engine the interaction tests run on while `@miragon/c4-dsl` has no parser and no edit layer
 * yet (SPEC 11.2 WP8). It reads and prints a canonical subset of the Structurizr DSL, so its
 * fixtures are valid Structurizr DSL that the real engine reads as well, and it edits a model of
 * that subset; the view catalog, the membership, the implied relationships and the layout are the
 * schema model's and the layout package's own. Every edit prints the whole text again, so a
 * canonical text changes only where the edit does.
 */
import type {
  C4Edit,
  EditContext,
  EditOutcome,
  EditRefusal,
  IdChange,
  ParseResult,
  SourceIndex,
  Statement,
  TextEdit,
} from "@miragon/c4-dsl";
import { layoutView } from "@miragon/c4-layout";
import {
  C4_COLOUR_STYLES,
  decodeElementLayout,
  decodeVertices,
  defaultShape,
  defaultSize,
  defaultTerminology,
  deriveIdentifier,
  draftKey,
  elementLayoutKey,
  encodeElementLayout,
  encodeVertices,
  impliedRelationships,
  isKeyword,
  isValidIdentifier,
  parseExpression,
  relationshipLayoutKey,
  viewCatalog,
  viewMembers,
  type AutoLayout,
  type Box,
  type Diagnostic,
  type DiagnosticCode,
  type ElementId,
  type ElementStyle,
  type FieldName,
  type FieldSource,
  type ModelElement,
  type Point,
  type Relationship,
  type ShapeName,
  type StaticViewType,
  type StoredBox,
  type ViewCatalog,
  type ViewDefinition,
  type ViewEntry,
  type ViewKey,
  type Workspace,
} from "@miragon/c4-schema-model";
import type { C4Engine } from "../../../../src/engine/C4Engine.js";

type Kind = "person" | "softwareSystem" | "container" | "component";

interface TElement {
  id: string;
  kind: Kind;
  name: string;
  description: string;
  technology: string;
  tags: string[];
  url: string | undefined;
  parentId: string | undefined;
}

interface TRelationship {
  sourceId: string;
  destinationId: string;
  description: string;
  technology: string;
  tags: string[];
  url: string | undefined;
}

interface TStatement {
  kind: "include" | "exclude";
  terms: string[];
}

interface TView {
  type: StaticViewType;
  scopeId: string | undefined;
  key: string;
  title: string | undefined;
  description: string | undefined;
  isDefault: boolean;
  statements: TStatement[];
  autoLayout: string | undefined;
  properties: [string, string][];
}

/** A dynamic view, kept line by line: the modeler lists it and never edits it. */
interface TRawView {
  type: "dynamic";
  scopeId: string | undefined;
  key: string;
  description: string | undefined;
  lines: string[];
  steps: [string, string][];
}

interface TStyle {
  tag: string;
  entries: [string, string][];
}

interface TModel {
  name: string;
  description: string;
  elements: TElement[];
  relationships: TRelationship[];
  views: (TView | TRawView)[];
  styles: TStyle[];
  /** Blocks of the model the subset does not read (`deploymentEnvironment`), line by line. */
  rawModel: string[][];
}

const INDENT = "    ";
const NEW_VIEW_AUTO_LAYOUT = "tb 300 160";
const KINDS: readonly Kind[] = ["person", "softwareSystem", "container", "component"];
const KIND_TAGS: Readonly<Record<Kind, string>> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
};
const KIND_WORDS: Readonly<Record<Kind, string>> = {
  person: "person",
  softwareSystem: "software system",
  container: "container",
  component: "component",
};
const STATIC_TYPES: readonly StaticViewType[] = [
  "systemLandscape",
  "systemContext",
  "container",
  "component",
];
/** What each view type lets the palette create (SPEC 5.1). */
const CREATABLE: Readonly<Record<StaticViewType, readonly Kind[]>> = {
  systemLandscape: ["person", "softwareSystem"],
  systemContext: ["person", "softwareSystem"],
  container: ["person", "softwareSystem", "container"],
  component: ["person", "softwareSystem", "container", "component"],
};
const LAYOUT_PREFIX = "c4modeler.";
const ELEMENT_PREFIX = "c4modeler.element.";
const RELATIONSHIP_PREFIX = "c4modeler.relationship.";
/** SPEC 3.4: what the DSL cannot store. */
const UNREPRESENTABLE = /\\(?:n|")|\\$/;

// Reading.

interface Token {
  readonly value: string;
  readonly quoted: boolean;
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < line.length) {
    const char = line[index];
    if (char === " " || char === "\t") {
      index += 1;
    } else if (char === '"') {
      let value = "";
      index += 1;
      while (index < line.length && line[index] !== '"') {
        if (line[index] === "\\" && index + 1 < line.length) {
          index += 1;
          value += line[index] === "n" ? "\n" : line[index];
        } else {
          value += line[index];
        }
        index += 1;
      }
      index += 1;
      tokens.push({ value, quoted: true });
    } else {
      let value = "";
      while (index < line.length && line[index] !== " " && line[index] !== "\t") {
        value += line[index];
        index += 1;
      }
      tokens.push({ value, quoted: false });
    }
  }
  return tokens;
}

type Frame =
  | { kind: "workspace" | "model" | "views" | "styles" | "ignored" }
  | { kind: "element"; element: TElement }
  | { kind: "view"; view: TView }
  | { kind: "properties"; view: TView }
  | { kind: "style"; style: TStyle }
  | { kind: "raw"; lines: string[]; done: (lines: string[]) => void; depth: number };

interface Scan {
  readonly model: TModel | undefined;
  readonly diagnostics: Diagnostic[];
  readonly offsets: Map<string, number>;
}

function emptyModel(): TModel {
  return {
    name: "",
    description: "",
    elements: [],
    relationships: [],
    views: [],
    styles: [],
    rawModel: [],
  };
}

function scanText(text: string): Scan {
  const lines = text.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const offsets = new Map<string, number>();
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const problem = (code: DiagnosticCode, line: number, message: string, rejects = true) => {
    const start = lineStarts[line] ?? text.length;
    diagnostics.push({
      severity: "error",
      code,
      message,
      range: { start, end: start + (lines[line]?.length ?? 0) },
      line: line + 1,
      column: 1,
      endLine: line + 1,
      endColumn: (lines[line]?.length ?? 0) + 1,
      rejects,
      anchor: lines[line]?.trim() ?? "",
    });
  };
  let model: TModel | undefined;
  const stack: Frame[] = [];
  let closedWorkspace = false;
  const identifiers = new Set<string>();
  const viewKeys = new Set<string>();

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    const top = stack.at(-1);
    if (top?.kind === "raw") {
      if (trimmed.endsWith("{")) top.depth += 1;
      if (trimmed === "}") {
        top.depth -= 1;
        if (top.depth === 0) {
          stack.pop();
          top.done(top.lines);
          return;
        }
      }
      top.lines.push(trimmed);
      return;
    }
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("#")) return;
    if (trimmed === "}") {
      const frame = stack.pop();
      if (!frame) problem("unexpected-close", index, "A closing brace has no block to close.");
      if (frame?.kind === "workspace") closedWorkspace = true;
      return;
    }
    const tokens = tokenize(trimmed);
    const last = tokens.at(-1);
    const opens = last?.value === "{" && !last.quoted;
    if (opens) tokens.pop();
    const word = tokens[0]?.value ?? "";
    const value = (position: number) => tokens[position]?.value ?? "";
    const push = (frame: Frame) => {
      if (opens) stack.push(frame);
    };

    if (!top) {
      if (!closedWorkspace && !model && word === "workspace" && opens) {
        model = emptyModel();
        model.name = value(1);
        model.description = value(2);
        stack.push({ kind: "workspace" });
      } else {
        problem("statement-outside-workspace", index, "Only one workspace block is allowed.");
      }
      return;
    }
    const current = model ?? emptyModel();
    switch (top.kind) {
      case "workspace":
        if (word === "model") push({ kind: "model" });
        else if (word === "views") push({ kind: "views" });
        else push({ kind: "ignored" });
        return;
      case "model":
      case "element": {
        const parent = top.kind === "element" ? top.element : undefined;
        if (value(1) === "=" && KINDS.includes(value(2) as Kind)) {
          const kind = value(2) as Kind;
          const allowedParent =
            kind === "container"
              ? parent?.kind === "softwareSystem"
              : kind === "component"
                ? parent?.kind === "container"
                : parent === undefined;
          if (!allowedParent) {
            problem("element-not-permitted", index, `A ${KIND_WORDS[kind]} is not allowed here.`);
            push({ kind: "ignored" });
            return;
          }
          const id = word;
          if (identifiers.has(id.toLowerCase())) {
            problem("duplicate-identifier", index, `The identifier ${id} is already in use.`);
            push({ kind: "ignored" });
            return;
          }
          identifiers.add(id.toLowerCase());
          offsets.set(id, lineStarts[index] ?? 0);
          const hasTechnology = kind === "container" || kind === "component";
          const tagsAt = hasTechnology ? 6 : 5;
          const element: TElement = {
            id,
            kind,
            name: value(3),
            description: value(4),
            technology: hasTechnology ? value(5) : "",
            tags: splitTags(value(tagsAt)),
            url: undefined,
            parentId: parent?.id,
          };
          current.elements.push(element);
          push({ kind: "element", element });
          return;
        }
        if (value(1) === "->") {
          current.relationships.push({
            sourceId: word,
            destinationId: value(2),
            description: value(3),
            technology: value(4),
            tags: splitTags(value(5)),
            url: undefined,
          });
          push({ kind: "ignored" });
          return;
        }
        if (parent && word === "url") {
          parent.url = value(1);
          return;
        }
        if (top.kind === "model" && word === "deploymentEnvironment" && opens) {
          const header = trimmed;
          stack.push({
            kind: "raw",
            lines: [],
            depth: 1,
            done: (body) => current.rawModel.push([header, ...body]),
          });
          return;
        }
        push({ kind: "ignored" });
        return;
      }
      case "views": {
        if (STATIC_TYPES.includes(word as StaticViewType) && opens) {
          const type = word as StaticViewType;
          const scoped = type !== "systemLandscape";
          const key = value(scoped ? 2 : 1);
          if (viewKeys.has(key.toLowerCase())) {
            problem("duplicate-view-key", index, `The view key ${key} is already in use.`);
          }
          viewKeys.add(key.toLowerCase());
          const view: TView = {
            type,
            scopeId: scoped ? value(1) : undefined,
            key,
            title: undefined,
            description: tokens[scoped ? 3 : 2]?.value,
            isDefault: false,
            statements: [],
            autoLayout: undefined,
            properties: [],
          };
          current.views.push(view);
          push({ kind: "view", view });
          return;
        }
        if (word === "dynamic" && opens) {
          const view: TRawView = {
            type: "dynamic",
            scopeId: value(1) === "*" ? undefined : value(1),
            key: value(2),
            description: tokens[3]?.value,
            lines: [],
            steps: [],
          };
          viewKeys.add(view.key.toLowerCase());
          current.views.push(view);
          stack.push({
            kind: "raw",
            lines: [],
            depth: 1,
            done: (body) => {
              view.lines = body;
              view.steps = body.flatMap((line): [string, string][] => {
                const step = tokenize(line);
                return step[1]?.value === "->"
                  ? [[step[0]?.value ?? "", step[2]?.value ?? ""]]
                  : [];
              });
            },
          });
          return;
        }
        if (word === "styles") {
          push({ kind: "styles" });
          return;
        }
        push({ kind: "ignored" });
        return;
      }
      case "view": {
        const view = top.view;
        if (word === "include" || word === "exclude") {
          view.statements.push({ kind: word, terms: tokens.slice(1).map((term) => term.value) });
        } else if (word === "title") {
          view.title = value(1);
        } else if (word === "description") {
          view.description = value(1);
        } else if (word === "default") {
          view.isDefault = true;
        } else if (word === "autoLayout") {
          view.autoLayout = tokens
            .slice(1)
            .map((token) => token.value)
            .join(" ");
        } else if (word === "properties") {
          push({ kind: "properties", view });
        } else {
          push({ kind: "ignored" });
        }
        return;
      }
      case "properties":
        if (tokens.length === 2) top.view.properties.push([value(0), value(1)]);
        return;
      case "styles":
        if (word === "element" && opens) {
          const style: TStyle = { tag: value(1), entries: [] };
          current.styles.push(style);
          push({ kind: "style", style });
        } else {
          push({ kind: "ignored" });
        }
        return;
      case "style":
        if (tokens.length === 2) top.style.entries.push([value(0), value(1)]);
        return;
      case "ignored":
        push({ kind: "ignored" });
        return;
    }
  });
  if (stack.length > 0) {
    problem("unclosed-block", Math.max(lines.length - 1, 0), "A block is not closed.");
  }
  if (model) {
    const ids = new Set(model.elements.map(({ id }) => id));
    model.relationships.forEach((relationship) => {
      if (!ids.has(relationship.sourceId) || !ids.has(relationship.destinationId)) {
        problem(
          "unresolved-reference",
          0,
          `The relationship ${relationship.sourceId} -> ${relationship.destinationId} names an element that does not exist.`,
        );
      }
    });
  }
  return { model, diagnostics, offsets };
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

// The semantic model.

const EDITABLE: FieldSource = {
  form: "positional",
  statement: 0,
  token: 0,
  editable: true,
  reason: undefined,
};
const FIELDS: readonly FieldName[] = [
  "name",
  "description",
  "technology",
  "metadata",
  "tags",
  "url",
];

function modelElement(element: TElement): ModelElement {
  return {
    id: element.id,
    identifier: element.id,
    implicit: false,
    kind: element.kind,
    archetype: undefined,
    parentId: element.parentId,
    name: element.name,
    description: element.description,
    technology: element.technology,
    metadata: "",
    tags: ["Element", KIND_TAGS[element.kind], ...element.tags],
    ownTags: [...element.tags],
    url: element.url,
    properties: {},
    group: undefined,
    fields: Object.fromEntries(FIELDS.map((field) => [field, EDITABLE])) as Record<
      FieldName,
      FieldSource
    >,
  };
}

function explicitRelationships(model: TModel): Relationship[] {
  const seen = new Map<string, number>();
  return model.relationships.map((relationship) => {
    const pair = `${relationship.sourceId}->${relationship.destinationId}`;
    const count = (seen.get(pair) ?? 0) + 1;
    seen.set(pair, count);
    const key = count === 1 ? pair : undefined;
    return {
      key,
      canvasKey: key ?? `${pair}#${count}`,
      identifier: undefined,
      sourceId: relationship.sourceId,
      destinationId: relationship.destinationId,
      description: relationship.description,
      technology: relationship.technology,
      tags: ["Relationship", ...relationship.tags],
      url: relationship.url,
      implied: false,
      impliedBy: undefined,
      bulk: false,
      fields: { description: EDITABLE, technology: EDITABLE, tags: EDITABLE, url: EDITABLE },
    };
  });
}

function autoLayoutOf(text: string | undefined): AutoLayout | undefined {
  if (text === undefined) return undefined;
  const [direction, rank, node] = text.split(/\s+/).filter((part) => part !== "");
  const rankDirection = (["tb", "bt", "lr", "rl"] as const).find((value) => value === direction);
  return {
    rankDirection: rankDirection ?? "tb",
    rankSeparation: rank === undefined ? 300 : Number(rank),
    nodeSeparation: node === undefined ? 300 : Number(node),
    edgeSeparation: 0,
    vertices: false,
  };
}

function viewDefinition(view: TView | TRawView): ViewDefinition {
  if (view.type === "dynamic") {
    return {
      key: view.key,
      keyGenerated: false,
      type: "dynamic",
      scopeId: view.scopeId,
      baseKey: undefined,
      title: undefined,
      description: view.description,
      isDefault: false,
      autoLayout: undefined,
      statements: [],
      properties: {},
      layout: { elements: new Map(), relationships: new Map(), unmatched: [], malformed: [] },
      editable: false,
      readOnlyReason: "type",
    };
  }
  const statements = view.statements.map((statement) => ({
    kind: statement.kind,
    terms: statement.terms.map((text) => ({ text, expression: parseExpression(text) })),
  }));
  const elements = new Map<ElementId, StoredBox>();
  const relationships = new Map<string, readonly Point[]>();
  for (const [key, value] of view.properties) {
    if (key.startsWith(ELEMENT_PREFIX)) {
      const box = decodeElementLayout(value);
      if (box) elements.set(key.slice(ELEMENT_PREFIX.length), box);
    } else if (key.startsWith(RELATIONSHIP_PREFIX)) {
      const points = decodeVertices(value);
      if (points) relationships.set(key.slice(RELATIONSHIP_PREFIX.length), points);
    }
  }
  const supported = statements.every((statement) =>
    statement.terms.every((term) => term.expression !== undefined),
  );
  return {
    key: view.key,
    keyGenerated: false,
    type: view.type,
    scopeId: view.scopeId,
    baseKey: undefined,
    title: view.title,
    description: view.description,
    isDefault: view.isDefault,
    autoLayout: autoLayoutOf(view.autoLayout),
    statements,
    properties: Object.fromEntries(view.properties),
    layout: { elements, relationships, unmatched: [], malformed: [] },
    editable: supported,
    readOnlyReason: supported ? undefined : "expression",
  };
}

function elementStyle(style: TStyle): ElementStyle {
  const entries = new Map(style.entries.map(([key, value]) => [key.toLowerCase(), value]));
  const shape = entries.get("shape");
  const shapeName = shape === undefined ? undefined : shapeNameOf(shape);
  return {
    tag: style.tag,
    ...(shapeName === undefined ? {} : { shape: shapeName }),
    ...(entries.has("background") ? { background: entries.get("background")!.toLowerCase() } : {}),
    ...(entries.has("color") ? { color: entries.get("color")!.toLowerCase() } : {}),
    ...(entries.has("stroke") ? { stroke: entries.get("stroke")!.toLowerCase() } : {}),
  };
}

function shapeNameOf(value: string): ShapeName | undefined {
  const names: readonly ShapeName[] = ["Box", "RoundedBox", "Cylinder", "Person", "Component"];
  return names.find((name) => name.toLowerCase() === value.toLowerCase());
}

function workspaceOf(model: TModel | undefined): Workspace {
  const source = model ?? emptyModel();
  const elements = source.elements.map(modelElement);
  const explicit = explicitRelationships(source);
  const parents = new Map<ElementId, ElementId>();
  for (const element of source.elements) {
    if (element.parentId !== undefined) parents.set(element.id, element.parentId);
  }
  const implied = impliedRelationships(
    explicit.map((relationship) => ({ relationship, strategy: "unless-any" as const })),
    { parents },
  );
  const dynamicReferences = new Map<
    ViewKey,
    { readonly elements: readonly ElementId[]; readonly relationships: readonly string[] }
  >();
  for (const view of source.views) {
    if (view.type !== "dynamic") continue;
    dynamicReferences.set(view.key, {
      elements: [...new Set(view.steps.flat())],
      relationships: view.steps.map(([from, to]) => `${from}->${to}`),
    });
  }
  return {
    name: source.name,
    description: source.description,
    elements,
    relationships: [...explicit, ...implied],
    views: source.views.map(viewDefinition),
    groups: [],
    styles: { elements: source.styles.map(elementStyle), relationships: [], themes: [] },
    terminology: defaultTerminology(),
    dynamicReferences,
    instances: new Map(),
    openWorld: false,
    opaqueTexts: [],
  };
}

function sourcesOf(offsets: ReadonlyMap<string, number>): SourceIndex {
  return {
    element: (id) => {
      const start = offsets.get(id);
      if (start === undefined) return undefined;
      return { definition: { range: { start, end: start } } as Statement, reopens: [] };
    },
    field: () => undefined,
    relationship: () => undefined,
    view: () => undefined,
    modelBlock: () => undefined,
    viewsBlock: () => undefined,
    stylesBlock: () => undefined,
    identifierModeAt: () => "flat",
    references: () => [],
  };
}

export function parseText(text: string): ParseResult {
  const scanned = text.trim() === "" ? undefined : scanText(text);
  const diagnostics = scanned?.diagnostics ?? [];
  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.rejects),
    text,
    cst: {
      text,
      bom: false,
      lineBreak: "\n",
      indentUnit: INDENT,
      endsWithLineBreak: text.endsWith("\n"),
      nodes: [],
      syntaxDiagnostics: [],
    },
    workspace: workspaceOf(scanned?.model),
    diagnostics,
    sources: sourcesOf(scanned?.offsets ?? new Map()),
  };
}

function modelOf(text: string): TModel | undefined {
  return text.trim() === "" ? undefined : scanText(text).model;
}

// Printing.

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/** Positional values up to the last one given, the empty ones before it as `""`. */
function positional(values: readonly string[]): string {
  let last = values.length;
  while (last > 0 && values[last - 1] === "") last -= 1;
  return values
    .slice(0, last)
    .map((value) => ` ${quote(value)}`)
    .join("");
}

function term(value: string): string {
  return /[\s"]/.test(value) ? quote(value) : value;
}

function printElement(model: TModel, element: TElement, depth: number, out: string[]): void {
  const indent = INDENT.repeat(depth);
  const hasTechnology = element.kind === "container" || element.kind === "component";
  const values = hasTechnology
    ? [element.name, element.description, element.technology, element.tags.join(",")]
    : [element.name, element.description, element.tags.join(",")];
  const children = model.elements.filter((child) => child.parentId === element.id);
  const head = `${indent}${element.id} = ${element.kind}${positional(values)}`;
  if (children.length === 0 && element.url === undefined) {
    out.push(head);
    return;
  }
  out.push(`${head} {`);
  if (element.url !== undefined) out.push(`${indent}${INDENT}url ${quote(element.url)}`);
  for (const child of children) printElement(model, child, depth + 1, out);
  out.push(`${indent}}`);
}

function printView(view: TView | TRawView, out: string[]): void {
  const indent = INDENT.repeat(2);
  const inner = INDENT.repeat(3);
  if (view.type === "dynamic") {
    out.push(
      `${indent}dynamic ${view.scopeId ?? "*"} ${quote(view.key)}${view.description === undefined ? "" : ` ${quote(view.description)}`} {`,
    );
    for (const line of view.lines) out.push(`${inner}${line}`);
    out.push(`${indent}}`);
    return;
  }
  const scope = view.scopeId === undefined ? "" : ` ${view.scopeId}`;
  const description = view.description === undefined ? "" : ` ${quote(view.description)}`;
  out.push(`${indent}${view.type}${scope} ${quote(view.key)}${description} {`);
  if (view.title !== undefined) out.push(`${inner}title ${quote(view.title)}`);
  if (view.isDefault) out.push(`${inner}default`);
  for (const statement of view.statements) {
    out.push(`${inner}${statement.kind} ${statement.terms.map(term).join(" ")}`);
  }
  if (view.autoLayout !== undefined) out.push(`${inner}autoLayout ${view.autoLayout}`.trimEnd());
  if (view.properties.length > 0) {
    out.push(`${inner}properties {`);
    for (const [key, value] of view.properties) {
      out.push(`${inner}${INDENT}${quote(key)} ${quote(value)}`);
    }
    out.push(`${inner}}`);
  }
  out.push(`${indent}}`);
}

export function printModel(model: TModel): string {
  const out: string[] = [];
  out.push(`workspace${positional([model.name, model.description])} {`);
  out.push(`${INDENT}model {`);
  for (const element of model.elements.filter(({ parentId }) => parentId === undefined)) {
    printElement(model, element, 2, out);
  }
  for (const relationship of model.relationships) {
    const values = [relationship.description, relationship.technology, relationship.tags.join(",")];
    out.push(
      `${INDENT.repeat(2)}${relationship.sourceId} -> ${relationship.destinationId}${positional(values)}`,
    );
  }
  for (const block of model.rawModel) {
    const [header, ...body] = block;
    out.push(`${INDENT.repeat(2)}${header ?? ""}`);
    for (const line of body) out.push(`${INDENT.repeat(3)}${line}`);
    out.push(`${INDENT.repeat(2)}}`);
  }
  out.push(`${INDENT}}`);
  out.push(`${INDENT}views {`);
  for (const view of model.views) printView(view, out);
  if (model.styles.length > 0) {
    out.push(`${INDENT.repeat(2)}styles {`);
    for (const style of model.styles) {
      out.push(`${INDENT.repeat(3)}element ${quote(style.tag)} {`);
      for (const [key, value] of style.entries) out.push(`${INDENT.repeat(4)}${key} ${value}`);
      out.push(`${INDENT.repeat(3)}}`);
    }
    out.push(`${INDENT.repeat(2)}}`);
  }
  out.push(`${INDENT}}`);
  out.push("}");
  return `${out.join("\n")}\n`;
}

// Editing.

class Refused extends Error {
  constructor(
    readonly reason: EditRefusal,
    message: string,
  ) {
    super(message);
  }
}

interface EditState {
  readonly model: TModel;
  readonly before: ParseResult;
  readonly context: EditContext;
  readonly fresh: Set<ElementId>;
  readonly idChanges: IdChange[];
  readonly created: { elements: ElementId[]; relationships: string[] };
  createdView: ViewKey | undefined;
}

function catalogBefore(state: EditState): ViewCatalog {
  return viewCatalog(state.before.workspace);
}

function snapshot(state: EditState): Workspace {
  return parseText(printModel(state.model)).workspace;
}

function writtenView(model: TModel, key: ViewKey): TView | undefined {
  const view = model.views.find((candidate) => candidate.key === key);
  return view && view.type !== "dynamic" ? view : undefined;
}

function newView(entry: Pick<ViewEntry, "key" | "type" | "scopeId">, title?: string): TView {
  return {
    type: entry.type as StaticViewType,
    scopeId: entry.scopeId,
    key: entry.key,
    title,
    description: undefined,
    isDefault: false,
    statements: [{ kind: "include", terms: ["*"] }],
    autoLayout: NEW_VIEW_AUTO_LAYOUT,
    properties: [],
  };
}

/** The first view written into a workspace without one writes every implicit view (SPEC 4.2). */
function writeImplicitViews(state: EditState): void {
  if (state.model.views.length > 0) return;
  for (const entry of catalogBefore(state).list()) {
    if (entry.state === "implicit") state.model.views.push(newView(entry));
  }
}

function materialize(state: EditState, key: ViewKey): TView {
  const existing = writtenView(state.model, key);
  if (existing) return existing;
  const entry = catalogBefore(state).resolve(key);
  if (!entry || !STATIC_TYPES.includes(entry.type as StaticViewType)) {
    throw new Refused("view-not-editable", "This view can't be edited on the canvas.");
  }
  writeImplicitViews(state);
  const written = writtenView(state.model, key);
  if (written) return written;
  const view = newView(entry);
  state.model.views.push(view);
  return view;
}

function setProperty(view: TView, name: string, value: string | null): void {
  view.properties = view.properties.filter(([key]) => key !== name);
  if (value !== null) view.properties.push([name, value]);
  view.properties.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function shapeOfElement(model: TModel, element: TElement): ShapeName {
  const styled = model.styles.find(
    (style) =>
      element.tags.includes(style.tag) &&
      style.entries.some(([key]) => key.toLowerCase() === "shape"),
  );
  const shape = styled && shapeNameOf(styled.entries.find(([key]) => key === "shape")?.[1] ?? "");
  return shape ?? defaultShape(element.kind);
}

function storedBox(model: TModel, element: TElement, box: Box): string {
  const size = defaultSize(shapeOfElement(model, element));
  const sameSize = Math.round(box.width) === size.width && Math.round(box.height) === size.height;
  return encodeElementLayout(
    sameSize
      ? { x: box.x, y: box.y }
      : { x: box.x, y: box.y, width: box.width, height: box.height },
  );
}

/** The first geometry or graph edit of a view writes every box the user sees (SPEC 3.6). */
function pin(state: EditState, view: TView): void {
  if (view.properties.some(([key]) => key.startsWith(ELEMENT_PREFIX))) return;
  for (const [id, box] of state.context.boxes) {
    const element = state.model.elements.find((candidate) => candidate.id === id);
    if (element) setProperty(view, elementLayoutKey(id), storedBox(state.model, element, box));
  }
}

function currentEntry(state: EditState): ViewEntry {
  const entry = catalogBefore(state).resolve(state.context.view);
  if (!entry) throw new Refused("view-not-editable", "The view is gone.");
  return entry;
}

function element(state: EditState, id: ElementId): TElement {
  const found = state.model.elements.find((candidate) => candidate.id === id);
  if (!found) throw new Refused("not-allowed", `There is no element ${id}.`);
  return found;
}

function descendantsOf(model: TModel, ids: ReadonlySet<ElementId>): Set<ElementId> {
  const all = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const candidate of model.elements) {
      if (
        candidate.parentId !== undefined &&
        all.has(candidate.parentId) &&
        !all.has(candidate.id)
      ) {
        all.add(candidate.id);
        grew = true;
      }
    }
  }
  return all;
}

function isAncestorOf(model: TModel, ancestor: ElementId, id: ElementId): boolean {
  let current = model.elements.find((candidate) => candidate.id === id)?.parentId;
  while (current !== undefined) {
    if (current === ancestor) return true;
    current = model.elements.find((candidate) => candidate.id === current)?.parentId;
  }
  return false;
}

function representable(...values: readonly (string | undefined | null)[]): void {
  if (values.some((value) => typeof value === "string" && UNREPRESENTABLE.test(value))) {
    throw new Refused(
      "unrepresentable-value",
      "A backslash before n or a quote, or a backslash at the end, can't be stored in the DSL.",
    );
  }
}

function sameNamespace(model: TModel, kind: Kind, parentId: ElementId | undefined): TElement[] {
  return model.elements.filter((candidate) =>
    parentId === undefined
      ? candidate.parentId === undefined &&
        (candidate.kind === "person" || candidate.kind === "softwareSystem") ===
          (kind === "person" || kind === "softwareSystem")
      : candidate.parentId === parentId,
  );
}

function takenIdentifiers(model: TModel, except?: ElementId) {
  return {
    taken: new Set(
      model.elements.filter(({ id }) => id !== except).map(({ id }) => id.toLowerCase()),
    ),
    archetypes: new Set<string>(),
  };
}

function renameEverywhere(state: EditState, from: ElementId, to: ElementId): void {
  const { model } = state;
  const renamePair = (key: string) => {
    const [source, destination] = key.split("->");
    if (source === undefined || destination === undefined) return key;
    return `${source === from ? to : source}->${destination === from ? to : destination}`;
  };
  for (const candidate of model.elements) {
    if (candidate.id === from) candidate.id = to;
    if (candidate.parentId === from) candidate.parentId = to;
  }
  state.idChanges.push({ kind: "element", from, to });
  for (const relationship of model.relationships) {
    if (relationship.sourceId !== from && relationship.destinationId !== from) continue;
    const before = `${relationship.sourceId}->${relationship.destinationId}`;
    if (relationship.sourceId === from) relationship.sourceId = to;
    if (relationship.destinationId === from) relationship.destinationId = to;
    state.idChanges.push({
      kind: "relationship",
      from: before,
      to: `${relationship.sourceId}->${relationship.destinationId}`,
    });
  }
  for (const view of model.views) {
    if (view.scopeId === from) view.scopeId = to;
    if (view.type === "dynamic") {
      view.steps = view.steps.map(([a, b]) => [a === from ? to : a, b === from ? to : b]);
      view.lines = view.lines.map((line) => {
        const tokens = tokenize(line);
        if (tokens[1]?.value !== "->") return line;
        return line.replace(
          `${tokens[0]?.value} -> ${tokens[2]?.value}`,
          `${tokens[0]?.value === from ? to : tokens[0]?.value} -> ${tokens[2]?.value === from ? to : tokens[2]?.value}`,
        );
      });
      continue;
    }
    for (const statement of view.statements) {
      statement.terms = statement.terms.map((value) =>
        value === from ? to : value.includes("->") ? renamePair(value) : value,
      );
    }
    view.properties = view.properties.map(([key, value]): [string, string] => {
      if (key === elementLayoutKey(from)) return [elementLayoutKey(to), value];
      if (key.startsWith(RELATIONSHIP_PREFIX)) {
        return [relationshipLayoutKey(renamePair(key.slice(RELATIONSHIP_PREFIX.length))), value];
      }
      return [key, value];
    });
    view.properties.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  }
}

function placeholderName(
  state: EditState,
  kind: Kind,
  parentId: string | undefined,
  database: boolean,
) {
  const word = database ? "Database" : KIND_TAGS[kind];
  const names = new Set(sameNamespace(state.model, kind, parentId).map(({ name }) => name));
  if (!names.has(word)) return word;
  for (let number = 2; ; number += 1) {
    if (!names.has(`${word} ${number}`)) return `${word} ${number}`;
  }
}

function parentFor(state: EditState, entry: ViewEntry, kind: Kind): string | undefined {
  if (kind === "person" || kind === "softwareSystem") return undefined;
  if (kind === "component") {
    if (entry.type !== "component" || entry.scopeId === undefined) {
      throw new Refused("not-allowed", "A component goes into a component view.");
    }
    return entry.scopeId;
  }
  if (entry.type === "container") return entry.scopeId;
  if (entry.type === "component" && entry.scopeId !== undefined) {
    return element(state, entry.scopeId).parentId;
  }
  throw new Refused("not-allowed", "A container goes into a container or component view.");
}

function includeIfMissing(state: EditState, view: TView, ids: readonly ElementId[]): void {
  const workspace = snapshot(state);
  const entry = viewCatalog(workspace).resolve(view.key);
  if (!entry) return;
  const members = new Set(viewMembers(workspace, entry).elements);
  for (const id of ids) {
    if (members.has(id)) continue;
    const before = view.statements.length;
    for (const statement of view.statements) {
      if (statement.kind === "exclude") statement.terms = statement.terms.filter((t) => t !== id);
    }
    view.statements = view.statements.filter((statement) => statement.terms.length > 0);
    const after = snapshot(state);
    const again = viewCatalog(after).resolve(view.key);
    if (
      before !== view.statements.length &&
      again &&
      viewMembers(after, again).elements.includes(id)
    ) {
      continue;
    }
    view.statements.push({ kind: "include", terms: [id] });
  }
}

function createElement(state: EditState, edit: Extract<C4Edit, { type: "createElement" }>): void {
  const entry = currentEntry(state);
  if (!entry.editable) throw new Refused("view-not-editable", "This view is read-only.");
  const type = entry.type as StaticViewType;
  if (!CREATABLE[type].includes(edit.kind)) {
    throw new Refused("not-allowed", `A ${KIND_WORDS[edit.kind]} can't go into this view.`);
  }
  const parentId = parentFor(state, entry, edit.kind);
  const view = materialize(state, entry.key);
  pin(state, view);
  const database = edit.tags?.includes("Database") ?? false;
  if (edit.name !== undefined) {
    representable(edit.name);
    const taken = sameNamespace(state.model, edit.kind, parentId).some(
      (candidate) => candidate.name === edit.name,
    );
    if (taken) {
      throw new Refused(
        "name-taken",
        `A ${KIND_WORDS[edit.kind]} named ${edit.name} already exists.`,
      );
    }
  }
  const name = edit.name ?? placeholderName(state, edit.kind, parentId, database);
  let id: string;
  if (edit.name === undefined) {
    const taken = takenIdentifiers(state.model).taken;
    do id = `${edit.kind}_${state.context.random()}`;
    while (taken.has(id.toLowerCase()));
    state.fresh.add(id);
  } else {
    id = deriveIdentifier(name, edit.kind, takenIdentifiers(state.model), "flat");
  }
  const created: TElement = {
    id,
    kind: edit.kind,
    name,
    description: "",
    technology: "",
    tags: [...(edit.tags ?? [])],
    url: undefined,
    parentId,
  };
  state.model.elements.push(created);
  if (database && !state.model.styles.some((style) => style.tag === "Database")) {
    state.model.styles.push({ tag: "Database", entries: [["shape", "cylinder"]] });
  }
  const size = edit.size ?? defaultSize(shapeOfElement(state.model, created));
  setProperty(
    view,
    elementLayoutKey(id),
    storedBox(state.model, created, {
      x: edit.center.x - size.width / 2,
      y: edit.center.y - size.height / 2,
      ...size,
    }),
  );
  includeIfMissing(state, view, [id]);
  state.created.elements.push(id);
}

function createRelationship(
  state: EditState,
  edit: Extract<C4Edit, { type: "createRelationship" }>,
): void {
  const { model } = state;
  element(state, edit.sourceId);
  element(state, edit.destinationId);
  if (
    edit.sourceId === edit.destinationId ||
    isAncestorOf(model, edit.sourceId, edit.destinationId) ||
    isAncestorOf(model, edit.destinationId, edit.sourceId)
  ) {
    throw new Refused("not-allowed", "These elements can't be connected.");
  }
  const description = edit.description ?? "";
  representable(description, edit.technology);
  const existing = snapshot(state).relationships.find(
    (relationship) =>
      relationship.sourceId === edit.sourceId &&
      relationship.destinationId === edit.destinationId &&
      relationship.description === description,
  );
  if (existing) {
    throw new Refused(
      "relationship-exists",
      existing.implied
        ? "An implied relationship already connects these. Give the new one a description."
        : "These are already connected by a relationship without a description.",
    );
  }
  const entry = currentEntry(state);
  if (entry.editable) pin(state, materialize(state, entry.key));
  model.relationships.push({
    sourceId: edit.sourceId,
    destinationId: edit.destinationId,
    description,
    technology: edit.technology ?? "",
    tags: [],
    url: undefined,
  });
  const count = model.relationships.filter(
    (relationship) =>
      relationship.sourceId === edit.sourceId && relationship.destinationId === edit.destinationId,
  ).length;
  const pair = `${edit.sourceId}->${edit.destinationId}`;
  state.created.relationships.push(count === 1 ? pair : `${pair}#${count}`);
}

function updateElement(state: EditState, edit: Extract<C4Edit, { type: "updateElement" }>): void {
  const target = element(state, edit.id);
  const { fields } = edit;
  representable(
    fields.name,
    fields.description,
    fields.technology,
    fields.url,
    ...(fields.tags ?? []),
  );
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (name === "") throw new Refused("unrepresentable-value", "An element needs a name.");
    const taken = sameNamespace(state.model, target.kind, target.parentId).some(
      (candidate) => candidate !== target && candidate.name === name,
    );
    if (taken) {
      throw new Refused("name-taken", `A ${KIND_WORDS[target.kind]} named ${name} already exists.`);
    }
  }
  const oldName = target.name;
  if (fields.name !== undefined) target.name = fields.name.trim();
  if (fields.description !== undefined) target.description = fields.description;
  if (fields.technology !== undefined) target.technology = fields.technology;
  if (fields.tags !== undefined) target.tags = [...fields.tags];
  if (fields.url !== undefined)
    target.url = fields.url === null || fields.url === "" ? undefined : fields.url;
  if (!state.fresh.has(edit.id) || fields.name === undefined || target.name === oldName) return;
  let identifier = deriveIdentifier(
    target.name,
    target.kind,
    takenIdentifiers(state.model, edit.id),
    "flat",
  );
  if (state.context.identifiers === "collision-free") {
    identifier = `${identifier}_${state.context.random()}`;
  }
  state.fresh.delete(edit.id);
  if (identifier !== edit.id) renameEverywhere(state, edit.id, identifier);
}

function updateRelationship(
  state: EditState,
  edit: Extract<C4Edit, { type: "updateRelationship" }>,
): void {
  const keys = explicitRelationships(state.model);
  const index = keys.findIndex((relationship) => relationship.canvasKey === edit.key);
  const relationship = state.model.relationships[index];
  if (!relationship) {
    throw new Refused(
      "not-allowed",
      "An implied relationship can't be edited. Edit the relationship it comes from.",
    );
  }
  const { fields } = edit;
  representable(fields.description, fields.technology, fields.url, ...(fields.tags ?? []));
  if (fields.description !== undefined) relationship.description = fields.description;
  if (fields.technology !== undefined) relationship.technology = fields.technology;
  if (fields.tags !== undefined) relationship.tags = [...fields.tags];
  if (fields.url !== undefined)
    relationship.url = fields.url === null || fields.url === "" ? undefined : fields.url;
}

function renameIdentifier(
  state: EditState,
  edit: Extract<C4Edit, { type: "renameIdentifier" }>,
): void {
  element(state, edit.id);
  if (edit.identifier === edit.id) return;
  if (!isValidIdentifier(edit.identifier) || isKeyword(edit.identifier)) {
    throw new Refused("identifier-invalid", `${edit.identifier} can't be an identifier.`);
  }
  if (takenIdentifiers(state.model, edit.id).taken.has(edit.identifier.toLowerCase())) {
    throw new Refused("identifier-taken", `The identifier ${edit.identifier} is already in use.`);
  }
  state.fresh.delete(edit.id);
  renameEverywhere(state, edit.id, edit.identifier);
}

function setLayout(state: EditState, edit: Extract<C4Edit, { type: "setLayout" }>): void {
  const entry = currentEntry(state);
  if (!entry.editable) throw new Refused("view-not-editable", "This view is read-only.");
  const view = materialize(state, entry.key);
  pin(state, view);
  for (const [id, box] of edit.boxes) {
    setProperty(view, elementLayoutKey(id), storedBox(state.model, element(state, id), box));
  }
  for (const [key, points] of edit.vertices) {
    setProperty(
      view,
      relationshipLayoutKey(key),
      points === null || points.length === 0 ? null : encodeVertices(points),
    );
  }
}

function deleteFromModel(
  state: EditState,
  ids: readonly ElementId[],
  relationships: readonly string[],
): void {
  const { model } = state;
  for (const id of ids) element(state, id);
  const doomed = descendantsOf(model, new Set(ids));
  const keys = explicitRelationships(model);
  const goneKeys = new Set<string>();
  model.relationships = model.relationships.filter((relationship, index) => {
    const key = keys[index]?.canvasKey ?? "";
    const goes =
      doomed.has(relationship.sourceId) ||
      doomed.has(relationship.destinationId) ||
      relationships.includes(key);
    if (goes) goneKeys.add(key);
    return !goes;
  });
  model.elements = model.elements.filter(({ id }) => !doomed.has(id));
  model.views = model.views.filter(
    (view) => view.scopeId === undefined || !doomed.has(view.scopeId),
  );
  for (const view of model.views) {
    if (view.type === "dynamic") continue;
    for (const statement of view.statements) {
      statement.terms = statement.terms.filter((value) => {
        if (doomed.has(value) || goneKeys.has(value)) return false;
        const [source, destination] = value.split("->");
        return !(
          destination !== undefined &&
          (doomed.has(source ?? "") || doomed.has(destination))
        );
      });
    }
    view.statements = view.statements.filter((statement) => statement.terms.length > 0);
    view.properties = view.properties.filter(([key]) => {
      if (key.startsWith(ELEMENT_PREFIX)) return !doomed.has(key.slice(ELEMENT_PREFIX.length));
      if (!key.startsWith(RELATIONSHIP_PREFIX)) return true;
      const relationship = key.slice(RELATIONSHIP_PREFIX.length);
      const [source, destination] = relationship.replace(/^implied:/, "").split("->");
      return !(
        goneKeys.has(relationship) ||
        doomed.has(source ?? "") ||
        doomed.has(destination ?? "")
      );
    });
  }
  for (const id of doomed) state.fresh.delete(id);
}

function removeFromView(
  state: EditState,
  ids: readonly ElementId[],
  relationships: readonly string[],
): void {
  const entry = currentEntry(state);
  if (!entry.editable) throw new Refused("view-not-editable", "This view is read-only.");
  const view = materialize(state, entry.key);
  for (const id of ids) {
    for (const statement of view.statements) {
      if (statement.kind === "include") statement.terms = statement.terms.filter((t) => t !== id);
    }
    view.statements = view.statements.filter((statement) => statement.terms.length > 0);
    const workspace = snapshot(state);
    const again = viewCatalog(workspace).resolve(view.key);
    if (again && viewMembers(workspace, again).elements.includes(id)) {
      view.statements.push({ kind: "exclude", terms: [id] });
    }
    setProperty(view, elementLayoutKey(id), null);
  }
  for (const key of relationships) {
    const pair = key.replace(/^implied:/, "").replace(/#\d+$/, "");
    view.statements.push({ kind: "exclude", terms: [pair] });
    setProperty(view, relationshipLayoutKey(key), null);
  }
}

/** From the model what no other written view shows, else from this view (SPEC 5.4). */
function smartDelete(state: EditState, edit: Extract<C4Edit, { type: "smartDelete" }>): void {
  const workspace = state.before.workspace;
  const others = catalogBefore(state)
    .list()
    .filter(
      (entry) => entry.state === "written" && entry.key !== state.context.view && entry.editable,
    )
    .map((entry) => ({ entry, members: viewMembers(workspace, entry) }));
  const dynamic = [...workspace.dynamicReferences.values()];
  const subtree = (id: ElementId) => descendantsOf(state.model, new Set([id]));
  const fromView: ElementId[] = [];
  const fromModel: ElementId[] = [];
  for (const id of edit.ids) {
    const all = subtree(id);
    const elsewhere =
      others.some(
        ({ entry, members }) =>
          (entry.scopeId !== undefined && all.has(entry.scopeId)) ||
          members.elements.some((member) => all.has(member)),
      ) || dynamic.some((references) => references.elements.some((member) => all.has(member)));
    (elsewhere ? fromView : fromModel).push(id);
  }
  const relationshipsFromView: string[] = [];
  const relationshipsFromModel: string[] = [];
  for (const key of edit.relationships) {
    const implied = workspace.relationships.find(
      (relationship) => relationship.canvasKey === key,
    )?.implied;
    const elsewhere =
      implied === true ||
      others.some(({ members }) => members.relationships.includes(key)) ||
      dynamic.some((references) => references.relationships.includes(key));
    (elsewhere ? relationshipsFromView : relationshipsFromModel).push(key);
  }
  if (fromModel.length > 0 || relationshipsFromModel.length > 0) {
    deleteFromModel(state, fromModel, relationshipsFromModel);
  }
  if (fromView.length > 0 || relationshipsFromView.length > 0) {
    removeFromView(state, fromView, relationshipsFromView);
  }
}

function createView(state: EditState, edit: Extract<C4Edit, { type: "createView" }>): void {
  const scopeKind =
    edit.viewType === "component"
      ? "container"
      : edit.viewType === "systemLandscape"
        ? undefined
        : "softwareSystem";
  if (scopeKind !== undefined) {
    const scope = edit.scopeId === undefined ? undefined : element(state, edit.scopeId);
    if (scope?.kind !== scopeKind) throw new Refused("not-allowed", "Choose a scope for the view.");
  }
  if (edit.title !== undefined) representable(edit.title);
  writeImplicitViews(state);
  const key = draftKey(edit.viewType, edit.scopeId, snapshot(state));
  const fresh = newView(
    {
      key,
      type: edit.viewType,
      scopeId: edit.viewType === "systemLandscape" ? undefined : edit.scopeId,
    },
    edit.title === "" ? undefined : edit.title,
  );
  state.model.views.push(fresh);
  state.createdView = key;
}

function updateView(state: EditState, edit: Extract<C4Edit, { type: "updateView" }>): void {
  const view = materialize(state, edit.key);
  representable(edit.fields.title, edit.fields.description);
  if (edit.fields.title !== undefined) view.title = edit.fields.title ?? undefined;
  if (edit.fields.description !== undefined) {
    view.description =
      edit.fields.description === "" ? undefined : (edit.fields.description ?? undefined);
  }
}

function deleteView(state: EditState, edit: Extract<C4Edit, { type: "deleteView" }>): void {
  if (!writtenView(state.model, edit.key)) {
    throw new Refused("not-allowed", "This view isn't in the file.");
  }
  state.model.views = state.model.views.filter((view) => view.key !== edit.key);
}

function clearLayout(state: EditState): void {
  const view = writtenView(state.model, state.context.view);
  if (!view) return;
  view.properties = view.properties.filter(([key]) => !key.startsWith(LAYOUT_PREFIX));
}

function applyC4Colours(state: EditState): void {
  for (const colour of C4_COLOUR_STYLES) {
    let style = state.model.styles.find((candidate) => candidate.tag === colour.tag);
    if (!style) {
      style = { tag: colour.tag, entries: [] };
      state.model.styles.push(style);
    }
    for (const [key, value] of [
      ["background", colour.background],
      ["color", colour.color],
      ["stroke", colour.stroke],
    ] as const) {
      style.entries = style.entries.filter(([name]) => name !== key);
      style.entries.push([key, value]);
    }
  }
}

function diffOf(before: string, after: string): { edits: TextEdit[]; inverse: TextEdit[] } {
  if (before === after) return { edits: [], inverse: [] };
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return {
    edits: [{ start, end: endBefore, insert: after.slice(start, endAfter) }],
    inverse: [{ start, end: endAfter, insert: before.slice(start, endBefore) }],
  };
}

export function applyTextEditsTo(text: string, edits: readonly TextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.insert + result.slice(edit.end);
  }
  return result;
}

/** SPEC 3.4 step 5: the created view, the current one or its re-keyed draft, a parent, the default. */
function viewAfter(state: EditState, after: ParseResult): ViewKey {
  if (state.createdView !== undefined) return state.createdView;
  const before = catalogBefore(state);
  const catalog = viewCatalog(after.workspace);
  const current = before.resolve(state.context.view);
  let key = state.context.view;
  if (current && current.state !== "written" && current.scopeId !== undefined) {
    const change = state.idChanges.find(
      (candidate) => candidate.kind === "element" && candidate.from === current.scopeId,
    );
    if (change) key = catalog.draftFor(current.type as StaticViewType, change.to).key;
  }
  if (catalog.resolve(key)) return key;
  for (
    let parent = before.parentOf(state.context.view);
    parent;
    parent = before.parentOf(parent.key)
  ) {
    if (catalog.resolve(parent.key)) return parent.key;
  }
  return catalog.defaultView().key;
}

function run(state: EditState, edit: C4Edit): void {
  switch (edit.type) {
    case "createElement":
      return createElement(state, edit);
    case "createRelationship":
      return createRelationship(state, edit);
    case "updateElement":
      return updateElement(state, edit);
    case "updateRelationship":
      return updateRelationship(state, edit);
    case "renameIdentifier":
      return renameIdentifier(state, edit);
    case "setLayout":
      return setLayout(state, edit);
    case "smartDelete":
      return smartDelete(state, edit);
    case "deleteFromModel":
      return deleteFromModel(state, edit.ids, edit.relationships);
    case "removeFromView":
      return removeFromView(state, edit.ids, edit.relationships);
    case "includeInView": {
      const entry = currentEntry(state);
      if (!entry.editable) throw new Refused("view-not-editable", "This view is read-only.");
      for (const id of edit.ids) element(state, id);
      return includeIfMissing(state, materialize(state, entry.key), edit.ids);
    }
    case "createView":
      return createView(state, edit);
    case "updateView":
      return updateView(state, edit);
    case "deleteView":
      return deleteView(state, edit);
    case "clearLayout":
      return clearLayout(state);
    case "updateWorkspace":
      representable(edit.fields.name, edit.fields.description);
      if (edit.fields.name !== undefined) state.model.name = edit.fields.name;
      if (edit.fields.description !== undefined) state.model.description = edit.fields.description;
      return;
    case "applyC4Colours":
      return applyC4Colours(state);
    case "insertExample":
      throw new Refused("not-allowed", "The interaction engine inserts no example.");
  }
}

export function applyEditTo(
  document: ParseResult,
  edit: C4Edit,
  context: EditContext,
): EditOutcome {
  const state: EditState = {
    model: modelOf(document.text) ?? emptyModel(),
    before: document,
    context,
    fresh: new Set(context.fresh),
    idChanges: [],
    created: { elements: [], relationships: [] },
    createdView: undefined,
  };
  try {
    run(state, edit);
  } catch (error) {
    if (error instanceof Refused)
      return { ok: false, reason: error.reason, message: error.message };
    throw error;
  }
  const printed = printModel(state.model);
  const text =
    printed === printModel(modelOf(document.text) ?? emptyModel()) ? document.text : printed;
  const after = text === document.text ? document : parseText(text);
  if (!after.ok) {
    return { ok: false, reason: "verification-failed", message: "The edit broke the text." };
  }
  const { edits, inverse } = diffOf(document.text, text);
  return {
    ok: true,
    text,
    edits,
    inverse,
    document: after,
    view: viewAfter(state, after),
    fresh: state.fresh,
    idChanges: state.idChanges,
    created: state.created,
    notices: [],
  };
}

/** Records every edit it is asked for, and can refuse the next one. */
export interface InteractionEngine extends C4Engine {
  readonly edits: C4Edit[];
  refuseNext(reason: EditRefusal, message: string): void;
}

export function createInteractionEngine(): InteractionEngine {
  const edits: C4Edit[] = [];
  let refusal: { reason: EditRefusal; message: string } | undefined;
  const canonical = (parse: ParseResult) => printModel(modelOf(parse.text) ?? emptyModel());
  return {
    edits,
    refuseNext(reason, message) {
      refusal = { reason, message };
    },
    parse: parseText,
    applyEdit(document, edit, context) {
      edits.push(edit);
      const refused = refusal;
      refusal = undefined;
      if (refused) return { ok: false, ...refused };
      return applyEditTo(document, edit, context);
    },
    applyTextEdits: applyTextEditsTo,
    semanticallyEqual: (left, right) => left.ok && right.ok && canonical(left) === canonical(right),
    catalog: viewCatalog,
    members: viewMembers,
    layout: layoutView,
  };
}
